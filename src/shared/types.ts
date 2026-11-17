export type UserRole = 'patient' | 'doctor' | 'receptionist' | 'admin';

export type DoctorAvailability = 'available' | 'occupied' | 'unavailable';

export type TokenStatus =
  | 'waiting'
  | 'approaching'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type PriorityLevel = 'normal' | 'urgent' | 'critical';

export type ModelType = 'linear_regression' | 'random_forest' | 'gradient_boosted';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  medicalNotes?: string;
  doctorId?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  floor: string;
  avgConsultationMinutes: number;
  description: string;
}

export interface Doctor {
  id: string;
  name: string;
  departmentId: string;
  specialty: string;
  room: string;
  avatarUrl?: string;
  availability: DoctorAvailability;
  avgConsultationMinutes: number;
  consultationsToday: number;
  shiftStart: string;
  shiftEnd: string;
}

export interface FeatureContribution {
  label: string;
  impactMinutes: number;
  detail: string;
}

export interface WaitPrediction {
  predictedWaitMinutes: number;
  lowMinutes: number;
  highMinutes: number;
  confidencePercent: number;
  expectedConsultationTime: string;
  patientsAhead: number;
  modelUsed: ModelType;
  factors: FeatureContribution[];
}

export interface QueueToken {
  id: string;
  tokenNumber: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  departmentId: string;
  doctorId: string;
  priority: PriorityLevel;
  triageNote?: string;
  status: TokenStatus;
  visitType: 'appointment' | 'walk_in' | 'emergency';
  scheduledSlot: string;
  createdAt: string;
  consultationStartedAt?: string;
  completedAt?: string;
  actualWaitMinutes?: number;
  actualConsultationMinutes?: number;
  clinicalNotes?: string;
  prediction: WaitPrediction;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  departmentId: string;
  doctorId: string;
  slotTime: string;
  reason: string;
  status: 'scheduled' | 'checked_in' | 'completed' | 'cancelled';
  tokenId?: string;
  tokenNumber?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId?: string;
  roleTarget?: UserRole | 'all';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  channel: 'in_app' | 'sms_alert' | 'email_alert';
  read: boolean;
  createdAt: string;
}

export interface HistoricalRecord {
  id: string;
  departmentId: string;
  queueLength: number;
  avgConsultationMinutes: number;
  availableDoctors: number;
  arrivalRatePerHour: number;
  hourOfDay: number;
  dayOfWeek: number;
  emergencyCases: number;
  inConsultationElapsedRatio: number;
  actualWaitMinutes: number;
}

export interface ModelEvaluation {
  modelType: ModelType;
  label: string;
  description: string;
  mae: number;
  rmse: number;
  r2: number;
  trainingSamples: number;
  validationSamples: number;
  lastTrainedAt: string;
}

export interface FeatureImportanceItem {
  feature: string;
  label: string;
  importancePercent: number;
}

export interface DepartmentAnalytics {
  departmentId: string;
  departmentName: string;
  code: string;
  waitingCount: number;
  inConsultationCount: number;
  completedCount: number;
  activeDoctors: number;
  totalDoctors: number;
  avgPredictedWaitMinutes: number;
  avgActualWaitMinutes: number;
}

export interface HourlyFlowPoint {
  hour: number;
  label: string;
  arrivals: number;
  avgWaitMinutes: number;
  isPeak: boolean;
}

export interface AnalyticsSnapshot {
  totalRegisteredPatients: number;
  currentlyWaiting: number;
  inConsultationNow: number;
  completedToday: number;
  avgPredictedWaitMinutes: number;
  avgConsultationMinutes: number;
  activeDoctorsCount: number;
  totalDoctorsCount: number;
  peakHourLabel: string;
  appointmentCompletionRate: number;
  departmentBreakdown: DepartmentAnalytics[];
  hourlyFlow: HourlyFlowPoint[];
}

export interface MLStateSummary {
  activeModel: ModelType;
  evaluations: ModelEvaluation[];
  featureImportance: FeatureImportanceItem[];
  totalHistoricalRecords: number;
}

export interface HospitalBootstrapPayload {
  departments: Department[];
  doctors: Doctor[];
  tokens: QueueToken[];
  appointments: Appointment[];
  notifications: NotificationItem[];
  analytics: AnalyticsSnapshot;
  ml: MLStateSummary;
  serverTime: string;
}

export interface WhatIfInput {
  queueLength: number;
  avgConsultationMinutes: number;
  availableDoctors: number;
  arrivalRatePerHour: number;
  hourOfDay: number;
  dayOfWeek: number;
  emergencyCases: number;
  inConsultationElapsedRatio: number;
}

export interface WhatIfResponse {
  predictions: Record<ModelType, {
    predictedWaitMinutes: number;
    lowMinutes: number;
    highMinutes: number;
    confidencePercent: number;
  }>;
  activePrediction: WaitPrediction;
}

export type WSEvent =
  | { type: 'state:sync'; payload: HospitalBootstrapPayload }
  | { type: 'notification:new'; payload: NotificationItem };
