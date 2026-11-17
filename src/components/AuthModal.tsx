import { useState } from 'react';
import { X } from 'lucide-react';
import type { UserRole } from '../shared/types.ts';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<unknown>;
  onRegister: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    age?: number;
    gender?: string;
    bloodGroup?: string;
  }) => Promise<unknown>;
  onDemoRole: (role: UserRole) => Promise<unknown>;
}

const DEMO_ROLES: { role: UserRole; title: string; subtitle: string; email: string }[] = [
  {
    role: 'patient',
    title: 'Patient Portal',
    subtitle: 'Maya Lin · Track GEN-104 & book consultations',
    email: 'maya.lin@patient.smartqueue.org',
  },
  {
    role: 'doctor',
    title: 'Doctor Console',
    subtitle: 'Dr. Mei-Ling Chen · General Medicine Room 104',
    email: 'dr.chen@smartqueue.org',
  },
  {
    role: 'receptionist',
    title: 'Receptionist Desk',
    subtitle: 'Elena Vance · Walk-in & Emergency Triage',
    email: 'reception@smartqueue.org',
  },
  {
    role: 'admin',
    title: 'Hospital Admin',
    subtitle: 'Dr. Marcus Thorne · Operations & ML Prediction Lab',
    email: 'admin@smartqueue.org',
  },
];

export function AuthModal({ open, onClose, onLogin, onRegister, onDemoRole }: AuthModalProps) {
  const [mode, setMode] = useState<'roles' | 'login' | 'register'>('roles');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState('maya.lin@patient.smartqueue.org');
  const [password, setPassword] = useState('smartqueue123');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAge, setRegAge] = useState('');
  const [regGender, setRegGender] = useState('Female');
  const [regBlood, setRegBlood] = useState('O+');

  if (!open) return null;

  async function handleRolePick(role: UserRole) {
    setErr(null);
    setBusy(true);
    try {
      await onDemoRole(role);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed switching role');
    } finally {
      setBusy(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await onLogin(email, password);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await onRegister({
        name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        age: regAge ? Number(regAge) : undefined,
        gender: regGender,
        bloodGroup: regBlood,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">SmartQueue Access</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Switch workspace roles or register a new patient account
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close access dialog"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('roles');
                setErr(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'roles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Switch Role
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErr(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              New Patient
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErr(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
          </div>
        </div>

        <div className="p-6">
          {err && (
            <div className="mb-4 px-3 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {err}
            </div>
          )}

          {mode === 'roles' && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {DEMO_ROLES.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  disabled={busy}
                  onClick={() => handleRolePick(item.role)}
                  className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.subtitle}</div>
                  </div>
                  <span className="text-xs font-medium text-teal-700 whitespace-nowrap shrink-0">
                    Open Workspace
                  </span>
                </button>
              ))}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Demo password for pre-seeded accounts: smartqueue123
                </p>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60"
              >
                {busy ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+1 (415) 555-0192"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="alex@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Minimum 4 chars"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    placeholder="32"
                    value={regAge}
                    onChange={(e) => setRegAge(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                  <select
                    value={regGender}
                    onChange={(e) => setRegGender(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option>Female</option>
                    <option>Male</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={regBlood}
                    onChange={(e) => setRegBlood(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option>O+</option>
                    <option>O-</option>
                    <option>A+</option>
                    <option>A-</option>
                    <option>B+</option>
                    <option>B-</option>
                    <option>AB+</option>
                    <option>AB-</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60"
              >
                {busy ? 'Creating account...' : 'Register Patient Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
