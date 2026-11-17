import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AnalyticsSnapshot,
  Appointment,
  Department,
  DepartmentAnalytics,
  Doctor,
  DoctorAvailability,
  HistoricalRecord,
  HospitalBootstrapPayload,
  HourlyFlowPoint,
  ModelType,
  NotificationItem,
  PriorityLevel,
  QueueToken,
  TokenStatus,
  User,
  UserRole,
} from '../src/shared/types.ts';
import { generateSeedHistoricalRecords, HospitalMLEngine } from './mlEngine.ts';

interface StoredUser extends User {
  passwordHash: string;
}

interface PersistedState {
  users: StoredUser[];
  departments: Department[];
  doctors: Doctor[];
  tokens: QueueToken[];
  appointments: Appointment[];
  notifications: NotificationItem[];
  historicalRecords: HistoricalRecord[];
  tokenSeqByDept: Record<string, number>;
  activeModel: ModelType;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'smartqueue-store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'smartqueue-hospital-session-key-2026';

function hashPassword(password: string, salt?: string): string {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 7 * 24 * 3600_000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.uid || decoded.exp < Date.now()) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

function priorityRank(p: PriorityLevel): number {
  if (p === 'critical') return 0;
  if (p === 'urgent') return 1;
  return 2;
}

function buildInitialState(): PersistedState {
  const now = Date.now();
  const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  const departments: Department[] = [
    {
      id: 'dept-gen',
      name: 'General Medicine',
      code: 'GEN',
      floor: 'Floor 1 · Wing A',
      avgConsultationMinutes: 11,
      description: 'Primary care, acute fevers, chronic follow-ups, and general diagnostics.',
    },
    {
      id: 'dept-cardio',
      name: 'Cardiology',
      code: 'CARD',
      floor: 'Floor 2 · Heart Center',
      avgConsultationMinutes: 16,
      description: 'ECG evaluation, hypertension management, and cardiac consultations.',
    },
    {
      id: 'dept-ortho',
      name: 'Orthopedics',
      code: 'ORTH',
      floor: 'Floor 3 · Surgical Suite',
      avgConsultationMinutes: 14,
      description: 'Musculoskeletal injuries, fracture review, and joint rehabilitation.',
    },
    {
      id: 'dept-peds',
      name: 'Pediatrics',
      code: 'PEDS',
      floor: 'Floor 1 · Wing B',
      avgConsultationMinutes: 12,
      description: 'Pediatric wellness visits, immunizations, and acute child care.',
    },
    {
      id: 'dept-neuro',
      name: 'Neurology',
      code: 'NEUR',
      floor: 'Floor 4 · Neuro Care',
      avgConsultationMinutes: 18,
      description: 'Migraine clinic, nerve conduction review, and neurological care.',
    },
  ];

  const doctors: Doctor[] = [
    {
      id: 'doc-chen',
      name: 'Dr. Mei-Ling Chen',
      departmentId: 'dept-gen',
      specialty: 'Internal Medicine',
      room: 'Room 104',
      avatarUrl: '/src/assets/images/avatar_dr_chen_1794910075216.jpg',
      availability: 'occupied',
      avgConsultationMinutes: 11,
      consultationsToday: 14,
      shiftStart: '08:00',
      shiftEnd: '17:00',
    },
    {
      id: 'doc-park',
      name: 'Dr. David Park',
      departmentId: 'dept-gen',
      specialty: 'Family Physician',
      room: 'Room 106',
      availability: 'available',
      avgConsultationMinutes: 10,
      consultationsToday: 12,
      shiftStart: '09:00',
      shiftEnd: '18:00',
    },
    {
      id: 'doc-kumar',
      name: 'Dr. Rajesh Kumar',
      departmentId: 'dept-cardio',
      specialty: 'Interventional Cardiology',
      room: 'Room 208',
      avatarUrl: '/src/assets/images/avatar_dr_patel_1794910074219.jpg',
      availability: 'occupied',
      avgConsultationMinutes: 16,
      consultationsToday: 9,
      shiftStart: '08:30',
      shiftEnd: '16:30',
    },
    {
      id: 'doc-adebayo',
      name: 'Dr. Samuel Adebayo',
      departmentId: 'dept-ortho',
      specialty: 'Orthopedic Surgery',
      room: 'Room 302',
      avatarUrl: '/src/assets/images/avatar_dr_okonkwo_1794910075362.jpg',
      availability: 'available',
      avgConsultationMinutes: 14,
      consultationsToday: 11,
      shiftStart: '08:00',
      shiftEnd: '16:00',
    },
    {
      id: 'doc-rossi',
      name: 'Dr. Elena Rossi',
      departmentId: 'dept-peds',
      specialty: 'Pediatrics',
      room: 'Room 112',
      avatarUrl: '/src/assets/images/avatar_dr_rossi_1794910076140.jpg',
      availability: 'available',
      avgConsultationMinutes: 12,
      consultationsToday: 13,
      shiftStart: '09:00',
      shiftEnd: '17:30',
    },
    {
      id: 'doc-mansoor',
      name: 'Dr. Hannah Al-Mansoor',
      departmentId: 'dept-neuro',
      specialty: 'Clinical Neurology',
      room: 'Room 405',
      availability: 'available',
      avgConsultationMinutes: 18,
      consultationsToday: 7,
      shiftStart: '09:30',
      shiftEnd: '17:30',
    },
  ];

  const defaultPass = hashPassword('smartqueue123');
  const users: StoredUser[] = [
    {
      id: 'user-patient-maya',
      name: 'Maya Lin',
      email: 'maya.lin@patient.smartqueue.org',
      phone: '+1 (415) 555-0142',
      role: 'patient',
      age: 34,
      gender: 'Female',
      bloodGroup: 'O+',
      medicalNotes: 'Mild seasonal hypertension checkup',
      createdAt: minsAgo(600),
      passwordHash: defaultPass,
    },
    {
      id: 'user-patient-2',
      name: 'Carlos Rivera',
      email: 'carlos.r@patient.smartqueue.org',
      phone: '+1 (415) 555-0188',
      role: 'patient',
      age: 49,
      gender: 'Male',
      bloodGroup: 'A+',
      createdAt: minsAgo(500),
      passwordHash: defaultPass,
    },
    {
      id: 'user-patient-3',
      name: 'Priya Nair',
      email: 'priya.n@patient.smartqueue.org',
      phone: '+1 (415) 555-0174',
      role: 'patient',
      age: 29,
      gender: 'Female',
      bloodGroup: 'B+',
      createdAt: minsAgo(480),
      passwordHash: defaultPass,
    },
    {
      id: 'user-patient-4',
      name: 'Arthur Pendelton',
      email: 'arthur.p@patient.smartqueue.org',
      phone: '+1 (415) 555-0199',
      role: 'patient',
      age: 67,
      gender: 'Male',
      bloodGroup: 'AB-',
      createdAt: minsAgo(450),
      passwordHash: defaultPass,
    },
    {
      id: 'user-doctor-chen',
      name: 'Dr. Mei-Ling Chen',
      email: 'dr.chen@smartqueue.org',
      phone: '+1 (415) 555-0104',
      role: 'doctor',
      doctorId: 'doc-chen',
      createdAt: minsAgo(1000),
      passwordHash: defaultPass,
    },
    {
      id: 'user-receptionist',
      name: 'Elena Vance',
      email: 'reception@smartqueue.org',
      phone: '+1 (415) 555-0110',
      role: 'receptionist',
      createdAt: minsAgo(1000),
      passwordHash: defaultPass,
    },
    {
      id: 'user-admin',
      name: 'Dr. Marcus Thorne',
      email: 'admin@smartqueue.org',
      phone: '+1 (415) 555-0100',
      role: 'admin',
      createdAt: minsAgo(1000),
      passwordHash: defaultPass,
    },
  ];

  const emptyPred = {
    predictedWaitMinutes: 10,
    lowMinutes: 8,
    highMinutes: 14,
    confidencePercent: 92,
    expectedConsultationTime: '10:30 AM',
    patientsAhead: 0,
    modelUsed: 'gradient_boosted' as ModelType,
    factors: [],
  };

  const tokens: QueueToken[] = [
    // Completed earlier today for realistic analytics
    {
      id: 'tok-c1',
      tokenNumber: 'GEN-101',
      appointmentId: 'APT-8801',
      patientId: 'user-patient-maya',
      patientName: 'Maya Lin',
      patientPhone: '+1 (415) 555-0142',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      priority: 'normal',
      status: 'completed',
      visitType: 'appointment',
      scheduledSlot: '09:00 AM',
      createdAt: minsAgo(220),
      consultationStartedAt: minsAgo(206),
      completedAt: minsAgo(195),
      actualWaitMinutes: 14,
      actualConsultationMinutes: 11,
      clinicalNotes: 'Routine blood pressure stable. Follow-up in 3 months.',
      prediction: { ...emptyPred, predictedWaitMinutes: 13 },
    },
    {
      id: 'tok-c2',
      tokenNumber: 'CARD-101',
      appointmentId: 'APT-8802',
      patientId: 'user-patient-4',
      patientName: 'Arthur Pendelton',
      patientPhone: '+1 (415) 555-0199',
      departmentId: 'dept-cardio',
      doctorId: 'doc-kumar',
      priority: 'normal',
      status: 'completed',
      visitType: 'appointment',
      scheduledSlot: '09:30 AM',
      createdAt: minsAgo(180),
      consultationStartedAt: minsAgo(158),
      completedAt: minsAgo(141),
      actualWaitMinutes: 22,
      actualConsultationMinutes: 17,
      clinicalNotes: '12-lead ECG normal sinus rhythm.',
      prediction: { ...emptyPred, predictedWaitMinutes: 20 },
    },
    {
      id: 'tok-c3',
      tokenNumber: 'ORTH-101',
      appointmentId: 'APT-8803',
      patientId: 'user-patient-2',
      patientName: 'Carlos Rivera',
      patientPhone: '+1 (415) 555-0188',
      departmentId: 'dept-ortho',
      doctorId: 'doc-adebayo',
      priority: 'normal',
      status: 'completed',
      visitType: 'walk_in',
      scheduledSlot: 'Walk-in',
      createdAt: minsAgo(140),
      consultationStartedAt: minsAgo(124),
      completedAt: minsAgo(109),
      actualWaitMinutes: 16,
      actualConsultationMinutes: 15,
      clinicalNotes: 'Wrist sprain splint fitted.',
      prediction: { ...emptyPred, predictedWaitMinutes: 15 },
    },
    // Active In Consultation
    {
      id: 'tok-a1',
      tokenNumber: 'GEN-102',
      appointmentId: 'APT-8814',
      patientId: 'user-patient-3',
      patientName: 'Priya Nair',
      patientPhone: '+1 (415) 555-0174',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      priority: 'normal',
      status: 'in_consultation',
      visitType: 'appointment',
      scheduledSlot: 'Current',
      createdAt: minsAgo(24),
      consultationStartedAt: minsAgo(6),
      prediction: { ...emptyPred, predictedWaitMinutes: 0, patientsAhead: 0 },
    },
    {
      id: 'tok-a2',
      tokenNumber: 'CARD-102',
      appointmentId: 'APT-8815',
      patientId: 'user-patient-4',
      patientName: 'Arthur Pendelton',
      patientPhone: '+1 (415) 555-0199',
      departmentId: 'dept-cardio',
      doctorId: 'doc-kumar',
      priority: 'normal',
      status: 'in_consultation',
      visitType: 'appointment',
      scheduledSlot: 'Current',
      createdAt: minsAgo(29),
      consultationStartedAt: minsAgo(8),
      prediction: { ...emptyPred, predictedWaitMinutes: 0, patientsAhead: 0 },
    },
    // Active Waiting Queue (General Medicine)
    {
      id: 'tok-w1',
      tokenNumber: 'GEN-103',
      appointmentId: 'APT-8819',
      patientId: 'user-patient-2',
      patientName: 'Carlos Rivera',
      patientPhone: '+1 (415) 555-0188',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      priority: 'normal',
      status: 'approaching',
      visitType: 'appointment',
      scheduledSlot: 'Next Slot',
      createdAt: minsAgo(18),
      prediction: { ...emptyPred },
    },
    {
      id: 'tok-w2',
      tokenNumber: 'GEN-104',
      appointmentId: 'APT-8820',
      patientId: 'user-patient-maya',
      patientName: 'Maya Lin',
      patientPhone: '+1 (415) 555-0142',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      priority: 'normal',
      status: 'waiting',
      visitType: 'appointment',
      scheduledSlot: 'Today · Next Available',
      createdAt: minsAgo(12),
      prediction: { ...emptyPred },
    },
    {
      id: 'tok-w3',
      tokenNumber: 'GEN-105',
      appointmentId: 'APT-8821',
      patientId: 'walkin-1',
      patientName: 'Liam O’Connor',
      patientPhone: '+1 (415) 555-0211',
      departmentId: 'dept-gen',
      doctorId: 'doc-park',
      priority: 'normal',
      status: 'approaching',
      visitType: 'walk_in',
      scheduledSlot: 'Walk-in',
      createdAt: minsAgo(9),
      prediction: { ...emptyPred },
    },
    // Cardiology Queue
    {
      id: 'tok-w4',
      tokenNumber: 'CARD-103',
      appointmentId: 'APT-8822',
      patientId: 'walkin-2',
      patientName: 'Nadia Benali',
      patientPhone: '+1 (415) 555-0240',
      departmentId: 'dept-cardio',
      doctorId: 'doc-kumar',
      priority: 'urgent',
      triageNote: 'Elevated blood pressure 168/102 on triage',
      status: 'approaching',
      visitType: 'walk_in',
      scheduledSlot: 'Priority Intake',
      createdAt: minsAgo(14),
      prediction: { ...emptyPred },
    },
    // Orthopedics Queue
    {
      id: 'tok-w5',
      tokenNumber: 'ORTH-102',
      appointmentId: 'APT-8823',
      patientId: 'walkin-3',
      patientName: 'Sofia Alvarez',
      patientPhone: '+1 (415) 555-0263',
      departmentId: 'dept-ortho',
      doctorId: 'doc-adebayo',
      priority: 'normal',
      status: 'approaching',
      visitType: 'appointment',
      scheduledSlot: 'Today',
      createdAt: minsAgo(7),
      prediction: { ...emptyPred },
    },
    // Pediatrics Queue
    {
      id: 'tok-w6',
      tokenNumber: 'PEDS-101',
      appointmentId: 'APT-8824',
      patientId: 'walkin-4',
      patientName: 'Leo Zhang (Parent: Wei)',
      patientPhone: '+1 (415) 555-0277',
      departmentId: 'dept-peds',
      doctorId: 'doc-rossi',
      priority: 'normal',
      status: 'approaching',
      visitType: 'appointment',
      scheduledSlot: 'Today',
      createdAt: minsAgo(5),
      prediction: { ...emptyPred },
    },
  ];

  const appointments: Appointment[] = [
    {
      id: 'APT-8801',
      patientId: 'user-patient-maya',
      patientName: 'Maya Lin',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      slotTime: '09:00 AM',
      reason: 'Annual blood pressure check',
      status: 'completed',
      tokenId: 'tok-c1',
      tokenNumber: 'GEN-101',
      createdAt: minsAgo(240),
    },
    {
      id: 'APT-8820',
      patientId: 'user-patient-maya',
      patientName: 'Maya Lin',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      slotTime: 'Today · Next Available',
      reason: 'Follow-up lab review',
      status: 'checked_in',
      tokenId: 'tok-w2',
      tokenNumber: 'GEN-104',
      createdAt: minsAgo(15),
    },
    {
      id: 'APT-8819',
      patientId: 'user-patient-2',
      patientName: 'Carlos Rivera',
      departmentId: 'dept-gen',
      doctorId: 'doc-chen',
      slotTime: 'Next Slot',
      reason: 'Persistent cough assessment',
      status: 'checked_in',
      tokenId: 'tok-w1',
      tokenNumber: 'GEN-103',
      createdAt: minsAgo(20),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      userId: 'user-patient-maya',
      roleTarget: 'patient',
      title: 'Token GEN-104 Active',
      message: 'Your queue position in General Medicine with Dr. Mei-Ling Chen is live.',
      severity: 'info',
      channel: 'in_app',
      read: false,
      createdAt: minsAgo(12),
    },
    {
      id: 'notif-2',
      roleTarget: 'receptionist',
      title: 'Urgent Cardiology Triage',
      message: 'Token CARD-103 (Nadia Benali) prioritized in Cardiology queue.',
      severity: 'warning',
      channel: 'in_app',
      read: false,
      createdAt: minsAgo(14),
    },
    {
      id: 'notif-3',
      roleTarget: 'admin',
      title: 'Morning Model Validation Complete',
      message: 'Gradient Boosted Regressor active with < 5 min MAE across 220 records.',
      severity: 'success',
      channel: 'in_app',
      read: false,
      createdAt: minsAgo(45),
    },
  ];

  return {
    users,
    departments,
    doctors,
    tokens,
    appointments,
    notifications,
    historicalRecords: generateSeedHistoricalRecords(),
    tokenSeqByDept: {
      'dept-gen': 105,
      'dept-cardio': 103,
      'dept-ortho': 102,
      'dept-peds': 101,
      'dept-neuro': 100,
    },
    activeModel: 'gradient_boosted',
  };
}

export class HospitalStore {
  private state: PersistedState;
  public ml: HospitalMLEngine;

  constructor() {
    this.state = this.loadState();
    this.ml = new HospitalMLEngine(this.state.historicalRecords);
    this.ml.setActiveModel(this.state.activeModel);
    this.recalculateAllPredictions();
  }

  private loadState(): PersistedState {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed && Array.isArray(parsed.departments) && Array.isArray(parsed.tokens)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed loading store, initializing fresh seed:', err);
    }
    const fresh = buildInitialState();
    this.saveState(fresh);
    return fresh;
  }

  private saveState(target: PersistedState = this.state) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(target, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed persisting store:', err);
    }
  }

  public sanitizeUser(u: StoredUser): User {
    const { passwordHash: _ignored, ...safe } = u;
    return safe;
  }

  public getUserById(id: string): User | null {
    const found = this.state.users.find((u) => u.id === id);
    return found ? this.sanitizeUser(found) : null;
  }

  public registerPatient(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    age?: number;
    gender?: string;
    bloodGroup?: string;
  }): { user: User; token: string } | { error: string } {
    const emailLower = input.email.trim().toLowerCase();
    if (!emailLower || !input.name.trim() || !input.phone.trim() || input.password.length < 4) {
      return { error: 'Please complete name, email, phone, and a password (min 4 characters).' };
    }
    if (this.state.users.some((u) => u.email.toLowerCase() === emailLower)) {
      return { error: 'An account with this email already exists.' };
    }

    const newUser: StoredUser = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      email: emailLower,
      phone: input.phone.trim(),
      role: 'patient',
      age: input.age,
      gender: input.gender,
      bloodGroup: input.bloodGroup,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(input.password),
    };
    this.state.users.push(newUser);
    this.saveState();
    return {
      user: this.sanitizeUser(newUser),
      token: createSessionToken(newUser.id),
    };
  }

  public login(email: string, password: string): { user: User; token: string } | { error: string } {
    const found = this.state.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!found || !verifyPassword(password, found.passwordHash)) {
      return { error: 'Invalid email or password.' };
    }
    return {
      user: this.sanitizeUser(found),
      token: createSessionToken(found.id),
    };
  }

  public demoLogin(role: UserRole): { user: User; token: string } {
    const found = this.state.users.find((u) => u.role === role) || this.state.users[0];
    return {
      user: this.sanitizeUser(found),
      token: createSessionToken(found.id),
    };
  }

  public updatePatientProfile(
    userId: string,
    patch: { name?: string; phone?: string; age?: number; gender?: string; bloodGroup?: string; medicalNotes?: string }
  ): User | null {
    const u = this.state.users.find((x) => x.id === userId);
    if (!u) return null;
    if (patch.name?.trim()) u.name = patch.name.trim();
    if (patch.phone?.trim()) u.phone = patch.phone.trim();
    if (patch.age !== undefined) u.age = patch.age;
    if (patch.gender !== undefined) u.gender = patch.gender;
    if (patch.bloodGroup !== undefined) u.bloodGroup = patch.bloodGroup;
    if (patch.medicalNotes !== undefined) u.medicalNotes = patch.medicalNotes;
    this.saveState();
    return this.sanitizeUser(u);
  }

  // ============================================================
  // Core AI Prediction Recalculation across all Active Queues
  // ============================================================
  public recalculateAllPredictions(): NotificationItem[] {
    const now = new Date();
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay();
    const generatedNotifs: NotificationItem[] = [];

    for (const dept of this.state.departments) {
      const deptDoctors = this.state.doctors.filter((d) => d.departmentId === dept.id);
      const activeDoctors = deptDoctors.filter((d) => d.availability !== 'unavailable');
      const availableCount = Math.max(
        0,
        deptDoctors.filter((d) => d.availability === 'available' || d.availability === 'occupied').length
      );

      // Recent arrival rate in last 60 min (with realistic baseline floor)
      const oneHourAgo = now.getTime() - 3600_000;
      const recentArrivals = this.state.tokens.filter(
        (t) => t.departmentId === dept.id && new Date(t.createdAt).getTime() >= oneHourAgo
      ).length;
      const arrivalRatePerHour = Math.max(4, recentArrivals * 2 + activeDoctors.length * 3);

      // Active waiting tokens sorted by priority then FIFO
      const waitingTokens = this.state.tokens
        .filter(
          (t) =>
            t.departmentId === dept.id &&
            (t.status === 'waiting' || t.status === 'approaching')
        )
        .sort((a, b) => {
          const prDiff = priorityRank(a.priority) - priorityRank(b.priority);
          if (prDiff !== 0) return prDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

      const inConsultTokens = this.state.tokens.filter(
        (t) => t.departmentId === dept.id && t.status === 'in_consultation'
      );

      // Average elapsed ratio of ongoing consultations
      let avgElapsedRatio = 0.45;
      if (inConsultTokens.length > 0) {
        const ratios = inConsultTokens.map((t) => {
          const started = t.consultationStartedAt
            ? new Date(t.consultationStartedAt).getTime()
            : now.getTime();
          const elapsedMin = (now.getTime() - started) / 60_000;
          return Math.min(0.95, Math.max(0.05, elapsedMin / dept.avgConsultationMinutes));
        });
        avgElapsedRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      }

      waitingTokens.forEach((token, idx) => {
        const doc = this.state.doctors.find((d) => d.id === token.doctorId);
        // Count patients ahead specifically for this doctor OR in dept if shared
        const aheadForSameDoctor = waitingTokens
          .slice(0, idx)
          .filter((t) => t.doctorId === token.doctorId).length;
        const emergencyAhead = waitingTokens
          .slice(0, idx)
          .filter((t) => t.priority === 'critical' || t.priority === 'urgent').length;

        const docIsOccupied = doc?.availability === 'occupied' ? 1 : 0;
        const docIsAvailable = doc?.availability === 'unavailable' ? 0 : 1;
        const effectiveDoctors =
          doc && doc.availability !== 'unavailable' ? Math.max(1, availableCount) : availableCount;

        const prevWait = token.prediction?.predictedWaitMinutes;

        const prediction = this.ml.predictWaitTime(
          {
            queueLength: aheadForSameDoctor + (docIsOccupied && aheadForSameDoctor === 0 ? 1 : 0),
            avgConsultationMinutes: doc?.avgConsultationMinutes || dept.avgConsultationMinutes,
            availableDoctors: docIsAvailable === 0 ? 0 : effectiveDoctors,
            arrivalRatePerHour,
            hourOfDay,
            dayOfWeek,
            emergencyCases: emergencyAhead + (token.priority === 'critical' ? 0 : 0),
            inConsultationElapsedRatio: avgElapsedRatio,
          },
          now
        );

        // Ensure patientsAhead reflects true queue position ahead
        prediction.patientsAhead = aheadForSameDoctor;
        if (token.priority === 'critical' && aheadForSameDoctor === 0) {
          prediction.predictedWaitMinutes = Math.min(prediction.predictedWaitMinutes, 3);
          prediction.lowMinutes = 1;
          prediction.highMinutes = 5;
        }

        token.prediction = prediction;

        // Upgrade waiting -> approaching when <= 1 patient ahead
        if (token.status === 'waiting' && aheadForSameDoctor <= 1 && doc?.availability !== 'unavailable') {
          token.status = 'approaching';
          const n = this.pushNotification({
            userId: token.patientId,
            roleTarget: 'patient',
            title: `Turn Approaching · ${token.tokenNumber}`,
            message: `You are next in line for ${doc?.name || dept.name}. Estimated wait: ${prediction.predictedWaitMinutes} min.`,
            severity: 'success',
            channel: 'sms_alert',
          });
          generatedNotifs.push(n);
        } else if (
          prevWait !== undefined &&
          Math.abs(prediction.predictedWaitMinutes - prevWait) >= 8
        ) {
          const direction = prediction.predictedWaitMinutes > prevWait ? 'increased' : 'decreased';
          const n = this.pushNotification({
            userId: token.patientId,
            roleTarget: 'patient',
            title: `Wait Estimate Updated · ${token.tokenNumber}`,
            message: `Estimated wait ${direction} from ${prevWait} min to ${prediction.predictedWaitMinutes} min (${prediction.expectedConsultationTime}).`,
            severity: prediction.predictedWaitMinutes > prevWait ? 'warning' : 'info',
            channel: 'in_app',
          });
          generatedNotifs.push(n);
        }
      });
    }

    this.saveState();
    return generatedNotifs;
  }

  private pushNotification(input: {
    userId?: string;
    roleTarget?: UserRole | 'all';
    title: string;
    message: string;
    severity: NotificationItem['severity'];
    channel: NotificationItem['channel'];
  }): NotificationItem {
    const item: NotificationItem = {
      id: `notif-${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      roleTarget: input.roleTarget,
      title: input.title,
      message: input.message,
      severity: input.severity,
      channel: input.channel,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.state.notifications.unshift(item);
    if (this.state.notifications.length > 80) {
      this.state.notifications = this.state.notifications.slice(0, 80);
    }
    return item;
  }

  private nextTokenNumber(departmentId: string): string {
    const dept = this.state.departments.find((d) => d.id === departmentId);
    const code = dept?.code || 'GEN';
    const nextNum = (this.state.tokenSeqByDept[departmentId] || 100) + 1;
    this.state.tokenSeqByDept[departmentId] = nextNum;
    return `${code}-${nextNum}`;
  }

  // ============================================================
  // Appointments & Queue Operations
  // ============================================================
  public bookAppointment(input: {
    patientId: string;
    patientName: string;
    patientPhone: string;
    departmentId: string;
    doctorId: string;
    slotTime: string;
    reason: string;
  }): { appointment: Appointment; token: QueueToken; notifications: NotificationItem[] } {
    const aptId = `APT-${Math.floor(1000 + Math.random() * 8999)}`;
    const tokenNumber = this.nextTokenNumber(input.departmentId);
    const tokenId = `tok-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    const token: QueueToken = {
      id: tokenId,
      tokenNumber,
      appointmentId: aptId,
      patientId: input.patientId,
      patientName: input.patientName,
      patientPhone: input.patientPhone,
      departmentId: input.departmentId,
      doctorId: input.doctorId,
      priority: 'normal',
      status: 'waiting',
      visitType: 'appointment',
      scheduledSlot: input.slotTime || 'Next Available',
      createdAt: nowIso,
      prediction: {
        predictedWaitMinutes: 15,
        lowMinutes: 11,
        highMinutes: 19,
        confidencePercent: 90,
        expectedConsultationTime: 'Soon',
        patientsAhead: 0,
        modelUsed: this.ml.getActiveModel(),
        factors: [],
      },
    };

    const appointment: Appointment = {
      id: aptId,
      patientId: input.patientId,
      patientName: input.patientName,
      departmentId: input.departmentId,
      doctorId: input.doctorId,
      slotTime: input.slotTime || 'Next Available',
      reason: input.reason || 'General Consultation',
      status: 'checked_in',
      tokenId,
      tokenNumber,
      createdAt: nowIso,
    };

    this.state.tokens.push(token);
    this.state.appointments.unshift(appointment);

    const doc = this.state.doctors.find((d) => d.id === input.doctorId);
    const notifs = this.recalculateAllPredictions();
    const updatedToken = this.state.tokens.find((t) => t.id === tokenId)!;

    const confirmNotif = this.pushNotification({
      userId: input.patientId,
      roleTarget: 'patient',
      title: `Appointment Confirmed · ${tokenNumber}`,
      message: `Booked with ${doc?.name || 'Physician'} (${appointment.slotTime}). Estimated wait: ${updatedToken.prediction.predictedWaitMinutes} min.`,
      severity: 'success',
      channel: 'email_alert',
    });

    this.saveState();
    return { appointment, token: updatedToken, notifications: [confirmNotif, ...notifs] };
  }

  public registerWalkInOrEmergency(input: {
    patientName: string;
    patientPhone: string;
    departmentId: string;
    doctorId: string;
    priority: PriorityLevel;
    triageNote?: string;
    visitType: 'walk_in' | 'emergency';
  }): { token: QueueToken; notifications: NotificationItem[] } {
    const tokenNumber = this.nextTokenNumber(input.departmentId);
    const tokenId = `tok-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const aptId = input.visitType === 'emergency' ? `EMG-${Math.floor(1000 + Math.random() * 8999)}` : `WLK-${Math.floor(1000 + Math.random() * 8999)}`;

    const token: QueueToken = {
      id: tokenId,
      tokenNumber,
      appointmentId: aptId,
      patientId: `guest-${crypto.randomUUID().slice(0, 6)}`,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      departmentId: input.departmentId,
      doctorId: input.doctorId,
      priority: input.priority,
      triageNote: input.triageNote?.trim() || undefined,
      status: 'waiting',
      visitType: input.visitType,
      scheduledSlot: input.visitType === 'emergency' ? 'Emergency Triage' : 'Walk-in',
      createdAt: nowIso,
      prediction: {
        predictedWaitMinutes: 10,
        lowMinutes: 8,
        highMinutes: 14,
        confidencePercent: 90,
        expectedConsultationTime: 'Soon',
        patientsAhead: 0,
        modelUsed: this.ml.getActiveModel(),
        factors: [],
      },
    };

    this.state.tokens.push(token);
    const notifs = this.recalculateAllPredictions();
    const updatedToken = this.state.tokens.find((t) => t.id === tokenId)!;
    const doc = this.state.doctors.find((d) => d.id === input.doctorId);

    const intakeNotif = this.pushNotification({
      roleTarget: input.visitType === 'emergency' ? 'all' : 'receptionist',
      title:
        input.visitType === 'emergency'
          ? `Emergency Triage Added · ${tokenNumber}`
          : `Walk-In Token Issued · ${tokenNumber}`,
      message:
        input.visitType === 'emergency'
          ? `Priority ${input.priority.toUpperCase()} case (${token.patientName}) routed to ${doc?.name || 'physician'}. All downstream queue wait times recalculated.`
          : `${token.patientName} added to ${doc?.name || 'department'} queue. Estimated wait: ${updatedToken.prediction.predictedWaitMinutes} min.`,
      severity: input.visitType === 'emergency' ? 'critical' : 'info',
      channel: 'in_app',
    });

    this.saveState();
    return { token: updatedToken, notifications: [intakeNotif, ...notifs] };
  }

  public updateTokenStatus(
    tokenId: string,
    newStatus: TokenStatus,
    clinicalNotes?: string
  ): { token: QueueToken | null; notifications: NotificationItem[] } {
    const token = this.state.tokens.find((t) => t.id === tokenId);
    if (!token) return { token: null, notifications: [] };

    const now = new Date();
    const doc = this.state.doctors.find((d) => d.id === token.doctorId);
    const dept = this.state.departments.find((d) => d.id === token.departmentId);

    if (newStatus === 'in_consultation') {
      // Complete any existing in_consultation token for this doctor automatically if needed? No, keep explicit or mark occupied
      token.status = 'in_consultation';
      token.consultationStartedAt = now.toISOString();
      token.actualWaitMinutes = Math.max(
        1,
        Math.round((now.getTime() - new Date(token.createdAt).getTime()) / 60_000)
      );
      if (doc) doc.availability = 'occupied';
      const apt = this.state.appointments.find((a) => a.tokenId === token.id);
      if (apt) apt.status = 'checked_in';
    } else if (newStatus === 'completed') {
      token.status = 'completed';
      token.completedAt = now.toISOString();
      if (clinicalNotes !== undefined) token.clinicalNotes = clinicalNotes;

      const startedAt = token.consultationStartedAt
        ? new Date(token.consultationStartedAt).getTime()
        : now.getTime() - (doc?.avgConsultationMinutes || 12) * 60_000;
      const actualConsult = Math.max(
        4,
        Math.round((now.getTime() - startedAt) / 60_000)
      );
      token.actualConsultationMinutes = actualConsult;

      if (token.actualWaitMinutes === undefined) {
        token.actualWaitMinutes = Math.max(
          1,
          Math.round((startedAt - new Date(token.createdAt).getTime()) / 60_000)
        );
      }

      if (doc) {
        doc.consultationsToday += 1;
        doc.avgConsultationMinutes = Number(
          (doc.avgConsultationMinutes * 0.8 + actualConsult * 0.2).toFixed(1)
        );
        // Check if doctor still has another in_consultation
        const stillInConsult = this.state.tokens.some(
          (t) => t.doctorId === doc.id && t.id !== token.id && t.status === 'in_consultation'
        );
        if (!stillInConsult && doc.availability === 'occupied') {
          doc.availability = 'available';
        }
      }

      const apt = this.state.appointments.find((a) => a.tokenId === token.id);
      if (apt) apt.status = 'completed';

      // Feed real outcome back into historical records for ML learning!
      this.state.historicalRecords.push({
        id: `hist-live-${crypto.randomUUID().slice(0, 6)}`,
        departmentId: token.departmentId,
        queueLength: token.prediction.patientsAhead,
        avgConsultationMinutes: doc?.avgConsultationMinutes || dept?.avgConsultationMinutes || 12,
        availableDoctors: Math.max(
          1,
          this.state.doctors.filter(
            (d) => d.departmentId === token.departmentId && d.availability !== 'unavailable'
          ).length
        ),
        arrivalRatePerHour: 10,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        emergencyCases: token.priority === 'critical' ? 1 : 0,
        inConsultationElapsedRatio: 0.5,
        actualWaitMinutes: token.actualWaitMinutes,
      });
    } else if (newStatus === 'cancelled' || newStatus === 'no_show') {
      token.status = newStatus;
      token.completedAt = now.toISOString();
      const apt = this.state.appointments.find((a) => a.tokenId === token.id);
      if (apt) apt.status = 'cancelled';
    }

    const notifs = this.recalculateAllPredictions();
    this.saveState();
    return { token, notifications: notifs };
  }

  public reassignTokenDoctor(tokenId: string, newDoctorId: string): { token: QueueToken | null; notifications: NotificationItem[] } {
    const token = this.state.tokens.find((t) => t.id === tokenId);
    const doc = this.state.doctors.find((d) => d.id === newDoctorId);
    if (!token || !doc) return { token: null, notifications: [] };

    token.doctorId = doc.id;
    token.departmentId = doc.departmentId;
    const apt = this.state.appointments.find((a) => a.tokenId === token.id);
    if (apt) {
      apt.doctorId = doc.id;
      apt.departmentId = doc.departmentId;
    }

    const notifs = this.recalculateAllPredictions();
    const n = this.pushNotification({
      userId: token.patientId,
      roleTarget: 'patient',
      title: `Doctor Reassigned · ${token.tokenNumber}`,
      message: `Your consultation has been assigned to ${doc.name} (${doc.room}). New estimated wait: ${token.prediction.predictedWaitMinutes} min.`,
      severity: 'info',
      channel: 'in_app',
    });

    this.saveState();
    return { token, notifications: [n, ...notifs] };
  }

  public updateDoctorAvailability(
    doctorId: string,
    availability: DoctorAvailability
  ): { doctor: Doctor | null; notifications: NotificationItem[] } {
    const doc = this.state.doctors.find((d) => d.id === doctorId);
    if (!doc) return { doctor: null, notifications: [] };

    const prev = doc.availability;
    doc.availability = availability;

    const notifs = this.recalculateAllPredictions();
    if (prev !== availability && availability === 'unavailable') {
      const n = this.pushNotification({
        roleTarget: 'all',
        title: `Physician Availability Change`,
        message: `${doc.name} is temporarily unavailable. Waiting times for affected tokens have been recalculated.`,
        severity: 'warning',
        channel: 'in_app',
      });
      notifs.unshift(n);
    }

    this.saveState();
    return { doctor: doc, notifications: notifs };
  }

  public setActiveModel(model: ModelType) {
    this.state.activeModel = model;
    this.ml.setActiveModel(model);
    this.recalculateAllPredictions();
    this.saveState();
  }

  public retrainMLModels() {
    const summary = this.ml.trainAndEvaluate(this.state.historicalRecords);
    this.recalculateAllPredictions();
    this.pushNotification({
      roleTarget: 'admin',
      title: 'ML Models Retrained',
      message: `Evaluated across ${this.state.historicalRecords.length} historical records. Active MAE: ${
        summary.evaluations.find((e) => e.modelType === summary.activeModel)?.mae ?? 0
      } min.`,
      severity: 'success',
      channel: 'in_app',
    });
    this.saveState();
    return summary;
  }

  public markNotificationsRead(userId?: string) {
    this.state.notifications.forEach((n) => {
      if (!userId || !n.userId || n.userId === userId) {
        n.read = true;
      }
    });
    this.saveState();
  }

  // ============================================================
  // Analytics & Bootstrap Payload
  // ============================================================
  public buildAnalytics(): AnalyticsSnapshot {
    const waitingTokens = this.state.tokens.filter(
      (t) => t.status === 'waiting' || t.status === 'approaching'
    );
    const inConsultTokens = this.state.tokens.filter((t) => t.status === 'in_consultation');
    const completedTokens = this.state.tokens.filter((t) => t.status === 'completed');

    const avgPredictedWaitMinutes =
      waitingTokens.length > 0
        ? Math.round(
            waitingTokens.reduce((acc, t) => acc + t.prediction.predictedWaitMinutes, 0) /
              waitingTokens.length
          )
        : 0;

    const avgConsultationMinutes = Number(
      (
        this.state.doctors.reduce((acc, d) => acc + d.avgConsultationMinutes, 0) /
        Math.max(1, this.state.doctors.length)
      ).toFixed(1)
    );

    const activeDoctorsCount = this.state.doctors.filter(
      (d) => d.availability !== 'unavailable'
    ).length;

    const departmentBreakdown: DepartmentAnalytics[] = this.state.departments.map((dept) => {
      const deptWaiting = waitingTokens.filter((t) => t.departmentId === dept.id);
      const deptConsult = inConsultTokens.filter((t) => t.departmentId === dept.id);
      const deptCompleted = completedTokens.filter((t) => t.departmentId === dept.id);
      const deptDocs = this.state.doctors.filter((d) => d.departmentId === dept.id);
      const activeDeptDocs = deptDocs.filter((d) => d.availability !== 'unavailable');

      const avgPred =
        deptWaiting.length > 0
          ? Math.round(
              deptWaiting.reduce((a, t) => a + t.prediction.predictedWaitMinutes, 0) /
                deptWaiting.length
            )
          : 0;

      const histForDept = this.state.historicalRecords.filter((r) => r.departmentId === dept.id);
      const avgHist =
        histForDept.length > 0
          ? Math.round(
              histForDept.reduce((a, r) => a + r.actualWaitMinutes, 0) / histForDept.length
            )
          : dept.avgConsultationMinutes;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        code: dept.code,
        waitingCount: deptWaiting.length,
        inConsultationCount: deptConsult.length,
        completedCount: deptCompleted.length,
        activeDoctors: activeDeptDocs.length,
        totalDoctors: deptDocs.length,
        avgPredictedWaitMinutes: avgPred,
        avgActualWaitMinutes: avgHist,
      };
    });

    // Hourly flow aggregation from historical records + today's live tokens
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const hourlyFlowRaw = hours.map((h) => {
      const recs = this.state.historicalRecords.filter((r) => r.hourOfDay === h);
      const avgWait =
        recs.length > 0
          ? Math.round(recs.reduce((a, r) => a + r.actualWaitMinutes, 0) / recs.length)
          : 12;
      const arrivals =
        recs.length > 0
          ? Math.round(recs.reduce((a, r) => a + r.arrivalRatePerHour, 0) / recs.length)
          : 8;
      const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
      return { hour: h, label, arrivals, avgWaitMinutes: avgWait };
    });

    const maxArrivals = Math.max(...hourlyFlowRaw.map((p) => p.arrivals));
    const hourlyFlow: HourlyFlowPoint[] = hourlyFlowRaw.map((p) => ({
      ...p,
      isPeak: p.arrivals >= maxArrivals - 2,
    }));

    const peakPoint = hourlyFlow.reduce(
      (best, cur) => (cur.arrivals > best.arrivals ? cur : best),
      hourlyFlow[0]
    );

    const totalFinishedOrCancelled = this.state.tokens.filter(
      (t) => t.status === 'completed' || t.status === 'cancelled' || t.status === 'no_show'
    ).length;
    const appointmentCompletionRate =
      totalFinishedOrCancelled > 0
        ? Math.round((completedTokens.length / totalFinishedOrCancelled) * 100)
        : 94;

    return {
      totalRegisteredPatients:
        this.state.users.filter((u) => u.role === 'patient').length + 42, // includes walk-in registry baseline
      currentlyWaiting: waitingTokens.length,
      inConsultationNow: inConsultTokens.length,
      completedToday:
        this.state.doctors.reduce((a, d) => a + d.consultationsToday, 0) + completedTokens.length,
      avgPredictedWaitMinutes,
      avgConsultationMinutes,
      activeDoctorsCount,
      totalDoctorsCount: this.state.doctors.length,
      peakHourLabel: peakPoint ? peakPoint.label : '10 AM',
      appointmentCompletionRate,
      departmentBreakdown,
      hourlyFlow,
    };
  }

  public getBootstrapPayload(): HospitalBootstrapPayload {
    return {
      departments: this.state.departments,
      doctors: this.state.doctors,
      tokens: this.state.tokens,
      appointments: this.state.appointments,
      notifications: this.state.notifications,
      analytics: this.buildAnalytics(),
      ml: this.ml.getSummary(),
      serverTime: new Date().toISOString(),
    };
  }

  public generateCsvReport(): string {
    const analytics = this.buildAnalytics();
    const lines: string[] = [
      'Section,Name,Metric_1,Metric_2,Metric_3,Metric_4',
      `Summary,Hospital Operations,Currently Waiting: ${analytics.currentlyWaiting},In Consultation: ${analytics.inConsultationNow},Avg Predicted Wait (min): ${analytics.avgPredictedWaitMinutes},Active Doctors: ${analytics.activeDoctorsCount}/${analytics.totalDoctorsCount}`,
    ];
    for (const d of analytics.departmentBreakdown) {
      lines.push(
        `Department,"${d.departmentName}",Waiting: ${d.waitingCount},Active Doctors: ${d.activeDoctors}/${d.totalDoctors},Avg Predicted Wait (min): ${d.avgPredictedWaitMinutes},Historical Avg Wait (min): ${d.avgActualWaitMinutes}`
      );
    }
    for (const doc of this.state.doctors) {
      lines.push(
        `Doctor,"${doc.name}",Availability: ${doc.availability},Consultations Today: ${doc.consultationsToday},Avg Consult Duration (min): ${doc.avgConsultationMinutes},Shift: ${doc.shiftStart}-${doc.shiftEnd}`
      );
    }
    return lines.join('\n');
  }
}
