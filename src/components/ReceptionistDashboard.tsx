import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import type {
  HospitalBootstrapPayload,
  PriorityLevel,
  TokenStatus,
} from '../shared/types.ts';
import { PriorityLabel, TokenStatusLabel } from './StatusText.tsx';

interface ReceptionistDashboardProps {
  data: HospitalBootstrapPayload;
  onRegisterWalkIn: (input: {
    patientName: string;
    patientPhone: string;
    departmentId: string;
    doctorId: string;
  }) => Promise<unknown>;
  onRegisterEmergency: (input: {
    patientName: string;
    patientPhone: string;
    departmentId: string;
    doctorId: string;
    priority: PriorityLevel;
    triageNote: string;
  }) => Promise<unknown>;
  onUpdateTokenStatus: (tokenId: string, status: TokenStatus) => Promise<unknown>;
  onReassignToken: (tokenId: string, doctorId: string) => Promise<unknown>;
}

export function ReceptionistDashboard({
  data,
  onRegisterWalkIn,
  onRegisterEmergency,
  onUpdateTokenStatus,
  onReassignToken,
}: ReceptionistDashboardProps) {
  const [intakeMode, setIntakeMode] = useState<'walk_in' | 'emergency'>('walk_in');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id || 'dept-gen');
  const [doctorId, setDoctorId] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('critical');
  const [triageNote, setTriageNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const deptDoctors = useMemo(
    () => data.doctors.filter((d) => d.departmentId === departmentId),
    [data.doctors, departmentId]
  );

  const activeDocId =
    doctorId && deptDoctors.some((d) => d.id === doctorId)
      ? doctorId
      : deptDoctors[0]?.id || '';

  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.tokens
      .filter((t) => {
        if (filterDept !== 'all' && t.departmentId !== filterDept) return false;
        if (filterStatus === 'active') {
          if (!['waiting', 'approaching', 'in_consultation'].includes(t.status)) return false;
        } else if (filterStatus !== 'all' && t.status !== filterStatus) {
          return false;
        }
        if (q) {
          return (
            t.tokenNumber.toLowerCase().includes(q) ||
            t.patientName.toLowerCase().includes(q) ||
            t.appointmentId.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const statusWeight = (s: TokenStatus) =>
          s === 'in_consultation' ? 0 : s === 'approaching' ? 1 : s === 'waiting' ? 2 : 3;
        const sw = statusWeight(a.status) - statusWeight(b.status);
        if (sw !== 0) return sw;
        const pWeight = (p: PriorityLevel) => (p === 'critical' ? 0 : p === 'urgent' ? 1 : 2);
        const pw = pWeight(a.priority) - pWeight(b.priority);
        if (pw !== 0) return pw;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [data.tokens, filterDept, filterStatus, searchQuery]);

  async function handleIntakeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeDocId || !patientName.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (intakeMode === 'walk_in') {
        const res = (await onRegisterWalkIn({
          patientName,
          patientPhone: patientPhone || '+1 (415) 555-0190',
          departmentId,
          doctorId: activeDocId,
        })) as { token: { tokenNumber: string; prediction: { predictedWaitMinutes: number } } };
        setFeedback(
          `Walk-in token ${res.token.tokenNumber} issued · Est. wait ${res.token.prediction.predictedWaitMinutes} min`
        );
      } else {
        const res = (await onRegisterEmergency({
          patientName,
          patientPhone: patientPhone || 'Emergency Desk',
          departmentId,
          doctorId: activeDocId,
          priority,
          triageNote: triageNote || 'Urgent triage stabilization required',
        })) as { token: { tokenNumber: string } };
        setFeedback(
          `Emergency token ${res.token.tokenNumber} prioritized. Downstream queue estimates recalculated.`
        );
      }
      setPatientName('');
      setPatientPhone('');
      setTriageNote('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Walk-In & Emergency Triage Registration */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Patient Intake Desk</h2>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => setIntakeMode('walk_in')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              intakeMode === 'walk_in'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Walk-In Token
          </button>
          <button
            type="button"
            onClick={() => setIntakeMode('emergency')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              intakeMode === 'emergency'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Emergency Triage
          </button>
        </div>

        {feedback && (
          <div className="mb-4 px-3 py-2.5 text-xs bg-teal-50 border border-teal-200 text-teal-900 rounded-lg">
            {feedback}
          </div>
        )}

        <form onSubmit={handleIntakeSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Patient Full Name</label>
            <input
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g., Jordan Vance"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone</label>
            <input
              type="tel"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              placeholder="+1 (415) 555-0155"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setDoctorId('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Physician</label>
              <select
                value={activeDocId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {deptDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.availability})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {intakeMode === 'emergency' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Triage Acuity Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg bg-red-50/40 text-red-900"
                >
                  <option value="critical">Level 1 · Critical (Immediate Priority)</option>
                  <option value="urgent">Level 2 · Urgent (Expedited)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinical Triage Note
                </label>
                <textarea
                  rows={2}
                  required
                  value={triageNote}
                  onChange={(e) => setTriageNote(e.target.value)}
                  placeholder="Chest pain, acute trauma, SpO2 91%..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-60 ${
              intakeMode === 'emergency'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {intakeMode === 'emergency' ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                Prioritize Emergency & Recalculate Queue
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Register Walk-In & Issue Token
              </>
            )}
          </button>
        </form>
      </div>

      {/* Right: Hospital Master Queue Control */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Hospital Master Queue</h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {filteredTokens.length} tokens matching filters
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Token or patient..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Departments</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="active">Active Queue</option>
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                <th className="py-2.5 px-6">Token</th>
                <th className="py-2.5 px-4">Patient</th>
                <th className="py-2.5 px-4">Physician</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4 text-right">AI Wait</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-6 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No queue tokens match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTokens.map((t) => {
                  const dept = data.departments.find((d) => d.id === t.departmentId);
                  const isActive = ['waiting', 'approaching', 'in_consultation'].includes(t.status);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-6">
                        <div className="font-mono font-semibold text-slate-900 tabular-nums">
                          {t.tokenNumber}
                        </div>
                        <div className="text-[11px] text-slate-400">{dept?.code}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{t.patientName}</div>
                        <div className="text-[11px] text-slate-500">{t.visitType.replace('_', '-')}</div>
                      </td>
                      <td className="py-3 px-4">
                        {isActive ? (
                          <select
                            aria-label={`Reassign physician for ${t.tokenNumber}`}
                            value={t.doctorId}
                            onChange={(e) => onReassignToken(t.id, e.target.value)}
                            className="px-2 py-1 text-xs border border-slate-200 rounded bg-white max-w-[160px]"
                          >
                            {data.doctors.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-600">
                            {data.doctors.find((d) => d.id === t.doctorId)?.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityLabel priority={t.priority} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {t.status === 'in_consultation'
                          ? 'Now'
                          : t.status === 'completed'
                          ? `${t.actualWaitMinutes ?? t.prediction.predictedWaitMinutes}m`
                          : `${t.prediction.predictedWaitMinutes}m`}
                      </td>
                      <td className="py-3 px-4">
                        <TokenStatusLabel status={t.status} />
                      </td>
                      <td className="py-3 px-6 text-right">
                        {isActive ? (
                          <div className="inline-flex items-center gap-1.5">
                            {t.status !== 'in_consultation' ? (
                              <button
                                type="button"
                                onClick={() => onUpdateTokenStatus(t.id, 'in_consultation')}
                                className="px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 border border-teal-200 rounded transition-colors whitespace-nowrap"
                              >
                                Call
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onUpdateTokenStatus(t.id, 'completed')}
                                className="px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded transition-colors whitespace-nowrap"
                              >
                                Complete
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onUpdateTokenStatus(t.id, 'cancelled')}
                              className="px-2 py-1 text-[11px] text-slate-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
