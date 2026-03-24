/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

const COLLECTIONS = {
  TASKS: 'tasks',
  USERS: 'tasks_users',
};

/** Normalize phone to 11za format: country code + number, no + or spaces */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && !digits.startsWith('0')) return '91' + digits;
  if (digits.startsWith('91') && digits.length === 12) return digits;
  return digits;
}

/** Sanitize origin website for API calls */
function sanitizeOrigin(origin: string): string {
  return origin.replace(/[`"' ]/g, '').trim();
}

/** Call 11za sendTemplate API */
async function send11zaTemplate(
  phone: string,
  templateName: string,
  bodyParams: string[],
  config: { apiUrl: string; originWebsite: string; authToken: string }
): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const body = {
    sendto: normalizedPhone,
    authToken: config.authToken,
    originWebsite: sanitizeOrigin(config.originWebsite),
    language: 'en',
    templateName,
    data: bodyParams,
  };

  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`11za API ${res.status}: ${text}`);
  }
}

/**
 * Scheduled function: runs daily at 11:00 AM IST.
 * Sends WhatsApp notification via 11za to each user with overdue tasks.
 * Only sends a message if the user has at least one overdue task.
 */
export const sendDailyDueDateReminders = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl =
      process.env.ELEVENZA_API_URL ||
      'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite =
      process.env.ELEVENZA_ORIGIN_WEBSITE ||
      'https://whiterock.co.in/';
    const templateOverdueCount =
      process.env.ELEVENZA_TEMPLATE_OVERDUE_COUNT ||
      'overdue_count';

    if (!authToken) {
      logger.warn('ELEVENZA_AUTH_TOKEN secret not set; skipping daily overdue reminders');
      return;
    }

    const db = admin.firestore();
    const today = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      .replace(/\//g, '-'); // YYYY-MM-DD

    // Query tasks that are still active AND have a due_date before today
    const overdueTasksSnap = await db
      .collection(COLLECTIONS.TASKS)
      .where('status', 'in', ['pending', 'in_progress', 'overdue', 'correction_required'])
      .where('due_date', '<', today)
      .get();

    // Group overdue tasks count by assigned user
    const overdueByUserId = new Map<string, number>();
    for (const doc of overdueTasksSnap.docs) {
      const d = doc.data();
      const uid = d.assigned_to_id;
      if (!uid) continue;
      const count = (overdueByUserId.get(uid) || 0) + 1;
      overdueByUserId.set(uid, count);
    }

    // Early exit if no overdue tasks
    if (overdueByUserId.size === 0) {
      logger.info('No overdue tasks found; skipping notifications');
      return;
    }

    const usersSnap = await db.collection(COLLECTIONS.USERS).get();
    const usersById = new Map<string, { phone?: string; name: string }>();
    for (const doc of usersSnap.docs) {
      const d = doc.data();
      usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    }

    const elevenzaConfig = {
      apiUrl,
      originWebsite,
      authToken,
    };

    // Send overdue notifications to users who have overdue tasks
    for (const [userId, overdueCount] of overdueByUserId) {
      const user = usersById.get(userId);
      const phone = user?.phone;
      if (!phone) {
        logger.info(`No phone for user ${userId}; skipping`);
        continue;
      }

      try {
        await send11zaTemplate(phone, templateOverdueCount, [overdueCount.toString()], elevenzaConfig);
        logger.info(`Overdue reminder sent to ${phone}: ${overdueCount} tasks`);
      } catch (err) {
        logger.error(`Failed to send to ${phone}:`, err);
      }
    }

    return;
  }
);

/**
 * Scheduled function: runs daily at 8:00 AM IST.
 * Sends a WhatsApp reminder to every member who has at least one
 * assigned/pending task, prompting them to check the task software.
 */
export const sendDailyReminder = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl =
      process.env.ELEVENZA_API_URL ||
      'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite =
      process.env.ELEVENZA_ORIGIN_WEBSITE ||
      'https://whiterock.co.in/';
    const templateDailyReminder =
      process.env.ELEVENZA_TEMPLATE_DAILY_REMINDER ||
      'daily_reminder';

    if (!authToken) {
      logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping daily reminders');
      return;
    }

    const db = admin.firestore();

    // Find all tasks that are active (assigned/pending)
    const activeTasksSnap = await db
      .collection(COLLECTIONS.TASKS)
      .where('status', 'in', ['pending', 'in_progress'])
      .get();

    // Collect unique user IDs who have at least one active task
    const userIdsWithTasks = new Set<string>();
    for (const doc of activeTasksSnap.docs) {
      const uid = doc.data().assigned_to_id;
      if (uid) userIdsWithTasks.add(uid);
    }

    if (userIdsWithTasks.size === 0) {
      logger.info('No users with active tasks; skipping daily reminders');
      return;
    }

    // Fetch all users to get phone numbers
    const usersSnap = await db.collection(COLLECTIONS.USERS).get();
    const usersById = new Map<string, { phone?: string; name: string }>();
    for (const doc of usersSnap.docs) {
      const d = doc.data();
      usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    }

    const elevenzaConfig = {
      apiUrl,
      originWebsite,
      authToken,
    };

    let sentCount = 0;
    for (const userId of userIdsWithTasks) {
      const user = usersById.get(userId);
      const phone = user?.phone;
      if (!phone) {
        logger.info(`No phone for user ${userId}; skipping daily reminder`);
        continue;
      }

      try {
        await send11zaTemplate(phone, templateDailyReminder, [user.name], elevenzaConfig);
        logger.info(`Daily reminder sent to ${user.name} (${phone})`);
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send daily reminder to ${phone}:`, err);
      }
    }

    logger.info(`Daily reminders complete: sent to ${sentCount} users`);
    return;
  }
);

