import { Task, Holiday, Absence, KpiMetrics } from '../types';

export const RECURRING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

export function isHoliday(date: string, holidays: Holiday[]): boolean {
  return holidays.some((h) => h.date === date);
}

export function isUserAbsent(userId: string, date: string, absences: Absence[]): boolean {
  const d = date.split('T')[0];
  return absences.some(
    (a) => a.user_id === userId && a.from_date <= d && a.to_date >= d
  );
}

export function computeKpi(
  tasks: Task[],
  holidays: Holiday[],
  absences: Absence[],
  userId?: string
): KpiMetrics {
  const today = new Date().toISOString().split('T')[0];
  let filtered = tasks;
  if (userId) {
    filtered = tasks.filter((t) => t.assigned_to_id === userId);
  }
  const countable = filtered.filter((t) => {
    if (t.is_holiday || isHoliday(t.due_date, holidays)) return false;
    if (isUserAbsent(t.assigned_to_id, t.due_date, absences)) return false;
    return true;
  });
  const total = countable.length;
  const onTime = countable.filter(
    (t) => t.status === 'completed' && t.completed_at && t.completed_at.split('T')[0] <= t.due_date
  ).length;
  const late = countable.filter(
    (t) => t.status === 'completed' && t.completed_at && t.completed_at.split('T')[0] > t.due_date
  ).length;
  const overdue = countable.filter(
    (t) =>
      (t.status === 'pending' ||
        t.status === 'overdue' ||
        t.status === 'pending_verification' ||
        t.status === 'correction_required') &&
      t.due_date < today
  ).length;
  const completed = onTime + late;
  const latePercent = completed > 0 ? Math.round((late / completed) * 100) : 0;
  const overduePercent = total > 0 ? Math.round((overdue / total) * 100) : 0;
  return {
    total_assigned: total,
    on_time_completed: onTime,
    late_completed: late,
    overdue_count: overdue,
    overdue_percent: overduePercent,
    late_completion_percent: latePercent,
  };
}

export interface MemberKpiRow {
  userId: string;
  userName: string;
  city?: string;
  total_assigned: number;
  on_time_completed: number;
  late_completed: number;
  overdue_count: number;
  overdue_percent: number;
  late_completion_percent: number;
}

export function computeKpiByMember(
  tasks: Task[],
  holidays: Holiday[],
  absences: Absence[],
  users: { id: string; name: string; city?: string }[]
): MemberKpiRow[] {
  const today = new Date().toISOString().split('T')[0];
  const rows: MemberKpiRow[] = users.map((u) => {
    const userTasks = tasks.filter((t) => t.assigned_to_id === u.id);
    const countable = userTasks.filter((t) => {
      if (t.is_holiday || isHoliday(t.due_date, holidays)) return false;
      if (isUserAbsent(t.assigned_to_id, t.due_date, absences)) return false;
      return true;
    });
    const onTime = countable.filter(
      (t) => t.status === 'completed' && t.completed_at && t.completed_at.split('T')[0] <= t.due_date
    ).length;
    const late = countable.filter(
      (t) => t.status === 'completed' && t.completed_at && t.completed_at.split('T')[0] > t.due_date
    ).length;
    const overdue = countable.filter(
      (t) =>
        (t.status === 'pending' ||
          t.status === 'overdue' ||
          t.status === 'pending_verification' ||
          t.status === 'correction_required') &&
        t.due_date < today
    ).length;
    const completed = onTime + late;
    const latePercent = completed > 0 ? Math.round((late / completed) * 100) : 0;
    const overduePercent = countable.length > 0 ? Math.round((overdue / countable.length) * 100) : 0;
    return {
      userId: u.id,
      userName: u.name,
      city: u.city,
      total_assigned: countable.length,
      on_time_completed: onTime,
      late_completed: late,
      overdue_count: overdue,
      overdue_percent: overduePercent,
      late_completion_percent: latePercent,
    };
  });
  return rows.sort((a, b) => b.total_assigned - a.total_assigned);
}

const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 0.75;

/** Compress an image file for faster upload (resize + JPEG). Returns original file if not an image or on error. */
export function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file);
  return new Promise((resolve) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const name = file.name.replace(/\.[^.]+$/, '.jpg');
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function getPendingDays(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
