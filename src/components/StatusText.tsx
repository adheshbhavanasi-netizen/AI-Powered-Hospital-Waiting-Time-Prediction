import type { DoctorAvailability, PriorityLevel, TokenStatus } from '../shared/types.ts';

export function TokenStatusLabel({ status }: { status: TokenStatus }) {
  const map: Record<TokenStatus, { label: string; cls: string }> = {
    waiting: { label: 'Waiting', cls: 'text-slate-700' },
    approaching: { label: 'Turn Approaching', cls: 'text-amber-700 font-medium' },
    in_consultation: { label: 'In Consultation', cls: 'text-teal-700 font-medium' },
    completed: { label: 'Completed', cls: 'text-emerald-700' },
    cancelled: { label: 'Cancelled', cls: 'text-slate-400' },
    no_show: { label: 'No-Show', cls: 'text-red-600' },
  };
  const entry = map[status] || map.waiting;
  return <span className={`text-xs whitespace-nowrap ${entry.cls}`}>{entry.label}</span>;
}

export function DoctorAvailabilityLabel({ availability }: { availability: DoctorAvailability }) {
  const map: Record<DoctorAvailability, { label: string; cls: string }> = {
    available: { label: 'Available', cls: 'text-emerald-700 font-medium' },
    occupied: { label: 'In Consultation', cls: 'text-amber-700 font-medium' },
    unavailable: { label: 'Unavailable', cls: 'text-red-600 font-medium' },
  };
  const entry = map[availability];
  return <span className={`text-xs whitespace-nowrap ${entry.cls}`}>{entry.label}</span>;
}

export function PriorityLabel({ priority }: { priority: PriorityLevel }) {
  if (priority === 'critical') {
    return <span className="text-xs font-semibold text-red-700 whitespace-nowrap">Critical Triage</span>;
  }
  if (priority === 'urgent') {
    return <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Urgent Triage</span>;
  }
  return <span className="text-xs text-slate-500 whitespace-nowrap">Standard</span>;
}
