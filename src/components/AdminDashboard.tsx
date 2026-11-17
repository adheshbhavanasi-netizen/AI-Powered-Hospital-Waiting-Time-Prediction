import { useState } from 'react';
import { Download } from 'lucide-react';
import type {
  DoctorAvailability,
  HospitalBootstrapPayload,
} from '../shared/types.ts';
import { DoctorAvatar } from './DoctorAvatar.tsx';
import { DoctorAvailabilityLabel } from './StatusText.tsx';

interface AdminDashboardProps {
  data: HospitalBootstrapPayload;
  onUpdateAvailability: (doctorId: string, availability: DoctorAvailability) => Promise<unknown>;
  onOpenAILab: () => void;
}

export function AdminDashboard({
  data,
  onUpdateAvailability,
  onOpenAILab,
}: AdminDashboardProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const { analytics } = data;

  const maxArrivals = Math.max(...analytics.hourlyFlow.map((h) => h.arrivals), 1);
  const maxWait = Math.max(...analytics.hourlyFlow.map((h) => h.avgWaitMinutes), 1);

  const activeHoverPoint =
    hoveredHour !== null
      ? analytics.hourlyFlow.find((h) => h.hour === hoveredHour)
      : analytics.hourlyFlow.find((h) => h.isPeak) || analytics.hourlyFlow[0];

  // Build SVG polyline points for wait time trend
  const chartW = 640;
  const chartH = 190;
  const padX = 28;
  const padY = 20;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const waitPoints = analytics.hourlyFlow
    .map((pt, idx) => {
      const x = padX + (idx / Math.max(1, analytics.hourlyFlow.length - 1)) * innerW;
      const y = padY + innerH - (pt.avgWaitMinutes / (maxWait * 1.15)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="space-y-6">
      {/* Top Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Hospital Operations Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Peak arrival window: {analytics.peakHourLabel} · Completion rate:{' '}
            {analytics.appointmentCompletionRate}%
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAILab}
            className="px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Open AI Prediction Lab
          </button>
          <a
            href="/api/reports/export"
            download="smartqueue-hospital-report.csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV Report
          </a>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        <div className="p-5">
          <div className="text-xs text-slate-500">Registered Patients</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analytics.totalRegisteredPatients}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {analytics.completedToday} consultations completed today
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">Currently Waiting</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analytics.currentlyWaiting}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {analytics.inConsultationNow} actively in consultation
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">Avg Predicted Wait</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-teal-700 mt-1">
            {analytics.avgPredictedWaitMinutes} min
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            Avg consult {analytics.avgConsultationMinutes} min
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">Active Physicians</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {analytics.activeDoctorsCount} / {analytics.totalDoctorsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across {data.departments.length} hospital departments
          </div>
        </div>
      </div>

      {/* Charts Row: Hourly Flow + Department Wait */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hourly Patient Flow & Wait Trend */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Hourly Patient Arrivals & Wait Time Profile
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hover bars to inspect arrival rate vs. average waiting time
              </p>
            </div>
            {activeHoverPoint && (
              <div className="text-right text-xs tabular-nums">
                <div className="font-semibold text-slate-900">
                  {activeHoverPoint.label} {activeHoverPoint.isPeak ? '· Peak Hour' : ''}
                </div>
                <div className="text-slate-600 font-mono">
                  {activeHoverPoint.arrivals} pts/hr · {activeHoverPoint.avgWaitMinutes} min wait
                </div>
              </div>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartW} ${chartH + 24}`}
              className="w-full h-56 select-none"
              role="img"
              aria-label="Hourly patient arrivals and waiting time chart"
            >
              {/* Grid lines */}
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = padY + innerH - frac * innerH;
                return (
                  <line
                    key={frac}
                    x1={padX}
                    x2={chartW - padX}
                    y1={y}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Arrival bars */}
              {analytics.hourlyFlow.map((pt, idx) => {
                const slotW = innerW / analytics.hourlyFlow.length;
                const barW = Math.min(26, slotW * 0.52);
                const x =
                  padX +
                  (idx / Math.max(1, analytics.hourlyFlow.length - 1)) * innerW -
                  barW / 2;
                const barH = (pt.arrivals / (maxArrivals * 1.15)) * innerH;
                const y = padY + innerH - barH;
                const isHovered = hoveredHour === pt.hour;

                return (
                  <g
                    key={pt.hour}
                    onMouseEnter={() => setHoveredHour(pt.hour)}
                    onMouseLeave={() => setHoveredHour(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={4}
                      fill={
                        isHovered
                          ? '#0f766e'
                          : pt.isPeak
                          ? '#99f6e4'
                          : '#e2e8f0'
                      }
                    />
                    <text
                      x={x + barW / 2}
                      y={chartH + 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#64748b"
                    >
                      {pt.label.replace(' ', '')}
                    </text>
                  </g>
                );
              })}

              {/* Wait time trend polyline */}
              <polyline
                fill="none"
                stroke="#0f766e"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={waitPoints}
              />

              {analytics.hourlyFlow.map((pt, idx) => {
                const x = padX + (idx / Math.max(1, analytics.hourlyFlow.length - 1)) * innerW;
                const y = padY + innerH - (pt.avgWaitMinutes / (maxWait * 1.15)) * innerH;
                return (
                  <circle
                    key={`dot-${pt.hour}`}
                    cx={x}
                    cy={y}
                    r={hoveredHour === pt.hour ? 5 : 3}
                    fill="#ffffff"
                    stroke="#0f766e"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
          </div>
          <div className="flex items-center gap-6 text-[11px] text-slate-500 mt-2">
            <span>Bars: Hourly patient arrivals (highlighted = peak hours)</span>
            <span>Line: Average wait duration (minutes)</span>
          </div>
        </div>

        {/* Department Breakdown */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900">Department Queue & Wait Load</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time queue depth vs. historical average wait
          </p>

          <div className="mt-5 space-y-4">
            {analytics.departmentBreakdown.map((dept) => {
              const barPct = Math.min(100, Math.round((dept.avgActualWaitMinutes / 35) * 100));
              return (
                <div key={dept.departmentId}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-900">{dept.departmentName}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {dept.waitingCount} waiting ·{' '}
                      <span className="text-slate-900 font-semibold">
                        {dept.avgPredictedWaitMinutes || dept.avgActualWaitMinutes} min
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Doctor Schedule & Workload Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Physician Workload & Schedule Control
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Changing physician availability dynamically updates wait predictions across all waiting patients
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                <th className="py-2.5 px-6">Physician</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Shift</th>
                <th className="py-2.5 px-4 text-right">Consults Today</th>
                <th className="py-2.5 px-4 text-right">Avg Consult</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-6 text-right">Set Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {data.doctors.map((doc) => {
                const dept = data.departments.find((d) => d.id === doc.departmentId);
                return (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <DoctorAvatar name={doc.name} avatarUrl={doc.avatarUrl} size="sm" />
                        <div>
                          <div className="font-medium text-slate-900">{doc.name}</div>
                          <div className="text-[11px] text-slate-500">{doc.room}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{dept?.name}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {doc.shiftStart}–{doc.shiftEnd}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {doc.consultationsToday}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {doc.avgConsultationMinutes} min
                    </td>
                    <td className="py-3 px-4">
                      <DoctorAvailabilityLabel availability={doc.availability} />
                    </td>
                    <td className="py-3 px-6 text-right">
                      <select
                        aria-label={`Set availability for ${doc.name}`}
                        value={doc.availability}
                        onChange={(e) =>
                          onUpdateAvailability(doc.id, e.target.value as DoctorAvailability)
                        }
                        className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white"
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                        <option value="unavailable">Unavailable</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
