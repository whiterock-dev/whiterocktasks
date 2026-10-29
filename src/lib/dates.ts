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

/** HH:MM for the current time in India Standard Time. */
export function getCurrentTimeIST(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Decides the initial status for a newly created task.
 * Returns 'scheduled' if the task's start window (date + optional time) is still in the future.
 * Backward-compatible: callers that don't pass startTime get the existing date-only behaviour.
 */
export function resolveInitialTaskStatus(
  requestedStatus: TaskStatus,
  startDate: string | undefined,
  today: string = getTodayIST(),
  startTime?: string,
): TaskStatus {
  if (requestedStatus !== 'pending' || !startDate) return requestedStatus;

  // Future date → always scheduled regardless of time
  if (startDate > today) return 'scheduled';

  // Same day with a future start time → also scheduled
  if (startDate === today && startTime && startTime > getCurrentTimeIST()) return 'scheduled';

  return requestedStatus;
}
