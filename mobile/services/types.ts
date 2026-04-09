export type WarningCapability = {
  mode: string;
  official_sensor_early_warning: boolean;
  seconds_before_alarm_supported: boolean;
  siren_alarm_supported: boolean;
  special_notifications_ready?: boolean;
  summary?: string;
};

export type ForecastAdvisory = {
  level: string;
  label: string;
  summary: string;
  notify_recommended: boolean;
  critical_notification_recommended: boolean;
  notification_tier: string;
  official_sensor_early_warning: boolean;
  seconds_before_alarm_supported: boolean;
  reason_codes?: string[];
  reasons?: string[];
  actions?: string[];
  limitations?: string[];
  quality_level?: string;
  quality_score?: number;
  next_event_time_window?: string | null;
};

export type ModelHealth = {
  available: boolean;
  quality_level: string;
  quality_label: string;
  quality_score: number;
  trained_at?: string | null;
  model_type?: string;
  summary?: string;
  signal_event_count?: number;
  metrics?: {
    roc_auc_mean?: number | null;
    pr_auc_mean?: number | null;
    brier_mean?: number | null;
    samples?: number;
    positive_rate?: number | null;
    folds?: number;
  };
  backtest?: {
    hit_rate?: number | null;
    accuracy?: number | null;
    precision?: number | null;
    recall?: number | null;
    f1?: number | null;
    balanced_accuracy?: number | null;
    positive_rate?: number | null;
    alarm_rate?: number | null;
    top_decile_precision?: number | null;
    top_decile_recall?: number | null;
    samples?: number;
    threshold?: number | null;
    mean_prob?: number | null;
    hit_rate_definition?: string;
    legacy?: boolean;
  };
};

export type ForecastPoint = {
  city: string;
  lat: number;
  lon: number;
  region?: string;
  risk_score: number;
  confidence?: number;
  probability: number;
  risk_level: string;
  m5_72h_probability?: number;
  max_mag_7d_prediction?: number;
  signal_event_count?: number;
  fault_distance?: number;
  model_health?: ModelHealth;
  warning_capability?: WarningCapability;
  alert_advisory?: ForecastAdvisory;
  next_event_time_window?: string | null;
  time_windows?: Record<string, number>;
  explanation_summary?: string;
};

export type ForecastGridPoint = {
  id: string;
  lat: number;
  lon: number;
  region?: string;
  risk_score: number;
  probability: number;
  confidence?: number;
  confidence_opacity?: number;
  ml_probability?: number;
  locality_score?: number;
  signal_event_count?: number;
  time_windows?: Record<string, number>;
};

export type QuakeEvent = {
  lat: number;
  lon: number;
  mag: number;
  depth: number;
  timestamp: number;
  event_key: string;
};

export type ChatMessage = {
  id: number;
  from_user: string;
  to_user: string;
  body: string;
  kind: string;
  created_at: number;
  delivered_at?: number | null;
  read_at?: number | null;
};

export type MobileUser = {
  username: string;
  emergency_contact: string | null;
  phone?: string | null;
  email?: string | null;
  auth_channel?: string | null;
  settings?: Record<string, unknown> | null;
};

export type OtpStartResult = {
  ok: boolean;
  message?: string;
  channel?: string;
  target?: string;
  expiresInSec?: number;
  debugCode?: string;
};

export type ChatbotReply = {
  response: string;
  session_id?: string;
};

export type SupabaseExchangeResult = {
  ok: boolean;
  token?: string;
  username?: string;
  message?: string;
};
