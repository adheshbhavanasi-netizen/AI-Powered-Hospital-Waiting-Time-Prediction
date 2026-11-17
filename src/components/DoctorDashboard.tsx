import { useMemo, useState } from 'react';
import { Check, Play, UserX } from 'lucide-react';
import type {
  DoctorAvailability,
  HospitalBootstrapPayload,
  PriorityLevel,
  TokenStatus,
  User,
} from '../shared/types.ts';
import { DoctorAvatar } from './DoctorAvatar.tsx';
import { DoctorAvailabilityLabel, PriorityLabel, TokenStatusLabel } from './StatusText.tsx';

interface DoctorDashboardProps {
  user: User;
  data: HospitalBootstrapPayload;
  onUpdateTokenStatus: (
    tokenId: string,
    status: TokenStatus,
    clinicalNotes?: string
  ) => Promise<unknown>;
  onUpdateAvailability: (doctorId: string, availability: DoctorAvailability) => Promise<unknown>;
}

function priorityOrder(p: PriorityLevel): number {
  if (p === 'critical') return 0;
  if (p === 'urgent') return 1;
  return 2;
}

export function DoctorDashboard({
  user,
  data,
  onUpdateTokenStatus,
  onUpdateAvailability,
}: DoctorDashboardProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    user.doctorId || data.doctors[0]?.id || 'doc-chen'
  );
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const doctor =
    data.doctors.find((d) => d.id === selectedDoctorId) || data.doctors[0];
  const dept = data.departments.find((d) => d.id === doctor?.departmentId);

  const activeConsultToken = useMemo(() => {
    return data.tokens.find(
      (t) => t.doctorId === doctor?.id && t.status === 'in_consultation'
    );
  }, [data.tokens, doctor?.id]);

  const waitingQueue = useMemo(() => {
    return data.tokens
      .filter(
        (t) =>
          t.doctorId === doctor?.id &&
          (t.status === 'waiting' || t.status === 'approaching')
      )
      .sort((a, b) => {
        const pDiff = priorityOrder(a.priority) - priorityOrder(b.priority);
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [data.tokens, doctor?.id]);

  const completedTodayTokens = useMemo(() => {
    return data.tokens
      .filter((t) => t.doctorId === doctor?.id && t.status === 'completed')
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.createdAt).getTime() -
          new Date(a.completedAt || a.createdAt).getTime()
      );
  }, [data.tokens, doctor?.id]);

  async function handleAction(tokenId: string, status: TokenStatus, notes?: string) {
    setBusyId(tokenId);
    try {
      await onUpdateTokenStatus(tokenId, status, notes);
      if (status === 'completed') setClinicalNotes('');
    } finally {
      setBusyId(null);
    }
  }

  if (!doctor) return null;

  const elapsedConsultMinutes = activeConsultToken?.consultationStartedAt
    ? Math.max(
        1,
        Math.round(
          (Date.now() - new Date(activeConsultToken.consultationStartedAt).getTime()) /
            60_000
        )
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Physician Header & Availability Control */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <DoctorAvatar name={doctor.name} avatarUrl={doctor.avatarUrl} size="lg" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                aria-label="Select physician workspace"
                value={doctor.id}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="text-base font-semibold text-slate-900 bg-transparent border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {data.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <DoctorAvailabilityLabel availability={doctor.availability} />
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {dept?.name} · {doctor.room} · Avg consult {doctor.avgConsultationMinutes} min ·{' '}
              {doctor.consultationsToday} completed today
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">Availability:</span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['available', 'occupied', 'unavailable'] as DoctorAvailability[]).map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => onUpdateAvailability(doctor.id, state)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                  doctor.availability === state
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split: Active Consultation + Priority Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Active Consultation Room */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Active Consultation Room</h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">{doctor.room}</span>
          </div>
          {activeConsultToken ? (
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900">
                      {activeConsultToken.tokenNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <PriorityLabel priority={activeConsultToken.priority} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mt-1">
                    {activeConsultToken.patientName}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {activeConsultToken.patientPhone} · Waited{' '}
                    {activeConsultToken.actualWaitMinutes ?? 8} min
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Elapsed</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-teal-700">
                    {elapsedConsultMinutes} min
                  </div>
                </div>
              </div>

              {activeConsultToken.triageNote && (
                <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <span className="font-semibold">Triage Note:</span> {activeConsultToken.triageNote}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Consultation Summary & Outcome
                </label>
                <textarea
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Record diagnosis, prescription, or follow-up instructions..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="button"
                disabled={busyId === activeConsultToken.id}
                onClick={() => handleAction(activeConsultToken.id, 'completed', clinicalNotes)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                Complete Consultation & Advance Queue
              </button>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900">Room Currently Open</p>
              <p className="text-xs text-slate-500 mt-1">
                {waitingQueue.length > 0
                  ? `Next patient ${waitingQueue[0].tokenNumber} (${waitingQueue[0].patientName}) is ready to be called.`
                  : 'No patients currently waiting in your queue.'}
              </p>
              {waitingQueue.length > 0 && (
                <button
                  type="button"
                  disabled={busyId === waitingQueue[0].id}
                  onClick={() => handleAction(waitingQueue[0].id, 'in_consultation')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Call Next ({waitingQueue[0].tokenNumber})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Waiting Queue Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Assigned Patient Queue</h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {waitingQueue.length} waiting · Ordered by triage priority & arrival
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Token</th>
                  <th className="py-2.5 px-4">Patient</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4 text-right">AI Wait Est.</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {waitingQueue.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      All scheduled patients have been seen.
                    </td>
                  </tr>
                ) : (
                  waitingQueue.map((token) => (
                    <tr key={token.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-6 font-mono font-semibold text-slate-900 tabular-nums">
                        {token.tokenNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{token.patientName}</div>
                        {token.triageNote && (
                          <div className="text-[11px] text-amber-700 mt-0.5 truncate max-w-[200px]">
                            {token.triageNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityLabel priority={token.priority} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {token.prediction.predictedWaitMinutes} min
                      </td>
                      <td className="py-3 px-4">
                        <TokenStatusLabel status={token.status} />
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === token.id || Boolean(activeConsultToken)}
                            title={
                              activeConsultToken
                                ? 'Complete active consultation first'
                                : 'Start consultation'
                            }
                            onClick={() => handleAction(token.id, 'in_consultation')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
                          >
                            <Play className="w-3 h-3" />
                            Start
                          </button>
                          <button
                            type="button"
                            disabled={busyId === token.id}
                            onClick={() => handleAction(token.id, 'no_show')}
                            title="Mark patient no-show"
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {completedTodayTokens.length > 0 && (
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <div className="text-[11px] font-semibold text-slate-500 mb-2">
                Recently Completed Today ({completedTodayTokens.length})
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 tabular-nums">
                {completedTodayTokens.slice(0, 4).map((t) => (
                  <span key={t.id}>
                    <span className="font-mono font-medium text-slate-900">{t.tokenNumber}</span> ·{' '}
                    {t.patientName} ({t.actualConsultationMinutes ?? doctor.avgConsultationMinutes}{' '}
                    min consult)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
