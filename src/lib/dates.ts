/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import { TaskStatus } from '../types';

/** YYYY-MM-DD for "today" in India Standard Time (app business timezone). */
export function getTodayIST(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .replace(/\//g, '-');
}

/** Hide future-start tasks as scheduled until start_date arrives. */
export function resolveInitialTaskStatus(
  requestedStatus: TaskStatus,
  startDate: string | undefined,
  today: string = getTodayIST()
): TaskStatus {
  if (requestedStatus === 'pending' && startDate && startDate > today) {
    return 'scheduled';
  }
  return requestedStatus;
}
