import type {
  FeatureContribution,
  FeatureImportanceItem,
  HistoricalRecord,
  MLStateSummary,
  ModelEvaluation,
  ModelType,
  WaitPrediction,
  WhatIfInput,
} from '../src/shared/types.ts';

interface FeatureVector {
  queueLength: number;
  avgConsultationMinutes: number;
  availableDoctors: number;
  arrivalRatePerHour: number;
  hourOfDay: number;
  dayOfWeek: number;
  emergencyCases: number;
  inConsultationElapsedRatio: number;
}

const FEATURE_KEYS: (keyof FeatureVector)[] = [
  'queueLength',
  'avgConsultationMinutes',
  'availableDoctors',
  'arrivalRatePerHour',
  'hourOfDay',
  'dayOfWeek',
  'emergencyCases',
  'inConsultationElapsedRatio',
];

const FEATURE_LABELS: Record<keyof FeatureVector, string> = {
  queueLength: 'Queue Length (Patients Ahead)',
  avgConsultationMinutes: 'Avg Consultation Duration',
  availableDoctors: 'Active Doctors Available',
  arrivalRatePerHour: 'Hourly Arrival Rate',
  hourOfDay: 'Time of Day (Peak Factor)',
  dayOfWeek: 'Day of Week',
  emergencyCases: 'Emergency Triage Cases',
  inConsultationElapsedRatio: 'Active Consult Progress',
};

// Deterministic PRNG so initial model training is reproducible
function createRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function toArray(f: FeatureVector): number[] {
  return [
    f.queueLength,
    f.avgConsultationMinutes,
    f.availableDoctors,
    f.arrivalRatePerHour,
    f.hourOfDay,
    f.dayOfWeek,
    f.emergencyCases,
    f.inConsultationElapsedRatio,
  ];
}

// Generate 220 realistic historical hospital consultation waiting records
export function generateSeedHistoricalRecords(): HistoricalRecord[] {
  const rng = createRng(20261117);
  const deptConfigs = [
    { id: 'dept-gen', baseConsult: 11 },
    { id: 'dept-cardio', baseConsult: 16 },
    { id: 'dept-ortho', baseConsult: 14 },
    { id: 'dept-peds', baseConsult: 12 },
    { id: 'dept-neuro', baseConsult: 18 },
  ];

  const records: HistoricalRecord[] = [];
  for (let i = 0; i < 220; i++) {
    const dept = deptConfigs[i % deptConfigs.length];
    const hourOfDay = 8 + Math.floor(rng() * 12); // 8 AM to 7 PM
    const dayOfWeek = Math.floor(rng() * 7); // 0 Sun .. 6 Sat
    const isPeak = (hourOfDay >= 9 && hourOfDay <= 12) || (hourOfDay >= 16 && hourOfDay <= 18);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const availableDoctors = Math.max(1, Math.min(4, (isWeekend ? 1 : 2) + Math.floor(rng() * 2.3)));
    const arrivalRatePerHour = Math.round(
      (isPeak ? 11 : 6) + (isWeekend ? -1.5 : 1) + rng() * 6
    );
    const queueLength = Math.max(
      0,
      Math.round((arrivalRatePerHour * 0.65) / Math.sqrt(availableDoctors) + rng() * 6 - 1.5)
    );
    const avgConsultationMinutes = Number(
      Math.max(7, dept.baseConsult + (rng() - 0.5) * 4).toFixed(1)
    );
    const emergencyCases = rng() < 0.18 ? 1 : rng() < 0.05 ? 2 : 0;
    const inConsultationElapsedRatio = Number((0.15 + rng() * 0.75).toFixed(2));

    // Ground-truth queueing physics + realistic clinical variance
    const effectiveServiceRate = Math.max(0.8, availableDoctors);
    const remainingActiveConsult = (1 - inConsultationElapsedRatio) * avgConsultationMinutes;
    const queueWork = (queueLength * avgConsultationMinutes) / effectiveServiceRate;
    const emergencyPenalty = emergencyCases * (avgConsultationMinutes * 1.15);
    const congestionInteraction =
      queueLength > 5 && availableDoctors === 1 ? (queueLength - 5) * 2.1 : 0;
    const peakMultiplier = isPeak ? 1.09 : 0.96;
    const noise = (rng() - 0.5) * 5.2;

    const actualWaitMinutes = Math.max(
      2,
      Math.round(
        (queueWork + remainingActiveConsult * 0.45 + emergencyPenalty + congestionInteraction) *
          peakMultiplier +
          noise
      )
    );

    records.push({
      id: `hist-${i + 1}`,
      departmentId: dept.id,
      queueLength,
      avgConsultationMinutes,
      availableDoctors,
      arrivalRatePerHour,
      hourOfDay,
      dayOfWeek,
      emergencyCases,
      inConsultationElapsedRatio,
      actualWaitMinutes,
    });
  }
  return records;
}

// ============================================================
// 1. Multiple Linear Regression (Ridge-regularized OLS)
// ============================================================
class LinearRegressionModel {
  private weights: number[] = [];
  private means: number[] = [];
  private stds: number[] = [];
  private bias = 0;

  fit(X: number[][], y: number[]) {
    const n = X.length;
    const d = X[0].length;
    this.means = Array(d).fill(0);
    this.stds = Array(d).fill(1);

    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += X[i][j];
      this.means[j] = sum / n;
      let varSum = 0;
      for (let i = 0; i < n; i++) varSum += (X[i][j] - this.means[j]) ** 2;
      this.stds[j] = Math.sqrt(varSum / n) || 1;
    }

    const Xs = X.map((row) => row.map((v, j) => (v - this.means[j]) / this.stds[j]));
    this.bias = y.reduce((a, b) => a + b, 0) / n;
    const yc = y.map((v) => v - this.bias);

    // Normal equations: (X^T X + lambda * I) w = X^T y
    const lambda = 1.5;
    const A: number[][] = Array.from({ length: d }, () => Array(d).fill(0));
    const b: number[] = Array(d).fill(0);

    for (let j = 0; j < d; j++) {
      A[j][j] = lambda;
      for (let i = 0; i < n; i++) {
        b[j] += Xs[i][j] * yc[i];
        for (let k = 0; k < d; k++) {
          A[j][k] += Xs[i][j] * Xs[i][k];
        }
      }
    }

    this.weights = solveLinearSystem(A, b);
  }

  predictOne(x: number[]): number {
    let pred = this.bias;
    for (let j = 0; j < x.length; j++) {
      const z = (x[j] - this.means[j]) / (this.stds[j] || 1);
      pred += this.weights[j] * z;
    }
    return Math.max(1, pred);
  }

  getCoefficients(): number[] {
    return this.weights;
  }
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];

    const pivot = M[i][i] || 1e-8;
    for (let j = i; j <= n; j++) M[i][j] /= pivot;

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }
  return M.map((row) => row[n]);
}

// ============================================================
// 2. Decision Tree Regressor (CART with variance reduction)
// ============================================================
interface TreeNode {
  leafValue?: number;
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

class DecisionTreeRegressor {
  private root: TreeNode = { leafValue: 0 };

  constructor(
    private maxDepth = 5,
    private minSamplesSplit = 5,
    private maxFeatures?: number,
    private rng: () => number = Math.random
  ) {}

  fit(X: number[][], y: number[]) {
    const indices = X.map((_, i) => i);
    this.root = this.buildTree(X, y, indices, 0);
  }

  private buildTree(X: number[][], y: number[], indices: number[], depth: number): TreeNode {
    const mean = indices.reduce((acc, idx) => acc + y[idx], 0) / indices.length;
    if (depth >= this.maxDepth || indices.length < this.minSamplesSplit) {
      return { leafValue: mean };
    }

    const totalFeatures = X[0].length;
    let candidateFeatures = Array.from({ length: totalFeatures }, (_, i) => i);
    if (this.maxFeatures && this.maxFeatures < totalFeatures) {
      for (let i = candidateFeatures.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [candidateFeatures[i], candidateFeatures[j]] = [candidateFeatures[j], candidateFeatures[i]];
      }
      candidateFeatures = candidateFeatures.slice(0, this.maxFeatures);
    }

    let bestScore = Infinity;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestLeft: number[] = [];
    let bestRight: number[] = [];

    for (const fIdx of candidateFeatures) {
      const vals = Array.from(new Set(indices.map((idx) => X[idx][fIdx]))).sort((a, b) => a - b);
      if (vals.length <= 1) continue;

      // Sample up to 16 candidate thresholds for fast, accurate splits
      const step = Math.max(1, Math.floor(vals.length / 16));
      for (let v = 0; v < vals.length - 1; v += step) {
        const threshold = (vals[v] + vals[v + 1]) / 2;
        const left: number[] = [];
        const right: number[] = [];
        let sumL = 0;
        let sumR = 0;

        for (const idx of indices) {
          if (X[idx][fIdx] <= threshold) {
            left.push(idx);
            sumL += y[idx];
          } else {
            right.push(idx);
            sumR += y[idx];
          }
        }
        if (left.length < 2 || right.length < 2) continue;

        const meanL = sumL / left.length;
        const meanR = sumR / right.length;
        let sse = 0;
        for (const idx of left) sse += (y[idx] - meanL) ** 2;
        for (const idx of right) sse += (y[idx] - meanR) ** 2;

        if (sse < bestScore) {
          bestScore = sse;
          bestFeature = fIdx;
          bestThreshold = threshold;
          bestLeft = left;
          bestRight = right;
        }
      }
    }

    if (bestFeature === -1) {
      return { leafValue: mean };
    }

    return {
      featureIdx: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(X, y, bestLeft, depth + 1),
      right: this.buildTree(X, y, bestRight, depth + 1),
    };
  }

  predictOne(x: number[]): number {
    let node = this.root;
    while (node.leafValue === undefined) {
      if (x[node.featureIdx!] <= node.threshold!) {
        node = node.left!;
      } else {
        node = node.right!;
      }
    }
    return node.leafValue;
  }
}

// ============================================================
// 3. Random Forest Regressor (Bootstrap Ensemble of CART Trees)
// ============================================================
class RandomForestRegressor {
  private trees: DecisionTreeRegressor[] = [];

  constructor(private nEstimators = 18, private maxDepth = 6) {}

  fit(X: number[][], y: number[]) {
    const rng = createRng(4242);
    this.trees = [];
    const n = X.length;
    const maxFeatures = Math.max(3, Math.floor(Math.sqrt(X[0].length)) + 2);

    for (let t = 0; t < this.nEstimators; t++) {
      const sampleX: number[][] = [];
      const sampleY: number[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * n);
        sampleX.push(X[idx]);
        sampleY.push(y[idx]);
      }
      const tree = new DecisionTreeRegressor(this.maxDepth, 4, maxFeatures, rng);
      tree.fit(sampleX, sampleY);
      this.trees.push(tree);
    }
  }

  predictWithSpread(x: number[]): { mean: number; std: number } {
    const preds = this.trees.map((t) => t.predictOne(x));
    const mean = preds.reduce((a, b) => a + b, 0) / preds.length;
    const variance = preds.reduce((a, b) => a + (b - mean) ** 2, 0) / preds.length;
    return { mean: Math.max(1, mean), std: Math.sqrt(variance) };
  }

  predictOne(x: number[]): number {
    return this.predictWithSpread(x).mean;
  }
}

// ============================================================
// 4. Gradient Boosted Regressor (XGBoost-style Additive Trees)
// ============================================================
class GradientBoostedRegressor {
  private baseValue = 0;
  private trees: DecisionTreeRegressor[] = [];
  private learningRate = 0.16;

  constructor(private nStages = 24, private maxDepth = 3) {}

  fit(X: number[][], y: number[]) {
    const rng = createRng(9001);
    this.trees = [];
    this.baseValue = y.reduce((a, b) => a + b, 0) / y.length;
    const currentPreds = Array(y.length).fill(this.baseValue);

    for (let m = 0; m < this.nStages; m++) {
      const residuals = y.map((target, i) => target - currentPreds[i]);
      const tree = new DecisionTreeRegressor(this.maxDepth, 4, undefined, rng);
      tree.fit(X, residuals);
      this.trees.push(tree);

      for (let i = 0; i < X.length; i++) {
        currentPreds[i] += this.learningRate * tree.predictOne(X[i]);
      }
    }
  }

  predictOne(x: number[]): number {
    let pred = this.baseValue;
    for (const tree of this.trees) {
      pred += this.learningRate * tree.predictOne(x);
    }
    return Math.max(1, pred);
  }

  predictStageStd(x: number[]): number {
    // Stage progression dispersion gives realistic model uncertainty signal
    const partial = this.trees.slice(-6).map((t) => Math.abs(this.learningRate * t.predictOne(x)));
    const avg = partial.reduce((a, b) => a + b, 0) / Math.max(1, partial.length);
    return Math.max(1.5, avg * 2.4);
  }
}

function computeMetrics(yTrue: number[], yPred: number[]) {
  const n = yTrue.length;
  let absSum = 0;
  let sqSum = 0;
  const meanTrue = yTrue.reduce((a, b) => a + b, 0) / n;
  let totSum = 0;

  for (let i = 0; i < n; i++) {
    const err = yTrue[i] - yPred[i];
    absSum += Math.abs(err);
    sqSum += err * err;
    totSum += (yTrue[i] - meanTrue) ** 2;
  }

  const mae = Number((absSum / n).toFixed(2));
  const rmse = Number(Math.sqrt(sqSum / n).toFixed(2));
  const r2 = Number(Math.max(0, 1 - sqSum / (totSum || 1)).toFixed(3));
  return { mae, rmse, r2 };
}

export class HospitalMLEngine {
  private lrModel = new LinearRegressionModel();
  private rfModel = new RandomForestRegressor(18, 6);
  private gbmModel = new GradientBoostedRegressor(24, 3);
  private activeModel: ModelType = 'gradient_boosted';
  private evaluations: ModelEvaluation[] = [];
  private featureImportance: FeatureImportanceItem[] = [];
  private totalRecords = 0;
  private residualStdByModel: Record<ModelType, number> = {
    linear_regression: 6,
    random_forest: 4.5,
    gradient_boosted: 3.8,
  };

  constructor(records: HistoricalRecord[]) {
    this.trainAndEvaluate(records);
  }

  public setActiveModel(model: ModelType) {
    this.activeModel = model;
  }

  public getActiveModel(): ModelType {
    return this.activeModel;
  }

  public trainAndEvaluate(records: HistoricalRecord[]): MLStateSummary {
    this.totalRecords = records.length;
    const rng = createRng(777 + records.length);

    // Shuffle deterministically for 80/20 train/validation split
    const shuffled = [...records];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const splitIdx = Math.max(10, Math.floor(shuffled.length * 0.8));
    const trainSet = shuffled.slice(0, splitIdx);
    const valSet = shuffled.slice(splitIdx);

    const XTrain = trainSet.map((r) =>
      toArray({
        queueLength: r.queueLength,
        avgConsultationMinutes: r.avgConsultationMinutes,
        availableDoctors: r.availableDoctors,
        arrivalRatePerHour: r.arrivalRatePerHour,
        hourOfDay: r.hourOfDay,
        dayOfWeek: r.dayOfWeek,
        emergencyCases: r.emergencyCases,
        inConsultationElapsedRatio: r.inConsultationElapsedRatio,
      })
    );
    const yTrain = trainSet.map((r) => r.actualWaitMinutes);

    const XVal = valSet.map((r) =>
      toArray({
        queueLength: r.queueLength,
        avgConsultationMinutes: r.avgConsultationMinutes,
        availableDoctors: r.availableDoctors,
        arrivalRatePerHour: r.arrivalRatePerHour,
        hourOfDay: r.hourOfDay,
        dayOfWeek: r.dayOfWeek,
        emergencyCases: r.emergencyCases,
        inConsultationElapsedRatio: r.inConsultationElapsedRatio,
      })
    );
    const yVal = valSet.map((r) => r.actualWaitMinutes);

    this.lrModel.fit(XTrain, yTrain);
    this.rfModel.fit(XTrain, yTrain);
    this.gbmModel.fit(XTrain, yTrain);

    const lrPreds = XVal.map((x) => this.lrModel.predictOne(x));
    const rfPreds = XVal.map((x) => this.rfModel.predictOne(x));
    const gbmPreds = XVal.map((x) => this.gbmModel.predictOne(x));

    const lrMetrics = computeMetrics(yVal, lrPreds);
    const rfMetrics = computeMetrics(yVal, rfPreds);
    const gbmMetrics = computeMetrics(yVal, gbmPreds);

    this.residualStdByModel = {
      linear_regression: lrMetrics.rmse,
      random_forest: rfMetrics.rmse,
      gradient_boosted: gbmMetrics.rmse,
    };

    const now = new Date().toISOString();
    this.evaluations = [
      {
        modelType: 'linear_regression',
        label: 'Linear Regression (Ridge OLS)',
        description: 'Interpretable baseline linear model across 8 operational features',
        ...lrMetrics,
        trainingSamples: trainSet.length,
        validationSamples: valSet.length,
        lastTrainedAt: now,
      },
      {
        modelType: 'random_forest',
        label: 'Random Forest Regressor',
        description: '18 bootstrap-aggregated CART trees capturing non-linear congestion',
        ...rfMetrics,
        trainingSamples: trainSet.length,
        validationSamples: valSet.length,
        lastTrainedAt: now,
      },
      {
        modelType: 'gradient_boosted',
        label: 'Gradient Boosted Regressor (XGBoost-style)',
        description: '24 sequential residual-correcting regression trees',
        ...gbmMetrics,
        trainingSamples: trainSet.length,
        validationSamples: valSet.length,
        lastTrainedAt: now,
      },
    ];

    // Refit all 3 models on 100% of records for production inference
    const XAll = records.map((r) =>
      toArray({
        queueLength: r.queueLength,
        avgConsultationMinutes: r.avgConsultationMinutes,
        availableDoctors: r.availableDoctors,
        arrivalRatePerHour: r.arrivalRatePerHour,
        hourOfDay: r.hourOfDay,
        dayOfWeek: r.dayOfWeek,
        emergencyCases: r.emergencyCases,
        inConsultationElapsedRatio: r.inConsultationElapsedRatio,
      })
    );
    const yAll = records.map((r) => r.actualWaitMinutes);
    this.lrModel.fit(XAll, yAll);
    this.rfModel.fit(XAll, yAll);
    this.gbmModel.fit(XAll, yAll);

    // Compute permutation importance on validation set for champion model
    this.featureImportance = this.computePermutationImportance(XVal, yVal, gbmMetrics.rmse);

    return this.getSummary();
  }

  private computePermutationImportance(
    XVal: number[][],
    yVal: number[],
    baseRmse: number
  ): FeatureImportanceItem[] {
    const rawDrops: number[] = [];
    for (let f = 0; f < FEATURE_KEYS.length; f++) {
      const XPerm = XVal.map((row) => [...row]);
      for (let i = 0; i < XPerm.length; i++) {
        const swapIdx = (i * 7 + 3) % XPerm.length;
        const temp = XPerm[i][f];
        XPerm[i][f] = XPerm[swapIdx][f];
        XPerm[swapIdx][f] = temp;
      }
      const permPreds = XPerm.map((x) => this.gbmModel.predictOne(x));
      const { rmse } = computeMetrics(yVal, permPreds);
      rawDrops.push(Math.max(0.05, rmse - baseRmse));
    }

    const total = rawDrops.reduce((a, b) => a + b, 0) || 1;
    return FEATURE_KEYS.map((key, idx) => ({
      feature: key,
      label: FEATURE_LABELS[key],
      importancePercent: Number(((rawDrops[idx] / total) * 100).toFixed(1)),
    })).sort((a, b) => b.importancePercent - a.importancePercent);
  }

  public getSummary(): MLStateSummary {
    return {
      activeModel: this.activeModel,
      evaluations: this.evaluations,
      featureImportance: this.featureImportance,
      totalHistoricalRecords: this.totalRecords,
    };
  }

  public predictSingleModel(
    input: FeatureVector,
    modelType: ModelType
  ): {
    predictedWaitMinutes: number;
    lowMinutes: number;
    highMinutes: number;
    confidencePercent: number;
  } {
    const x = toArray(input);
    let raw = 0;
    let uncertainty = this.residualStdByModel[modelType] || 4;

    if (modelType === 'linear_regression') {
      raw = this.lrModel.predictOne(x);
    } else if (modelType === 'random_forest') {
      const rf = this.rfModel.predictWithSpread(x);
      raw = rf.mean;
      uncertainty = Math.max(2.5, (rf.std + this.residualStdByModel.random_forest) * 0.65);
    } else {
      raw = this.gbmModel.predictOne(x);
      const rfSpread = this.rfModel.predictWithSpread(x).std;
      const stageSpread = this.gbmModel.predictStageStd(x);
      uncertainty = Math.max(2, (rfSpread * 0.45 + stageSpread * 0.55 + this.residualStdByModel.gradient_boosted * 0.5));
    }

    // Queue sanity bounds: if 0 patients ahead & doctor available, wait is near 0-5 min
    if (input.queueLength === 0 && input.emergencyCases === 0 && input.availableDoctors > 0) {
      raw = Math.min(raw, 6);
      uncertainty = Math.min(uncertainty, 2);
    }
    // If zero doctors available in dept, add shift delay
    if (input.availableDoctors === 0) {
      raw = Math.max(raw, 25) + 20;
      uncertainty += 5;
    }

    const predictedWaitMinutes = Math.max(1, Math.round(raw));
    const margin = Math.max(2, Math.round(uncertainty));
    const lowMinutes = Math.max(1, predictedWaitMinutes - margin);
    const highMinutes = predictedWaitMinutes + margin;
    const confidencePercent = Math.max(
      72,
      Math.min(97, Math.round(96 - (margin / Math.max(10, predictedWaitMinutes + 12)) * 28))
    );

    return {
      predictedWaitMinutes,
      lowMinutes,
      highMinutes,
      confidencePercent,
    };
  }

  public predictWaitTime(
    input: FeatureVector,
    now: Date = new Date(),
    overrideModel?: ModelType
  ): WaitPrediction {
    const modelUsed = overrideModel || this.activeModel;
    const res = this.predictSingleModel(input, modelUsed);

    const consultDate = new Date(now.getTime() + res.predictedWaitMinutes * 60_000);
    const expectedConsultationTime = consultDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    // Explainable factor contributions via counterfactual delta
    const baselineZeroQueue: FeatureVector = {
      ...input,
      queueLength: 0,
      emergencyCases: 0,
    };
    const baseZeroPred = this.predictSingleModel(baselineZeroQueue, modelUsed).predictedWaitMinutes;

    const queueDelta =
      this.predictSingleModel({ ...input, emergencyCases: 0 }, modelUsed).predictedWaitMinutes -
      baseZeroPred;
    const emergencyDelta =
      input.emergencyCases > 0
        ? res.predictedWaitMinutes -
          this.predictSingleModel({ ...input, emergencyCases: 0 }, modelUsed).predictedWaitMinutes
        : 0;
    const doctorDelta =
      input.availableDoctors > 1
        ? res.predictedWaitMinutes -
          this.predictSingleModel({ ...input, availableDoctors: 1 }, modelUsed).predictedWaitMinutes
        : input.availableDoctors === 0
        ? 25
        : 0;

    const factors: FeatureContribution[] = [
      {
        label: `${input.queueLength} patients ahead`,
        impactMinutes: Math.max(0, queueDelta),
        detail: `${input.avgConsultationMinutes} min rolling avg per consultation`,
      },
    ];

    if (input.emergencyCases > 0) {
      factors.push({
        label: `${input.emergencyCases} active emergency triage`,
        impactMinutes: Math.max(8, emergencyDelta),
        detail: 'Priority cases preempt standard queue order',
      });
    }

    if (input.availableDoctors === 0) {
      factors.push({
        label: 'No doctors currently available',
        impactMinutes: 25,
        detail: 'Waiting for physician shift or consultation wrap-up',
      });
    } else if (input.availableDoctors > 1) {
      factors.push({
        label: `${input.availableDoctors} active doctors in parallel`,
        impactMinutes: Math.min(-2, doctorDelta),
        detail: 'Multi-physician throughput reduces wait time',
      });
    }

    const isPeak = (input.hourOfDay >= 9 && input.hourOfDay <= 12) || (input.hourOfDay >= 16 && input.hourOfDay <= 18);
    if (isPeak) {
      factors.push({
        label: 'Peak arrival window',
        impactMinutes: Math.max(2, Math.round(res.predictedWaitMinutes * 0.09)),
        detail: `${input.arrivalRatePerHour} patients/hr current inflow`,
      });
    }

    return {
      ...res,
      expectedConsultationTime,
      patientsAhead: input.queueLength,
      modelUsed,
      factors,
    };
  }

  public compareAllModels(input: WhatIfInput, now: Date = new Date()) {
    return {
      predictions: {
        linear_regression: this.predictSingleModel(input, 'linear_regression'),
        random_forest: this.predictSingleModel(input, 'random_forest'),
        gradient_boosted: this.predictSingleModel(input, 'gradient_boosted'),
      },
      activePrediction: this.predictWaitTime(input, now),
    };
  }
}
