import { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Search, User as UserIcon } from 'lucide-react';
import type {
  HospitalBootstrapPayload,
  QueueToken,
  User,
} from '../shared/types.ts';
import { DoctorAvatar } from './DoctorAvatar.tsx';
import { DoctorAvailabilityLabel, TokenStatusLabel } from './StatusText.tsx';

interface PatientDashboardProps {
  user: User;
  data: HospitalBootstrapPayload;
  onBookAppointment: (input: {
    departmentId: string;
    doctorId: string;
    slotTime: string;
    reason: string;
  }) => Promise<{ token: QueueToken }>;
  onCancelToken: (tokenId: string) => Promise<unknown>;
  onUpdateProfile: (patch: {
    name?: string;
    phone?: string;
    age?: number;
    gender?: string;
    bloodGroup?: string;
    medicalNotes?: string;
  }) => Promise<unknown>;
}

const SLOTS = [
  'Next Available (Immediate Token)',
  'Today · 11:30 AM',
  'Today · 02:15 PM',
  'Today · 04:00 PM',
  'Tomorrow · 09:30 AM',
];

export function PatientDashboard({
  user,
  data,
  onBookAppointment,
  onCancelToken,
  onUpdateProfile,
}: PatientDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'book' | 'history' | 'profile'>('overview');
  const [selectedDept, setSelectedDept] = useState<string>(data.departments[0]?.id || 'dept-gen');
  const [selectedDoc, setSelectedDoc] = useState<string>('');
  const [slotTime, setSlotTime] = useState<string>(SLOTS[0]);
  const [reason, setReason] = useState<string>('Outpatient Consultation');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  // Profile form state
  const [profName, setProfName] = useState(user.name);
  const [profPhone, setProfPhone] = useState(user.phone);
  const [profAge, setProfAge] = useState(user.age ? String(user.age) : '');
  const [profGender, setProfGender] = useState(user.gender || 'Female');
  const [profBlood, setProfBlood] = useState(user.bloodGroup || 'O+');
  const [profNotes, setProfNotes] = useState(user.medicalNotes || '');
  const [profSaved, setProfSaved] = useState(false);

  const myTokens = useMemo(() => {
    return data.tokens
      .filter((t) => t.patientId === user.id || t.patientName.toLowerCase() === user.name.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data.tokens, user.id, user.name]);

  const activeToken: QueueToken | undefined = myTokens.find(
    (t) => t.status === 'waiting' || t.status === 'approaching' || t.status === 'in_consultation'
  );

  const filteredDoctors = useMemo(() => {
    return data.doctors.filter((d) => d.departmentId === selectedDept);
  }, [data.doctors, selectedDept]);

  const activeDoctorId =
    selectedDoc && filteredDoctors.some((d) => d.id === selectedDoc)
      ? selectedDoc
      : filteredDoctors[0]?.id || '';

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return myTokens.filter((t) => {
      if (!q) return true;
      const doc = data.doctors.find((d) => d.id === t.doctorId);
      const dept = data.departments.find((d) => d.id === t.departmentId);
      return (
        t.tokenNumber.toLowerCase().includes(q) ||
        (doc?.name.toLowerCase().includes(q) ?? false) ||
        (dept?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [myTokens, historySearch, data.doctors, data.departments]);

  function estimateWaitIfJoinedNow(doctorId: string, departmentId: string): number {
    const dept = data.departments.find((d) => d.id === departmentId);
    const doc = data.doctors.find((d) => d.id === doctorId);
    const waitingForDoc = data.tokens.filter(
      (t) =>
        t.doctorId === doctorId &&
        (t.status === 'waiting' || t.status === 'approaching' || t.status === 'in_consultation')
    );
    const avg = doc?.avgConsultationMinutes || dept?.avgConsultationMinutes || 12;
    if (doc?.availability === 'unavailable') return Math.round(waitingForDoc.length * avg + 28);
    if (waitingForDoc.length === 0 && doc?.availability === 'available') return 4;
    return Math.round(waitingForDoc.length * avg + (doc?.availability === 'occupied' ? avg * 0.5 : 0));
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDoctorId) return;
    setBookingBusy(true);
    setBookingFeedback(null);
    try {
      const res = await onBookAppointment({
        departmentId: selectedDept,
        doctorId: activeDoctorId,
        slotTime,
        reason,
      });
      setBookingFeedback(
        `Token ${res.token.tokenNumber} issued · AI predicted wait: ${res.token.prediction.predictedWaitMinutes} min`
      );
      setActiveTab('overview');
    } finally {
      setBookingBusy(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfSaved(false);
    await onUpdateProfile({
      name: profName,
      phone: profPhone,
      age: profAge ? Number(profAge) : undefined,
      gender: profGender,
      bloodGroup: profBlood,
      medicalNotes: profNotes,
    });
    setProfSaved(true);
    window.setTimeout(() => setProfSaved(false), 3000);
  }

  const activeDoc = activeToken ? data.doctors.find((d) => d.id === activeToken.doctorId) : null;
  const activeDept = activeToken
    ? data.departments.find((d) => d.id === activeToken.departmentId)
    : null;

  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'overview'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Live Queue Status
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('book')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'book'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Book Appointment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Visit History ({myTokens.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'profile'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Profile
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('book')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Calendar className="w-3.5 h-3.5" />
          New Appointment
        </button>
      </div>

      {bookingFeedback && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bookingFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setBookingFeedback(null)}
            className="text-xs text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Focal Anchor: Live Token & AI Waiting Time Prediction */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {activeToken ? (
              <div>
                <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>{activeDept?.name || 'Department'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeDoc?.room || 'Outpatient'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeToken.appointmentId}</span>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-3">
                      <span className="text-3xl font-bold font-mono tabular-nums tracking-tight text-slate-900">
                        {activeToken.tokenNumber}
                      </span>
                      <TokenStatusLabel status={activeToken.status} />
                    </div>
                  </div>
                  {activeToken.status !== 'in_consultation' && (
                    <button
                      type="button"
                      onClick={() => onCancelToken(activeToken.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Cancel Token
                    </button>
                  )}
                </div>

                {/* Core AI Prediction Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/60">
                  <div className="px-6 py-4">
                    <div className="text-xs text-slate-500">AI Predicted Wait</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-teal-700 mt-1">
                      {activeToken.status === 'in_consultation'
                        ? 'Now'
                        : `${activeToken.prediction.predictedWaitMinutes} min`}
                    </div>
                    {activeToken.status !== 'in_consultation' && (
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        Range {activeToken.prediction.lowMinutes}–{activeToken.prediction.highMinutes} min
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4">
                    <div className="text-xs text-slate-500">Expected Consult</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
                      {activeToken.status === 'in_consultation'
                        ? 'In Progress'
                        : activeToken.prediction.expectedConsultationTime}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {activeToken.prediction.confidencePercent}% confidence
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="text-xs text-slate-500">Patients Ahead</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {activeToken.status === 'in_consultation'
                        ? 0
                        : activeToken.prediction.patientsAhead}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Queue pos #{activeToken.prediction.patientsAhead + 1}
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="text-xs text-slate-500">Assigned Physician</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1.5 truncate">
                      {activeDoc?.name || 'Physician'}
                    </div>
                    <div className="mt-0.5">
                      {activeDoc && <DoctorAvailabilityLabel availability={activeDoc.availability} />}
                    </div>
                  </div>
                </div>

                {/* Progress Stepper */}
                <div className="px-6 py-5 border-b border-slate-100">
                  <div className="text-xs font-medium text-slate-700 mb-3">Queue Progression</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'registered', label: 'Token Issued', active: true },
                      {
                        key: 'waiting',
                        label: 'In Queue',
                        active: ['waiting', 'approaching', 'in_consultation'].includes(activeToken.status),
                      },
                      {
                        key: 'approaching',
                        label: 'Turn Approaching',
                        active: ['approaching', 'in_consultation'].includes(activeToken.status),
                      },
                      {
                        key: 'in_consultation',
                        label: 'In Consultation',
                        active: activeToken.status === 'in_consultation',
                      },
                    ].map((step) => (
                      <div key={step.key} className="space-y-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-colors ${
                            step.active ? 'bg-teal-600' : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`text-[11px] ${
                            step.active ? 'font-medium text-slate-900' : 'text-slate-400'
                          }`}
                        >
                          {step.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Explainable AI Factors */}
                <div className="px-6 py-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-slate-900">
                      AI Prediction Breakdown
                    </h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Model: {activeToken.prediction.modelUsed.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {activeToken.prediction.factors.map((f, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-xs font-medium text-slate-800">{f.label}</div>
                          <div className="text-[11px] text-slate-500">{f.detail}</div>
                        </div>
                        <span
                          className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                            f.impactMinutes > 0
                              ? 'text-amber-700'
                              : f.impactMinutes < 0
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {f.impactMinutes > 0 ? `+${f.impactMinutes} min` : `${f.impactMinutes} min`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-900">No Active Queue Token</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1.5">
                  Book an appointment with a specialist to receive an instant digital token and real-time AI waiting time prediction.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('book')}
                  className="mt-5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                >
                  Book Appointment Now
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Live Department Wait Estimates */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Live Department Wait Times</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updated continuously as consultations finish
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {data.analytics.departmentBreakdown.map((dept) => (
                <div
                  key={dept.departmentId}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{dept.departmentName}</div>
                    <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {dept.waitingCount} waiting · {dept.activeDoctors}/{dept.totalDoctors} doctors active
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                      {dept.avgPredictedWaitMinutes > 0
                        ? `~${dept.avgPredictedWaitMinutes} min`
                        : 'Immediate'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDept(dept.departmentId);
                        setActiveTab('book');
                      }}
                      className="text-[11px] font-medium text-teal-700 hover:underline mt-0.5"
                    >
                      Book slot
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'book' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-900">Book Consultation & Generate Token</h2>
            <p className="text-xs text-slate-500 mt-1">
              Select a clinical department and physician. SmartQueue calculates expected waiting time dynamically before you confirm.
            </p>

            <form onSubmit={handleBook} className="mt-6 space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  1. Clinical Department
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {data.departments.map((dept) => {
                    const active = selectedDept === dept.id;
                    return (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => {
                          setSelectedDept(dept.id);
                          setSelectedDoc('');
                        }}
                        className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                          active
                            ? 'border-teal-600 bg-teal-50/70 text-teal-900 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate">{dept.name}</div>
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5 tabular-nums">
                          {dept.avgConsultationMinutes} min avg
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  2. Select Physician
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredDoctors.map((doc) => {
                    const estWait = estimateWaitIfJoinedNow(doc.id, selectedDept);
                    const queueDepth = data.tokens.filter(
                      (t) => t.doctorId === doc.id && (t.status === 'waiting' || t.status === 'approaching')
                    ).length;
                    const isPicked = activeDoctorId === doc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDoc(doc.id)}
                        className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 ${
                          isPicked
                            ? 'border-teal-600 bg-teal-50/50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <DoctorAvatar name={doc.name} avatarUrl={doc.avatarUrl} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {doc.name}
                            </span>
                            <DoctorAvailabilityLabel availability={doc.availability} />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {doc.specialty} · {doc.room}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs tabular-nums">
                            <span className="text-slate-600">{queueDepth} in queue</span>
                            <span className="font-mono font-semibold text-teal-700">
                              Est. wait ~{estWait} min
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    3. Appointment Window
                  </label>
                  <select
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    4. Visit Reason
                  </label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Blood pressure follow-up"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={bookingBusy || !activeDoctorId}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {bookingBusy ? 'Generating Digital Token...' : 'Confirm & Generate Digital Token'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Appointments & Token History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare AI predicted waiting times against actual recorded consultations
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search token, doctor, dept..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Token</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Physician</th>
                  <th className="py-2.5 px-4">Slot</th>
                  <th className="py-2.5 px-4 text-right">AI Wait</th>
                  <th className="py-2.5 px-4 text-right">Actual Wait</th>
                  <th className="py-2.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No matching visits found.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((t) => {
                    const doc = data.doctors.find((d) => d.id === t.doctorId);
                    const dept = data.departments.find((d) => d.id === t.departmentId);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-6 font-mono font-semibold text-slate-900 tabular-nums">
                          {t.tokenNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{dept?.name}</td>
                        <td className="py-3 px-4 text-slate-700">{doc?.name}</td>
                        <td className="py-3 px-4 text-slate-500">{t.scheduledSlot}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {t.prediction.predictedWaitMinutes} min
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                          {t.actualWaitMinutes !== undefined ? `${t.actualWaitMinutes} min` : '—'}
                        </td>
                        <td className="py-3 px-6">
                          <TokenStatusLabel status={t.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Patient Profile</h2>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <form onSubmit={handleProfileSave} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={profPhone}
                  onChange={(e) => setProfPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                <input
                  type="number"
                  value={profAge}
                  onChange={(e) => setProfAge(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={profGender}
                  onChange={(e) => setProfGender(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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
                  value={profBlood}
                  onChange={(e) => setProfBlood(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Medical Notes / Allergies</label>
              <textarea
                rows={3}
                value={profNotes}
                onChange={(e) => setProfNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
              >
                Save Profile Changes
              </button>
              {profSaved && (
                <span className="text-xs font-medium text-emerald-700">Profile saved</span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
