import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  DoctorAvailability,
  ModelType,
  NotificationItem,
  PriorityLevel,
  TokenStatus,
  UserRole,
  WhatIfInput,
  WSEvent,
} from './src/shared/types.ts';
import { HospitalStore, verifySessionToken } from './server/store.ts';

async function startServer() {
  const app = express();
  app.use(express.json());

  const store = new HospitalStore();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastEvent(event: WSEvent) {
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  function broadcastSync(notifications: NotificationItem[] = []) {
    broadcastEvent({
      type: 'state:sync',
      payload: store.getBootstrapPayload(),
    });
    for (const notif of notifications) {
      broadcastEvent({
        type: 'notification:new',
        payload: notif,
      });
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:sync',
        payload: store.getBootstrapPayload(),
      } satisfies WSEvent)
    );
  });

  // Auth helper middleware
  function getAuthUser(req: express.Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const userId = verifySessionToken(token);
    if (!userId) return null;
    return store.getUserById(userId);
  }

  // ============================================================
  // Auth Routes
  // ============================================================
  app.post('/api/auth/register', (req, res) => {
    const result = store.registerPatient(req.body || {});
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    broadcastSync();
    res.status(201).json(result);
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const result = store.login(String(email || ''), String(password || ''));
    if ('error' in result) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/auth/demo-login', (req, res) => {
    const role = (req.body?.role || 'patient') as UserRole;
    const validRoles: UserRole[] = ['patient', 'doctor', 'receptionist', 'admin'];
    const safeRole = validRoles.includes(role) ? role : 'patient';
    const result = store.demoLogin(safeRole);
    res.json(result);
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Session expired or invalid.' });
      return;
    }
    res.json({ user });
  });

  app.patch('/api/patient/profile', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const updated = store.updatePatientProfile(user.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user: updated });
  });

  // ============================================================
  // Hospital Bootstrap & Queue Operations
  // ============================================================
  app.get('/api/bootstrap', (_req, res) => {
    res.json(store.getBootstrapPayload());
  });

  app.post('/api/appointments', (req, res) => {
    const authUser = getAuthUser(req);
    const { patientId, patientName, patientPhone, departmentId, doctorId, slotTime, reason } =
      req.body || {};

    if (!departmentId || !doctorId) {
      res.status(400).json({ error: 'Department and doctor are required.' });
      return;
    }

    const result = store.bookAppointment({
      patientId: authUser?.id || patientId || 'user-patient-maya',
      patientName: authUser?.name || patientName || 'Walk-in Patient',
      patientPhone: authUser?.phone || patientPhone || '+1 (415) 555-0100',
      departmentId,
      doctorId,
      slotTime: slotTime || 'Today · Next Available',
      reason: reason || 'Outpatient Consultation',
    });

    broadcastSync(result.notifications);
    res.status(201).json({
      appointment: result.appointment,
      token: result.token,
      bootstrap: store.getBootstrapPayload(),
    });
  });

  app.post('/api/tokens/walkin', (req, res) => {
    const { patientName, patientPhone, departmentId, doctorId, priority, triageNote } =
      req.body || {};
    if (!patientName || !departmentId || !doctorId) {
      res.status(400).json({ error: 'Patient name, department, and doctor are required.' });
      return;
    }
    const safePriority: PriorityLevel =
      priority === 'critical' || priority === 'urgent' ? priority : 'normal';
    const result = store.registerWalkInOrEmergency({
      patientName,
      patientPhone: patientPhone || '+1 (415) 555-0190',
      departmentId,
      doctorId,
      priority: safePriority,
      triageNote,
      visitType: safePriority === 'normal' ? 'walk_in' : 'emergency',
    });
    broadcastSync(result.notifications);
    res.status(201).json({ token: result.token, bootstrap: store.getBootstrapPayload() });
  });

  app.post('/api/tokens/emergency', (req, res) => {
    const { patientName, patientPhone, departmentId, doctorId, priority, triageNote } =
      req.body || {};
    if (!patientName || !departmentId || !doctorId) {
      res.status(400).json({ error: 'Patient name, department, and doctor are required.' });
      return;
    }
    const safePriority: PriorityLevel = priority === 'urgent' ? 'urgent' : 'critical';
    const result = store.registerWalkInOrEmergency({
      patientName,
      patientPhone: patientPhone || 'Emergency Intake',
      departmentId,
      doctorId,
      priority: safePriority,
      triageNote: triageNote || 'Immediate triage stabilization required',
      visitType: 'emergency',
    });
    broadcastSync(result.notifications);
    res.status(201).json({ token: result.token, bootstrap: store.getBootstrapPayload() });
  });

  app.patch('/api/tokens/:id/status', (req, res) => {
    const { status, clinicalNotes } = req.body || {};
    const valid: TokenStatus[] = [
      'waiting',
      'approaching',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
    ];
    if (!valid.includes(status)) {
      res.status(400).json({ error: 'Invalid token status.' });
      return;
    }
    const result = store.updateTokenStatus(req.params.id, status, clinicalNotes);
    if (!result.token) {
      res.status(404).json({ error: 'Token not found.' });
      return;
    }
    broadcastSync(result.notifications);
    res.json({ token: result.token, bootstrap: store.getBootstrapPayload() });
  });

  app.patch('/api/tokens/:id/reassign', (req, res) => {
    const { doctorId } = req.body || {};
    if (!doctorId) {
      res.status(400).json({ error: 'Target doctorId is required.' });
      return;
    }
    const result = store.reassignTokenDoctor(req.params.id, doctorId);
    if (!result.token) {
      res.status(404).json({ error: 'Token or doctor not found.' });
      return;
    }
    broadcastSync(result.notifications);
    res.json({ token: result.token, bootstrap: store.getBootstrapPayload() });
  });

  app.patch('/api/doctors/:id/status', (req, res) => {
    const { availability } = req.body || {};
    const valid: DoctorAvailability[] = ['available', 'occupied', 'unavailable'];
    if (!valid.includes(availability)) {
      res.status(400).json({ error: 'Invalid doctor availability status.' });
      return;
    }
    const result = store.updateDoctorAvailability(req.params.id, availability);
    if (!result.doctor) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }
    broadcastSync(result.notifications);
    res.json({ doctor: result.doctor, bootstrap: store.getBootstrapPayload() });
  });

  // ============================================================
  // AI / ML Prediction & Analytics Routes
  // ============================================================
  app.post('/api/ml/predict-whatif', (req, res) => {
    const b = req.body || {};
    const input: WhatIfInput = {
      queueLength: Math.max(0, Number(b.queueLength ?? 4)),
      avgConsultationMinutes: Math.max(4, Number(b.avgConsultationMinutes ?? 12)),
      availableDoctors: Math.max(0, Number(b.availableDoctors ?? 2)),
      arrivalRatePerHour: Math.max(1, Number(b.arrivalRatePerHour ?? 10)),
      hourOfDay: Math.min(22, Math.max(7, Number(b.hourOfDay ?? 10))),
      dayOfWeek: Math.min(6, Math.max(0, Number(b.dayOfWeek ?? 2))),
      emergencyCases: Math.max(0, Number(b.emergencyCases ?? 0)),
      inConsultationElapsedRatio: Math.min(1, Math.max(0, Number(b.inConsultationElapsedRatio ?? 0.45))),
    };
    res.json(store.ml.compareAllModels(input));
  });

  app.post('/api/ml/retrain', (_req, res) => {
    const summary = store.retrainMLModels();
    broadcastSync();
    res.json({ ml: summary, bootstrap: store.getBootstrapPayload() });
  });

  app.patch('/api/ml/active-model', (req, res) => {
    const model = req.body?.model as ModelType;
    const valid: ModelType[] = ['linear_regression', 'random_forest', 'gradient_boosted'];
    if (!valid.includes(model)) {
      res.status(400).json({ error: 'Invalid model type.' });
      return;
    }
    store.setActiveModel(model);
    broadcastSync();
    res.json({ bootstrap: store.getBootstrapPayload() });
  });

  app.patch('/api/notifications/read', (req, res) => {
    const user = getAuthUser(req);
    store.markNotificationsRead(user?.id);
    broadcastSync();
    res.json({ ok: true });
  });

  app.get('/api/reports/export', (_req, res) => {
    const csv = store.generateCsvReport();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smartqueue-hospital-report.csv"');
    res.send(csv);
  });

  // ============================================================
  // Vite Middleware (Dev) or Static Assets (Prod)
  // ============================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartQueue server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
