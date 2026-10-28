export type UserRole = 'citizen' | 'officer' | 'manager' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department_id?: number;
  department_name?: string;
  department_code?: string;
  badge_number?: string;
  active_cases_count?: number;
}

export type GrievancePriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type GrievanceStatus = 
  | 'Submitted' 
  | 'Acknowledged' 
  | 'In Progress' 
  | 'Awaiting Information' 
  | 'Resolved' 
  | 'Closed' 
  | 'Reopened';

export interface RiskAnalysis {
  risk_level: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'RESOLVED';
  risk_score: number;
  badge_color: 'green' | 'amber' | 'red' | 'blue';
  time_remaining_seconds: number;
  time_remaining_formatted: string;
  needs_manager_intervention: boolean;
  risk_reasons: string[];
  explanation: string;
}

export interface CaseHistoryEntry {
  id: number;
  case_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  old_value?: string;
  new_value?: string;
  notes?: string;
  created_at: string;
}

export interface Attachment {
  id: number;
  case_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_purpose: 'citizen_evidence' | 'resolution_proof';
  uploader_name?: string;
  created_at: string;
}

export interface Grievance {
  id: number;
  case_id: string;
  title: string;
  description: string;
  category: string;
  department_id: number;
  department_name?: string;
  department_code?: string;
  locality: string;
  street_or_landmark?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_source?: 'gps' | 'map_pin' | 'manual';
  location_confirmed?: number; // 0 or 1
  citizen_id: number;
  citizen_name?: string;
  citizen_email?: string;
  assigned_officer_id?: number;
  assigned_officer_name?: string;
  officer_badge?: string;
  priority: GrievancePriority;
  status: GrievanceStatus;
  submission_date: string;
  target_deadline: string;
  resolved_at?: string;
  resolution_note?: string;
  resolution_evidence_url?: string;
  reopen_reason?: string;
  reopen_count: number;
  reassignment_count: number;
  citizen_support_count: number;
  risk_analysis?: RiskAnalysis;
  history?: CaseHistoryEntry[];
  attachments?: Attachment[];
}

export interface DuplicateMatch {
  case_id: string;
  title: string;
  category: string;
  locality: string;
  status: string;
  submission_date: string;
  similarity_score: number;
  is_high_confidence: boolean;
  citizen_support_count: number;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  case_id?: string;
  related_grievance_id?: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  is_read: number;
  created_at: string;
  read_at?: string | null;
}

export interface AnalyticsOverview {
  total_grievances: number;
  open_grievances: number;
  resolved_grievances: number;
  overdue_grievances: number;
  at_risk_grievances: number;
  on_track_grievances: number;
  reopened_grievances: number;
  avg_resolution_hours: number;
  resolution_rate: number;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string;
  default_sla_hours: number;
  staff_count?: number;
  total_cases?: number;
  active_cases?: number;
  resolved_cases?: number;
}

export interface Category {
  id: number;
  name: string;
  department_id: number;
  department_name?: string;
  department_code?: string;
  default_priority: GrievancePriority;
  sla_hours: number;
}
