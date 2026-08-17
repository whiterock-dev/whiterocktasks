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
  | 'scheduled'
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
  /** True for scheduler/controller record of a recurring stream. */
  is_recurring_master?: boolean;
  parent_task_id?: string;
  audit_status?: AuditStatus;
  audited_at?: string;
  audited_by?: string;
  attachment_url?: string;
  attachment_urls?: string[];
  attachment_text?: string;
  assignee_deleted?: boolean;
  verified_at?: string;
  verified_by?: string;
  /** Mandatory note entered by doer when marking task complete. */
  doer_remark?: string;
  /** Set when verifier rejects (status correction_required). Visible to assignee. */
  verification_rejection_comment?: string;
  verification_rejected_at?: string;
  verification_rejected_by?: string;
  audit_sop_text?: string;
  audit_sop_updated_by?: string;
  audit_sop_updated_at?: string;
  audit_sop_attachments?: {
    file_url: string;
    file_type: string;
    file_name: string;
    size: number;
    uploaded_by: string;
    uploaded_at: string;
  }[];
  audit_sop_links?: string[];
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
  /** Owner/manager note when rejecting; visible to the requester (doer). */
  rejection_reason?: string;
}

export type HelpTicketStatus = 'open' | 'in_progress' | 'resolved' | 'rated';

export interface HelpTicketProposedSolution {
  text: string;
  /** Optional priority ordering (1 = highest). */
  priority?: 1 | 2 | 3;
}

export interface HelpTicketRating {
  stars: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface HelpTicket {
  id: string;
  title: string;
  description: string;
  doer_id: string;
  doer_name: string;
  helper_id: string;
  helper_name: string;
  status: HelpTicketStatus;
  proposed_solutions?: HelpTicketProposedSolution[];
  /** Helper note added while resolving (visible to doer + owner). */
  helper_note?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  rated_at?: string;
  /** Rating & comment must NOT be shown to helper in UI. */
  rating?: HelpTicketRating;
}

export interface KpiMetrics {
  total_assigned: number;
  on_time_completed: number;
  late_completed: number;
  overdue_count: number;
  overdue_percent: number;
  late_completion_percent: number;
}

export type TaskLogAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'deleted'
  | 'closed_permanently'
  | 'audit_set'
  | 'verified'
  | 'verification_rejected'
  | 'audit_sop_updated';

export interface TaskLog {
  id: string;
  task_id: string;
  task_title: string;
  action: TaskLogAction;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  timestamp: string;
  /** Changed fields: key → { from, to }. Only for 'updated' and 'status_changed'. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  /** Full task snapshot captured before deletion. Only for 'deleted'. */
  deleted_snapshot?: Record<string, unknown>;
  /** Free-text context (e.g. page name or bulk action label). */
  note?: string;
}
