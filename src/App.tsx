import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  Cpu,
  Menu,
  Stethoscope,
  UserCheck,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AIPredictionLab } from './components/AIPredictionLab.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { DoctorDashboard } from './components/DoctorDashboard.tsx';
import { NotificationsDrawer } from './components/NotificationsDrawer.tsx';
import { PatientDashboard } from './components/PatientDashboard.tsx';
import { ReceptionistDashboard } from './components/ReceptionistDashboard.tsx';
import { useSmartQueue } from './hooks/useSmartQueue.ts';
import type { UserRole } from './shared/types.ts';

type WorkspaceView = 'patient' | 'doctor' | 'receptionist' | 'admin' | 'ai_lab';

const NAV_ITEMS: {
  id: WorkspaceView;
  label: string;
  roleSwitch?: UserRole;
  icon: typeof Activity;
}[] = [
  { id: 'patient', label: 'Patient Portal', roleSwitch: 'patient', icon: UserCheck },
  { id: 'doctor', label: 'Doctor Console', roleSwitch: 'doctor', icon: Stethoscope },
  { id: 'receptionist', label: 'Receptionist Desk', roleSwitch: 'receptionist', icon: ClipboardList },
  { id: 'admin', label: 'Hospital Analytics', roleSwitch: 'admin', icon: BarChart3 },
  { id: 'ai_lab', label: 'AI Prediction Lab', icon: Cpu },
];

export default function App() {
  const {
    user,
    data,
    loading,
    error,
    wsConnected,
    toast,
    dismissToast,
    demoLogin,
    login,
    registerPatient,
    updateProfile,
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
  } = useSmartQueue();

  const [view, setView] = useState<WorkspaceView>('patient');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const unreadCount = useMemo(() => {
    if (!data) return 0;
    return data.notifications.filter((n) => !n.read).length;
  }, [data]);

  const currentNav = NAV_ITEMS.find((item) => item.id === view) || NAV_ITEMS[0];

  async function handleNavSelect(item: (typeof NAV_ITEMS)[number]) {
    setView(item.id);
    setMobileNavOpen(false);
    // Keep user identity aligned when switching into a staff role unless a custom patient registered
    if (item.roleSwitch && user && user.role !== item.roleSwitch) {
      if (item.roleSwitch === 'patient' && user.role === 'patient') return;
      await demoLogin(item.roleSwitch);
    }
  }

  async function handleDemoRoleSwitch(role: UserRole) {
    await demoLogin(role);
    setView(role);
  }

  async function handleLoginSuccess(email: string, password: string) {
    const loggedIn = (await login(email, password)) as { role: UserRole };
    setView(loggedIn.role);
  }

  async function handleRegisterSuccess(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    age?: number;
    gender?: string;
    bloodGroup?: string;
  }) {
    await registerPatient(payload);
    setView('patient');
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar (260px) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setView('patient');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            SmartQueue
          </a>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-medium text-slate-400">Workspaces</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavSelect(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Session Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          {user && (
            <div className="px-2">
              <div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div>
              <div className="text-[11px] text-slate-500 capitalize mt-0.5">
                {user.role} · {wsConnected ? 'Live sync' : 'Reconnecting'}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="w-full py-2 px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors whitespace-nowrap"
          >
            Switch Account / Register
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, max 2 single-line actions on right */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">Hospital Operations</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{currentNav.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alerts</span>
              {unreadCount > 0 && (
                <span className="font-mono tabular-nums text-teal-700 font-semibold">
                  ({unreadCount})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Role Access' : 'Sign In'}
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl">
              {error}
            </div>
          )}

          {loading || !data || !user ? (
            <div className="space-y-6">
              <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              {view === 'patient' && (
                <PatientDashboard
                  user={user}
                  data={data}
                  onBookAppointment={bookAppointment}
                  onCancelToken={(id) => updateTokenStatus(id, 'cancelled')}
                  onUpdateProfile={updateProfile}
                />
              )}
              {view === 'doctor' && (
                <DoctorDashboard
                  user={user}
                  data={data}
                  onUpdateTokenStatus={updateTokenStatus}
                  onUpdateAvailability={updateDoctorAvailability}
                />
              )}
              {view === 'receptionist' && (
                <ReceptionistDashboard
                  data={data}
                  onRegisterWalkIn={registerWalkIn}
                  onRegisterEmergency={registerEmergency}
                  onUpdateTokenStatus={updateTokenStatus}
                  onReassignToken={reassignToken}
                />
              )}
              {view === 'admin' && (
                <AdminDashboard
                  data={data}
                  onUpdateAvailability={updateDoctorAvailability}
                  onOpenAILab={() => setView('ai_lab')}
                />
              )}
              {view === 'ai_lab' && (
                <AIPredictionLab
                  data={data}
                  onSetActiveModel={setActiveModel}
                  onRetrain={retrainModels}
                  onPredictWhatIf={predictWhatIf}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Real-time WebSocket Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-white border border-slate-200 rounded-xl shadow-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-teal-700">{toast.title}</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLoginSuccess}
        onRegister={handleRegisterSuccess}
        onDemoRole={handleDemoRoleSwitch}
      />

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={data?.notifications || []}
        user={user}
        onMarkAllRead={markNotificationsRead}
      />
    </div>
  );
}
