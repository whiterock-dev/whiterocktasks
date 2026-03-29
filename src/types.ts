/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
export enum UserRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  DOER = 'doer',
  AUDITOR = 'auditor',
  VERIFIER = 'verifier',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  city?: string;
  password?: string;
  approved?: boolean;
  created_at?: string;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type RecurringType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled'
  | 'closed_permanently'
  | 'pending_verification'
  | 'correction_required';

export type AuditStatus = 'pending' | 'audited' | 'bogus' | 'unclear';

export interface Task {
  id: string;
  title: string;
  description: string;
  start_date?: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  recurring: RecurringType;
  /**
   * Whether this task requires verification by a separate verifier.
   * Missing/undefined should be treated as false for backward compatibility.
   */
  verification_required?: boolean;
  verifier_id?: string;
  verifier_name?: string;
  attachment_required: boolean;
  attachment_type?: 'media' | 'text';
  attachment_description?: string;
  recurring_days?: number[];
  assigned_to_id: string;
  assigned_to_name: string;
  assigned_to_city?: string;
  assigned_by_id: string;
  assigned_by_name: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  is_holiday?: boolean;
  parent_task_id?: string;
  audit_status?: AuditStatus;
  audited_at?: string;
  audited_by?: string;
  attachment_url?: string;
  attachment_text?: string;
  assignee_deleted?: boolean;
  verified_at?: string;
  verified_by?: string;
  /** Set when verifier rejects (status correction_required). Visible to assignee. */
  verification_rejection_comment?: string;
  verification_rejected_at?: string;
  verification_rejected_by?: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  created_at: string;
}

export interface Absence {
  id: string;
  user_id: string;
  user_name: string;
  from_date: string;
  to_date: string;
  reason?: string;
  created_at: string;
}

export interface RemovalRequest {
  id: string;
  task_id: string;
  task_title: string;
  requested_by_id: string;
  requested_by_name: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface KpiMetrics {
  total_assigned: number;
  on_time_completed: number;
  late_completed: number;
  overdue_count: number;
  overdue_percent: number;
  late_completion_percent: number;
}
