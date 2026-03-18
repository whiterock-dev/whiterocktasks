"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDailyRecurringTaskInstances = exports.sendDailyDueDateReminders = void 0;
/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const COLLECTIONS = {
    TASKS: 'tasks',
    USERS: 'tasks_users',
};
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
exports.sendDailyDueDateReminders = functions
    .runWith({ timeoutSeconds: 120, memory: '256MB' })
    .pubsub.schedule('0 11 * * *') //11:00 AM IST
    .timeZone('Asia/Kolkata')
    .onRun(async () => {
    const config = functions.config()['11za'] || {};
    const authToken = config.auth_token || process.env.VITE_11ZA_AUTH_TOKEN;
    const apiUrl = config.api_url ||
        process.env.VITE_11ZA_API_URL ||
        'https://app.11za.in/apis/template/sendTemplate';
    const originWebsite = config.origin_website ||
        process.env.VITE_11ZA_ORIGIN_WEBSITE ||
        'https://whiterock.co.in/';
    const templateOverdueCount = process.env.VITE_11ZA_TEMPLATE_OVERDUE_COUNT ||
        config.template_overdue_count ||
        'overdue_count';
    if (!authToken) {
        functions.logger.warn('11za auth_token not set; skipping daily overdue reminders');
        return null;
    }
    const db = admin.firestore();
    // Get all overdue tasks
    const overdueTasksSnap = await db
        .collection(COLLECTIONS.TASKS)
        .where('status', '==', 'overdue')
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
        functions.logger.info('No overdue tasks found; skipping notifications');
        return null;
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
        const phone = user === null || user === void 0 ? void 0 : user.phone;
        if (!phone) {
            functions.logger.info(`No phone for user ${userId}; skipping`);
            continue;
        }
        try {
            await send11zaTemplate(phone, templateOverdueCount, [overdueCount.toString()], elevenzaConfig);
            functions.logger.info(`Overdue reminder sent to ${phone}: ${overdueCount} tasks`);
        }
        catch (err) {
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
exports.createDailyRecurringTaskInstances = functions
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
    const toCreate = [];
    for (const doc of recurringSnap.docs) {
        const d = doc.data();
        const days = d.recurring_days || [];
        if (!days.includes(appWeekday))
            continue;
        const parentId = doc.id;
        const existing = await db
            .collection(COLLECTIONS.TASKS)
            .where('parent_task_id', '==', parentId)
            .where('due_date', '==', today)
            .limit(1)
            .get();
        if (!existing.empty)
            continue;
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
