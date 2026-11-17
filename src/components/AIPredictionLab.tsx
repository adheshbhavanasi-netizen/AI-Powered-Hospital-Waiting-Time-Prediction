import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  HospitalBootstrapPayload,
  ModelType,
  WhatIfInput,
  WhatIfResponse,
} from '../shared/types.ts';

interface AIPredictionLabProps {
  data: HospitalBootstrapPayload;
  onSetActiveModel: (model: ModelType) => Promise<void>;
  onRetrain: () => Promise<void>;
  onPredictWhatIf: (input: WhatIfInput) => Promise<WhatIfResponse>;
}

export function AIPredictionLab({
  data,
  onSetActiveModel,
  onRetrain,
  onPredictWhatIf,
}: AIPredictionLabProps) {
  const [retraining, setRetraining] = useState(false);
  const [simInput, setSimInput] = useState<WhatIfInput>({
    queueLength: 8,
    avgConsultationMinutes: 12,
    availableDoctors: 2,
    arrivalRatePerHour: 11,
    hourOfDay: 11,
    dayOfWeek: 2,
    emergencyCases: 1,
    inConsultationElapsedRatio: 0.45,
  });
  const [simResult, setSimResult] = useState<WhatIfResponse | null>(null);

  useEffect(() => {
    let active = true;
    const t = window.setTimeout(async () => {
      try {
        const res = await onPredictWhatIf(simInput);
        if (active) setSimResult(res);
      } catch {
        // ignore transient errors
      }
    }, 80);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [simInput, onPredictWhatIf, data.ml.activeModel]);

  async function handleRetrain() {
    setRetraining(true);
    try {
      await onRetrain();
    } finally {
      setRetraining(false);
    }
  }

  const { ml } = data;
  const maxImp = Math.max(...ml.featureImportance.map((f) => f.importancePercent), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            AI Waiting Time Prediction Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Trained on {ml.totalHistoricalRecords} hospital consultation records · 80/20 validation split
          </p>
        </div>
        <button
          type="button"
          disabled={retraining}
          onClick={handleRetrain}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
          {retraining ? 'Retraining Models...' : 'Retrain on Live Outcomes'}
        </button>
      </div>

      {/* Model Evaluation Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Model Validation Performance (Target: MAE &lt; 10 min)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select the active model powering real-time hospital waiting time estimates
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                <th className="py-2.5 px-6">Algorithm</th>
                <th className="py-2.5 px-4 text-right">MAE (min)</th>
                <th className="py-2.5 px-4 text-right">RMSE (min)</th>
                <th className="py-2.5 px-4 text-right">R² Score</th>
                <th className="py-2.5 px-4 text-right">Split (Train / Val)</th>
                <th className="py-2.5 px-6 text-right">Deployment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {ml.evaluations.map((ev) => {
                const isActive = ml.activeModel === ev.modelType;
                return (
                  <tr
                    key={ev.modelType}
                    className={isActive ? 'bg-teal-50/40' : 'hover:bg-slate-50 transition-colors'}
                  >
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-900">{ev.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{ev.description}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {ev.mae.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                      {ev.rmse.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {ev.r2.toFixed(3)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                      {ev.trainingSamples} / {ev.validationSamples}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {isActive ? (
                        <span className="text-xs font-semibold text-teal-700">Active Model</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetActiveModel(ev.modelType)}
                          className="px-3 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-md transition-colors whitespace-nowrap"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: What-If Simulator + Feature Importance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive What-If Queue Simulator */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Interactive Queue Wait-Time Simulator
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Adjust live operational variables to test all three ML regressors in real time
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Patients Waiting Ahead</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.queueLength}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={simInput.queueLength}
                onChange={(e) => setSimInput({ ...simInput, queueLength: Number(e.target.value) })}
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Available Doctors</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.availableDoctors}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                value={simInput.availableDoctors}
                onChange={(e) =>
                  setSimInput({ ...simInput, availableDoctors: Number(e.target.value) })
                }
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Avg Consultation Duration</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.avgConsultationMinutes} min
                </span>
              </div>
              <input
                type="range"
                min={6}
                max={25}
                value={simInput.avgConsultationMinutes}
                onChange={(e) =>
                  setSimInput({ ...simInput, avgConsultationMinutes: Number(e.target.value) })
                }
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Emergency Interruptions</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.emergencyCases}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                value={simInput.emergencyCases}
                onChange={(e) =>
                  setSimInput({ ...simInput, emergencyCases: Number(e.target.value) })
                }
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Hourly Arrival Rate</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.arrivalRatePerHour} pts/hr
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={22}
                value={simInput.arrivalRatePerHour}
                onChange={(e) =>
                  setSimInput({ ...simInput, arrivalRatePerHour: Number(e.target.value) })
                }
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">Time of Day</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {simInput.hourOfDay === 12
                    ? '12 PM'
                    : simInput.hourOfDay > 12
                    ? `${simInput.hourOfDay - 12} PM`
                    : `${simInput.hourOfDay} AM`}
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={19}
                value={simInput.hourOfDay}
                onChange={(e) => setSimInput({ ...simInput, hourOfDay: Number(e.target.value) })}
                className="w-full accent-teal-700"
              />
            </div>
          </div>

          {simResult && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-4">
                {(
                  [
                    { key: 'linear_regression', label: 'Linear Regression' },
                    { key: 'random_forest', label: 'Random Forest' },
                    { key: 'gradient_boosted', label: 'Gradient Boosted' },
                  ] as const
                ).map((m) => {
                  const p = simResult.predictions[m.key];
                  const isChamp = ml.activeModel === m.key;
                  return (
                    <div
                      key={m.key}
                      className={`p-3.5 rounded-lg border ${
                        isChamp
                          ? 'border-teal-600 bg-teal-50/50'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-600">{m.label}</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                        {p.predictedWaitMinutes} min
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {p.lowMinutes}–{p.highMinutes}m · {p.confidencePercent}% conf.
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Permutation Feature Importance */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900">Feature Importance Weights</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Permutation importance measured on validation RMSE impact
          </p>

          <div className="mt-5 space-y-3.5">
            {ml.featureImportance.map((item) => (
              <div key={item.feature}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-700 font-medium">{item.label}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {item.importancePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-800 rounded-full transition-all"
                    style={{ width: `${Math.round((item.importancePercent / maxImp) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
