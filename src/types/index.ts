export type UserRole = 'student' | 'staff' | 'officer' | 'dept_admin' | 'office_head' | 'super_admin';

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'critical';

export type ComplaintStatus =
  | 'submitted'
  | 'under_review'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'reopened';

export interface BAUSTDepartment {
  id: string;
  code: string;
  name: string;
  head_title: string;
  email: string;
  category_tags: string[];
}

export interface DepartmentCategory {
  id: string;
  department_id: string;
  name: string;
  created_by?: string | null;
  created_at?: string;
  is_active?: boolean;
}

export interface UploadedAttachment {
  file_name: string;
  file_url: string;
  storage_path?: string;
  file_type: string;
  size_bytes: number;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  student_or_emp_id: string;
  phone?: string;
  role: UserRole;
  department_id: string | null; // Bound to BAUSTDepartment for staff/office_head
  department_code?: string;
  department_name?: string;
  is_blocked: boolean;
  avatar_url: string;
  created_at: string;
  password?: string;
}

export interface ComplaintAttachment {
  id: string;
  complaint_id: string;
  file_name: string;
  file_url: string;
  storage_path?: string | null;
  file_type: string;
  size_bytes: number;
  created_at: string;
}

export interface ComplaintHistoryItem {
  id: string;
  complaint_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  note: string;
  created_at: string;
}

export interface ComplaintMessage {
  id: string;
  complaint_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  body: string;
  is_internal: boolean; // Confidential staff note vs student live chat
  created_at: string;
}

export interface ComplaintFeedback {
  id: string;
  complaint_id: string;
  rating: number; // 1 to 5
  comment: string;
  created_at: string;
}

export interface ComplaintNotification {
  id: string;
  user_id: string; // user id or 'dept_{dept_id}' or 'all_admins'
  complaint_id: string;
  tracking_id: string;
  text: string;
  type: 'status_change' | 'assignment' | 'new_message' | 'sos_alert' | 'deadline_warning' | 'feedback' | 'forwarded';
  is_read: boolean;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole;
  action: string;
  target: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface Complaint {
  id: string;
  tracking_id: string; // CMP-BAUST-2026-XXXX
  user_id: string;
  student_name: string;
  student_id: string;
  student_email: string;
  is_anonymous: boolean;
  revealed_by_admin?: boolean;
  department_id: string; // FK to BAUSTDepartment (STRICT TARGET ROUTING)
  department_code?: string;
  department_name?: string;
  // Inter-Department Forwarding Fields:
  forwarded_from_department_id?: string | null;
  forwarded_from_department_code?: string;
  forwarded_from_department_name?: string;
  forwarded_reason?: string;
  forwarded_at?: string;
  transfer_count?: number;
  category: string;
  subject: string;
  description: string;
  priority: ComplaintPriority;
  is_sos: boolean;
  status: ComplaintStatus;
  assigned_to: string | null;
  assigned_to_name?: string;
  deadline: string | null;
  is_spam: boolean;
  merged_into: string | null;
  attachments?: ComplaintAttachment[];
  history?: ComplaintHistoryItem[];
  messages?: ComplaintMessage[];
  feedback?: ComplaintFeedback | null;
  created_at: string;
  updated_at: string;
}

export interface BAUSTAnalytics {
  total: number;
  submitted: number;
  under_review: number;
  assigned: number;
  in_progress: number;
  resolved: number;
  reopened: number;
  critical_sos: number;
  overdue: number;
  by_department: { code: string; name: string; count: number; resolved: number }[];
  monthly_trends: { month: string; count: number; resolved: number }[];
  avg_resolution_hours: { dept: string; hours: number }[];
}

/**
 * Formats department name and code cleanly without duplicate acronyms like "(CSE, CSE)" or "(CSE) (CSE)".
 */
export function formatDepartmentDisplayName(dept?: { name?: string; code?: string } | null): string {
  if (!dept || !dept.name) return '';
  let name = dept.name.trim();
  const code = (dept.code || '').trim();

  // Remove duplicate parenthesized codes like (CSE, CSE) or (CSE) (CSE)
  name = name.replace(/\s*\(([A-Za-z0-9\s,&_-]+)\)\s*\(\1\)/gi, ' ($1)');
  name = name.replace(/\s*\(([A-Za-z0-9\s]+),\s*\1\)/gi, ' ($1)');

  if (!code) return name;

  // If the clean name already ends with or contains the exact code in parentheses, e.g. "(CSE)", return name as-is
  const codeRegex = new RegExp(`\\(${code}\\)`, 'i');
  if (codeRegex.test(name)) {
    return name;
  }

  // Only omit code if it already appears as a standalone word in name (e.g. English, Registrar, Proctor, Accounts, Hostel)
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundaryRegex = new RegExp(`\\b${escapedCode}\\b`, 'i');
  if (name.toLowerCase() === code.toLowerCase() || wordBoundaryRegex.test(name)) {
    return name;
  }

  return `${name} (${code})`;
}
