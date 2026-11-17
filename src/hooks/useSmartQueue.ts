import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DoctorAvailability,
  HospitalBootstrapPayload,
  ModelType,
  NotificationItem,
  PriorityLevel,
  TokenStatus,
  User,
  UserRole,
  WhatIfInput,
  WhatIfResponse,
  WSEvent,
} from '../shared/types.ts';

const STORAGE_TOKEN_KEY = 'smartqueue_session_token';

export function useSmartQueue() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_TOKEN_KEY)
  );
  const [data, setData] = useState<HospitalBootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const authHeaders = useCallback(
    (extra?: Record<string, string>) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extra,
      };
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      return headers;
    },
    [sessionToken]
  );

  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Failed to load hospital state');
      const payload = (await res.json()) as HospitalBootstrapPayload;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, []);

  const demoLogin = useCallback(async (role: UserRole) => {
    const res = await fetch('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error('Unable to switch role');
    const json = (await res.json()) as { user: User; token: string };
    localStorage.setItem(STORAGE_TOKEN_KEY, json.token);
    setSessionToken(json.token);
    setUser(json.user);
    return json.user;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Login failed');
    localStorage.setItem(STORAGE_TOKEN_KEY, json.token);
    setSessionToken(json.token);
    setUser(json.user);
    return json.user as User;
  }, []);

  const registerPatient = useCallback(
    async (payload: {
      name: string;
      email: string;
      phone: string;
      password: string;
      age?: number;
      gender?: string;
      bloodGroup?: string;
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      localStorage.setItem(STORAGE_TOKEN_KEY, json.token);
      setSessionToken(json.token);
      setUser(json.user);
      return json.user as User;
    },
    []
  );

  const updateProfile = useCallback(
    async (patch: {
      name?: string;
      phone?: string;
      age?: number;
      gender?: string;
      bloodGroup?: string;
      medicalNotes?: string;
    }) => {
      const res = await fetch('/api/patient/profile', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed updating profile');
      setUser(json.user);
      return json.user as User;
    },
    [authHeaders]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    setSessionToken(null);
    setUser(null);
  }, []);

  // Initialize session & bootstrap data
  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      try {
        await fetchBootstrap();
        const saved = localStorage.getItem(STORAGE_TOKEN_KEY);
        if (saved) {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${saved}` },
          });
          if (meRes.ok) {
            const meJson = await meRes.json();
            if (active) setUser(meJson.user);
          } else {
            localStorage.removeItem(STORAGE_TOKEN_KEY);
            if (active) await demoLogin('patient');
          }
        } else {
          if (active) await demoLogin('patient');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Initialization failed');
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [demoLogin, fetchBootstrap]);

  // Real-time WebSocket connection
  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSEvent;
          if (parsed.type === 'state:sync') {
            setData(parsed.payload);
          } else if (parsed.type === 'notification:new') {
            setToast(parsed.payload);
          }
        } catch {
          // ignore malformed payload
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          setWsConnected(false);
          reconnectTimerRef.current = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Mutations
  const bookAppointment = useCallback(
    async (input: {
      departmentId: string;
      doctorId: string;
      slotTime: string;
      reason: string;
    }) => {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...input,
          patientId: user?.id,
          patientName: user?.name,
          patientPhone: user?.phone,
        }),
      });
      const json = (await res.json()) as {
        token: import('../shared/types.ts').QueueToken;
        appointment: import('../shared/types.ts').Appointment;
        bootstrap?: HospitalBootstrapPayload;
      };
      if (!res.ok) throw new Error((json as unknown as { error?: string }).error || 'Booking failed');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders, user]
  );

  const registerWalkIn = useCallback(
    async (input: {
      patientName: string;
      patientPhone: string;
      departmentId: string;
      doctorId: string;
    }) => {
      const res = await fetch('/api/tokens/walkin', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...input, priority: 'normal' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Walk-in registration failed');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders]
  );

  const registerEmergency = useCallback(
    async (input: {
      patientName: string;
      patientPhone: string;
      departmentId: string;
      doctorId: string;
      priority: PriorityLevel;
      triageNote: string;
    }) => {
      const res = await fetch('/api/tokens/emergency', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Emergency triage failed');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders]
  );

  const updateTokenStatus = useCallback(
    async (tokenId: string, status: TokenStatus, clinicalNotes?: string) => {
      const res = await fetch(`/api/tokens/${tokenId}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status, clinicalNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Status update failed');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders]
  );

  const reassignToken = useCallback(
    async (tokenId: string, doctorId: string) => {
      const res = await fetch(`/api/tokens/${tokenId}/reassign`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ doctorId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reassign failed');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders]
  );

  const updateDoctorAvailability = useCallback(
    async (doctorId: string, availability: DoctorAvailability) => {
      const res = await fetch(`/api/doctors/${doctorId}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ availability }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed updating availability');
      if (json.bootstrap) setData(json.bootstrap);
      return json;
    },
    [authHeaders]
  );

  const setActiveModel = useCallback(
    async (model: ModelType) => {
      const res = await fetch('/api/ml/active-model', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed switching model');
      if (json.bootstrap) setData(json.bootstrap);
    },
    [authHeaders]
  );

  const retrainModels = useCallback(async () => {
    const res = await fetch('/api/ml/retrain', {
      method: 'POST',
      headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Retraining failed');
    if (json.bootstrap) setData(json.bootstrap);
  }, [authHeaders]);

  const predictWhatIf = useCallback(
    async (input: WhatIfInput): Promise<WhatIfResponse> => {
      const res = await fetch('/api/ml/predict-whatif', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Simulation failed');
      return (await res.json()) as WhatIfResponse;
    },
    [authHeaders]
  );

  const markNotificationsRead = useCallback(async () => {
    await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: authHeaders(),
    });
    await fetchBootstrap();
  }, [authHeaders, fetchBootstrap]);

  return {
    user,
    data,
    loading,
    error,
    wsConnected,
    toast,
    dismissToast: () => setToast(null),
    demoLogin,
    login,
    registerPatient,
    updateProfile,
    logout,
    bookAppointment,
    registerWalkIn,
    registerEmergency,
    updateTokenStatus,
    reassignToken,
    updateDoctorAvailability,
    setActiveModel,
    retrainModels,
    predictWhatIf,
    markNotificationsRead,
  };
}
