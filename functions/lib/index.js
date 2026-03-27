"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRecurringTasksDaily = exports.sendDailyReminder = exports.sendDailyDueDateReminders = void 0;
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const admin = require("firebase-admin");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
admin.initializeApp();
const COLLECTIONS = {
    TASKS: 'tasks',
    USERS: 'tasks_users',
};
const RECURRING_TYPES = [
    'daily',
    'weekly',
    'fortnightly',
    'monthly',
    'quarterly',
    'half_yearly',
    'yearly',
];
function toAppWeekday(date) {
    const jsWeekday = date.getUTCDay(); // 0 = Sun .. 6 = Sat
    return jsWeekday === 0 ? 6 : jsWeekday - 1; // 0 = Mon .. 6 = Sun
}
function getNextRecurringDueDate(dueDate, recurring, recurringDays) {
    if (!dueDate)
        return null;
    const base = new Date(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(base.getTime()))
        return null;
    const next = new Date(base);
    switch (recurring) {
        case 'daily': {
            const days = (recurringDays || []).slice().sort((a, b) => a - b);
            if (days.length === 0) {
                next.setUTCDate(next.getUTCDate() + 1);
            }
            else {
                const current = toAppWeekday(base);
                const nextDay = days.find((d) => d > current);
                const target = nextDay ?? days[0];
                const delta = nextDay != null ? target - current : 7 - current + target;
                next.setUTCDate(next.getUTCDate() + delta);
            }
            break;
        }
        case 'weekly':
            next.setUTCDate(next.getUTCDate() + 7);
            break;
        case 'fortnightly':
            next.setUTCDate(next.getUTCDate() + 14);
            break;
        case 'monthly':
            next.setUTCMonth(next.getUTCMonth() + 1);
            break;
        case 'quarterly':
            next.setUTCMonth(next.getUTCMonth() + 3);
            break;
        case 'half_yearly':
            next.setUTCMonth(next.getUTCMonth() + 6);
            break;
        case 'yearly':
            next.setUTCFullYear(next.getUTCFullYear() + 1);
            break;
        default:
            return null;
    }
    return next.toISOString().split('T')[0];
}
function getRecurringStreamKey(task) {
    return JSON.stringify({
        assigned_to_id: task.assigned_to_id || '',
        assigned_by_id: task.assigned_by_id || '',
        title: task.title || '',
        recurring: task.recurring || '',
        recurring_days: Array.isArray(task.recurring_days) ? [...task.recurring_days].sort((a, b) => a - b) : [],
        verifier_id: task.verifier_id || '',
        attachment_required: Boolean(task.attachment_required),
        attachment_type: task.attachment_type || '',
        attachment_description: task.attachment_description || '',
    });
}
/** Normalize phone to 11za format: country code + number, no + or spaces */
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && !digits.startsWith('0'))
        return '91' + digits;
    if (digits.startsWith('91') && digits.length === 12)
        return digits;
    return digits;
}
/** Sanitize origin website for API calls */
function sanitizeOrigin(origin) {
    return origin.replace(/[`"' ]/g, '').trim();
}
/** Call 11za sendTemplate API */
async function send11zaTemplate(phone, templateName, bodyParams, config) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone)
        return;
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
exports.sendDailyDueDateReminders = (0, scheduler_1.onSchedule)({
    schedule: '0 10 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 120,
    memory: '256MiB',
}, async () => {
    const isOverdueReminderEnabled = process.env.ENABLE_OVERDUE_COUNT_REMINDER === 'true';
    if (!isOverdueReminderEnabled) {
        firebase_functions_1.logger.info('Overdue count reminders are temporarily disabled (ENABLE_OVERDUE_COUNT_REMINDER != true)');
        return;
    }
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl = process.env.ELEVENZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = process.env.ELEVENZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateOverdueCount = process.env.ELEVENZA_TEMPLATE_OVERDUE_COUNT ||
        'overdue_count';
    if (!authToken) {
        firebase_functions_1.logger.warn('ELEVENZA_AUTH_TOKEN secret not set; skipping daily overdue reminders');
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
    const overdueByUserId = new Map();
    for (const doc of overdueTasksSnap.docs) {
        const d = doc.data();
        const uid = d.assigned_to_id;
        if (!uid)
            continue;
        const count = (overdueByUserId.get(uid) || 0) + 1;
        overdueByUserId.set(uid, count);
    }
    // Early exit if no overdue tasks
    if (overdueByUserId.size === 0) {
        firebase_functions_1.logger.info('No overdue tasks found; skipping notifications');
        return;
    }
    const usersSnap = await db.collection(COLLECTIONS.USERS).get();
    const usersById = new Map();
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
            firebase_functions_1.logger.info(`No phone for user ${userId}; skipping`);
            continue;
        }
        try {
            await send11zaTemplate(phone, templateOverdueCount, [overdueCount.toString()], elevenzaConfig);
            firebase_functions_1.logger.info(`Overdue reminder sent to ${phone}: ${overdueCount} tasks`);
        }
        catch (err) {
            firebase_functions_1.logger.error(`Failed to send to ${phone}:`, err);
        }
    }
    return;
});
/**
 * Scheduled function: runs daily at 8:00 AM IST.
 * Sends a WhatsApp reminder to every member who has at least one
 * assigned/pending task, prompting them to check the task software.
 */
exports.sendDailyReminder = (0, scheduler_1.onSchedule)({
    schedule: '0 8 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 120,
    memory: '256MiB',
}, async () => {
    const authToken = process.env.ELEVENZA_AUTH_TOKEN;
    const apiUrl = process.env.ELEVENZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = process.env.ELEVENZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateDailyReminder = process.env.ELEVENZA_TEMPLATE_DAILY_REMINDER ||
        'daily_reminder';
    if (!templateDailyReminder.trim()) {
        firebase_functions_1.logger.warn('ELEVENZA_TEMPLATE_DAILY_REMINDER is empty; skipping daily reminders');
        return;
    }
    if (!authToken) {
        firebase_functions_1.logger.warn('ELEVENZA_AUTH_TOKEN not set; skipping daily reminders');
        return;
    }
    const db = admin.firestore();
    // Find all tasks that are active (assigned/pending)
    const activeTasksSnap = await db
        .collection(COLLECTIONS.TASKS)
        .where('status', 'in', ['pending', 'in_progress', 'overdue'])
        .get();
    // Collect unique user IDs who have at least one active task
    const userIdsWithTasks = new Set();
    for (const doc of activeTasksSnap.docs) {
        const uid = doc.data().assigned_to_id;
        if (uid)
            userIdsWithTasks.add(uid);
    }
    if (userIdsWithTasks.size === 0) {
        firebase_functions_1.logger.info('No users with active tasks; skipping daily reminders');
        return;
    }
    // Fetch all users to get phone numbers
    const usersSnap = await db.collection(COLLECTIONS.USERS).get();
    const usersById = new Map();
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
            firebase_functions_1.logger.info(`No phone for user ${userId}; skipping daily reminder`);
            continue;
        }
        try {
            await send11zaTemplate(phone, templateDailyReminder, [user.name], elevenzaConfig);
            firebase_functions_1.logger.info(`Daily reminder sent to ${user.name} (${phone})`);
            sentCount++;
        }
        catch (err) {
            firebase_functions_1.logger.error(`Failed to send daily reminder to ${phone}:`, err);
        }
    }
    firebase_functions_1.logger.info(`Daily reminders complete: sent to ${sentCount} users`);
    return;
});
/**
 * Scheduled function: runs daily at 7:00 AM IST.
 * Uses recurring tasks as masters, creates normal task instances, and advances only master due dates.
 */
exports.generateRecurringTasksDaily = (0, scheduler_1.onSchedule)({
    schedule: '0 7 * * *',
    timeZone: 'Asia/Kolkata',
    timeoutSeconds: 540,
    memory: '512MiB',
}, async () => {
    const db = admin.firestore();
    const nowIso = new Date().toISOString();
    const today = new Date()
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        .replace(/\//g, '-');
    const recurringSnap = await db
        .collection(COLLECTIONS.TASKS)
        .where('recurring', 'in', RECURRING_TYPES)
        .get();
    if (recurringSnap.empty) {
        firebase_functions_1.logger.info('No recurring tasks found; skipping daily recurring generation');
        return;
    }
    const streamMap = new Map();
    for (const taskDoc of recurringSnap.docs) {
        const task = taskDoc.data();
        if (!task?.due_date)
            continue;
        if (task.status === 'closed_permanently')
            continue;
        const streamKey = getRecurringStreamKey(task);
        const existing = streamMap.get(streamKey) || [];
        existing.push({ id: taskDoc.id, ...task });
        streamMap.set(streamKey, existing);
    }
    let createdCount = 0;
    let streamCount = 0;
    for (const streamTasks of streamMap.values()) {
        if (streamTasks.length === 0)
            continue;
        streamCount += 1;
        streamTasks.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
        const template = streamTasks[streamTasks.length - 1];
        const recurring = template.recurring;
        if (!RECURRING_TYPES.includes(recurring))
            continue;
        const masterTaskId = String(template.id || '');
        const masterRef = db.collection(COLLECTIONS.TASKS).doc(masterTaskId);
        const existingInstanceSnap = await db
            .collection(COLLECTIONS.TASKS)
            .where('parent_task_id', '==', masterTaskId)
            .where('recurring', '==', 'none')
            .get();
        const existingInstanceDueDates = new Set(existingInstanceSnap.docs.map((d) => String(d.data().due_date || '')));
        let cursor = String(template.due_date || '');
        const originalCursor = cursor;
        let guard = 0;
        while (cursor <= today && guard < 400) {
            guard += 1;
            if (!existingInstanceDueDates.has(cursor)) {
                const newTask = {
                    title: template.title || '',
                    description: template.description || '',
                    start_date: today,
                    due_date: cursor,
                    priority: template.priority || 'medium',
                    status: 'pending',
                    recurring: 'none',
                    recurring_days: null,
                    verification_required: template.verification_required === true,
                    verifier_id: template.verifier_id || null,
                    verifier_name: template.verifier_name || null,
                    attachment_required: template.attachment_required === true,
                    attachment_type: template.attachment_type || null,
                    attachment_description: template.attachment_description || null,
                    assigned_to_id: template.assigned_to_id || '',
                    assigned_to_name: template.assigned_to_name || '',
                    assigned_to_city: template.assigned_to_city || null,
                    assigned_by_id: template.assigned_by_id || '',
                    assigned_by_name: template.assigned_by_name || '',
                    assignee_deleted: template.assignee_deleted === true,
                    parent_task_id: masterTaskId,
                    is_holiday: template.is_holiday === true,
                    created_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
                    updated_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
                };
                await db.collection(COLLECTIONS.TASKS).add(newTask);
                existingInstanceDueDates.add(cursor);
                createdCount += 1;
            }
            const nextDueDate = getNextRecurringDueDate(cursor, recurring, template.recurring_days);
            if (!nextDueDate)
                break;
            cursor = nextDueDate;
        }
        // Only master due_date moves forward; recurring table stays as master list.
        if (cursor !== originalCursor) {
            await masterRef.update({
                due_date: cursor,
                updated_at: admin.firestore.Timestamp.fromDate(new Date(nowIso)),
            });
        }
    }
    firebase_functions_1.logger.info(`Recurring generation complete: processed ${streamCount} streams, created ${createdCount} tasks`);
    return;
});
