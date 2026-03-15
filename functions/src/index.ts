/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

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
    phone: normalizedPhone,
    templateName,
    originWebsite: config.originWebsite,
    bodyParams,
  };

  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.authToken}`,
      'X-Origin-Website': config.originWebsite,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`11za API ${res.status}: ${text}`);
  }
}

/**
 * Scheduled function: runs daily at 8:00 AM IST.
 * Sends WhatsApp reminder via 11za to each user who has tasks due today.
 *
 * Set config before deploy:
 *   firebase functions:config:set 11za.auth_token "YOUR_TOKEN"
 *   firebase functions:config:set 11za.origin_website "https://whiterock.co.in/"
 *   firebase functions:config:set 11za.api_url "https://app.11za.in/apis/template/sendTemplate"
 *   firebase functions:config:set 11za.template_daily "daily_tasks_reminder"
 */
export const sendDailyDueDateReminders = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('30 2 * * *') // 02:30 UTC = 8:00 AM IST
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const config = functions.config().11za || {};
    const authToken = config.auth_token || process.env.VITE_11ZA_AUTH_TOKEN;
    const apiUrl =
      config.api_url ||
      process.env.VITE_11ZA_API_URL ||
      'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite =
      config.origin_website ||
      process.env.VITE_11ZA_ORIGIN_WEBSITE ||
      'https://whiterock.co.in/';
    const templateDaily = config.template_daily || 'daily_tasks_reminder';

    if (!authToken) {
      functions.logger.warn('11za auth_token not set; skipping daily reminders');
      return null;
    }

    const db = admin.firestore();
    const today = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      .replace(/\//g, '-'); // YYYY-MM-DD

    const tasksSnap = await db
      .collection(COLLECTIONS.TASKS)
      .where('due_date', '==', today)
      .where('status', 'in', ['pending', 'in_progress', 'overdue'])
      .get();

    const tasksByUserId = new Map<
      string,
      { title: string; due_date: string; priority: string }[]
    >();
    for (const doc of tasksSnap.docs) {
      const d = doc.data();
      const uid = d.assigned_to_id;
      if (!uid) continue;
      const list = tasksByUserId.get(uid) || [];
      list.push({
        title: d.title || '',
        due_date: d.due_date || today,
        priority: d.priority || 'medium',
      });
      tasksByUserId.set(uid, list);
    }

    const usersSnap = await db.collection(COLLECTIONS.USERS).get();
    const usersById = new Map<string, { phone?: string; name: string }>();
    usersSnap.docs.forEach((doc) => {
      const d = doc.data();
      usersById.set(doc.id, { phone: d.phone, name: d.name || '' });
    });

    const elevenzaConfig = {
      apiUrl,
      originWebsite,
      authToken,
    };

    for (const [userId, tasks] of tasksByUserId) {
      const user = usersById.get(userId);
      const phone = user?.phone;
      if (!phone) {
        functions.logger.info(`No phone for user ${userId}; skipping`);
        continue;
      }
      const taskList =
        tasks.length > 0
          ? tasks
              .map((t) => `${t.title} (Due: ${t.due_date}, ${t.priority})`)
              .join('\n• ')
          : 'No tasks due today.';
      try {
        await send11zaTemplate(
          phone,
          templateDaily,
          [today, taskList],
          elevenzaConfig
        );
        functions.logger.info(`Daily reminder sent to ${phone}`);
      } catch (err) {
        functions.logger.error(`Failed to send to ${phone}:`, err);
      }
    }

    return null;
  });

/**
 * Scheduled function: runs daily at 6:00 AM IST.
 * Creates today's task instances for recurring tasks with recurring === 'daily'
 * and recurring_days containing today's weekday (0=Mon .. 6=Sun).
 * Child tasks get parent_task_id set and due_date = today.
 */
export const createDailyRecurringTaskInstances = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('30 0 * * *') // 00:30 UTC = 6:00 AM IST
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const db = admin.firestore();
    const now = new Date();
    const today = now
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      .replace(/\//g, '-'); // YYYY-MM-DD
    // Weekday for date "today": 0=Mon .. 6=Sun (app format)
    const todayAtNoonUTC = new Date(today + 'T12:00:00Z');
    const jsDay = todayAtNoonUTC.getUTCDay(); // 0=Sun .. 6=Sat
    const appWeekday = jsDay === 0 ? 6 : jsDay - 1;

    const recurringSnap = await db
      .collection(COLLECTIONS.TASKS)
      .where('recurring', '==', 'daily')
      .get();

    const toCreate: Record<string, unknown>[] = [];
    for (const doc of recurringSnap.docs) {
      const d = doc.data();
      const days: number[] = d.recurring_days || [];
      if (!days.includes(appWeekday)) continue;
      const parentId = doc.id;
      const existing = await db
        .collection(COLLECTIONS.TASKS)
        .where('parent_task_id', '==', parentId)
        .where('due_date', '==', today)
        .limit(1)
        .get();
      if (!existing.empty) continue;

      toCreate.push({
        title: d.title || '',
        description: d.description || '',
        start_date: today,
        due_date: today,
        priority: d.priority || 'medium',
        status: 'pending',
        recurring: 'none',
        attachment_required: d.attachment_required || false,
        attachment_type: d.attachment_type,
        attachment_description: d.attachment_description,
        assigned_to_id: d.assigned_to_id || '',
        assigned_to_name: d.assigned_to_name || '',
        assigned_to_city: d.assigned_to_city,
        assigned_by_id: d.assigned_by_id || '',
        assigned_by_name: d.assigned_by_name || '',
        parent_task_id: parentId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const batch = db.batch();
    for (const data of toCreate) {
      const ref = db.collection(COLLECTIONS.TASKS).doc();
      batch.set(ref, data);
    }
    if (toCreate.length > 0) {
      await batch.commit();
      functions.logger.info(`Created ${toCreate.length} daily recurring task instances for ${today}`);
    }
    return null;
  });
