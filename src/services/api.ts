/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import {
  db,
  COLLECTIONS,
  timestampToISO,
  isoToTimestamp,
} from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  FirestoreError,
} from 'firebase/firestore';
import {
  User,
  Task,
  TaskStatus,
  TaskPriority,
  Holiday,
  Absence,
  RemovalRequest,
  AuditStatus,
} from '../types';

const docToTask = (d: any): Task => {
  const data = d.data();
  return {
    id: d.id,
    title: data.title || '',
    description: data.description || '',
    start_date: data.start_date,
    due_date: data.due_date || '',
    priority: data.priority || 'medium',
    status: (data.status as TaskStatus) || 'pending',
    recurring: data.recurring || 'none',
    attachment_required: data.attachment_required || false,
    attachment_type: data.attachment_type,
    attachment_description: data.attachment_description,
    recurring_days: data.recurring_days,
    assigned_to_id: data.assigned_to_id || '',
    assigned_to_name: data.assigned_to_name || '',
    assigned_to_city: data.assigned_to_city,
    assigned_by_id: data.assigned_by_id || '',
    assigned_by_name: data.assigned_by_name || '',
    verification_required: data.verification_required === true,
    verifier_id: data.verifier_id,
    verifier_name: data.verifier_name,
    created_at: timestampToISO(data.created_at),
    updated_at: timestampToISO(data.updated_at),
    completed_at: data.completed_at ? timestampToISO(data.completed_at) : undefined,
    is_holiday: data.is_holiday,
    parent_task_id: data.parent_task_id,
    audit_status: data.audit_status,
    audited_at: data.audited_at ? timestampToISO(data.audited_at) : undefined,
    audited_by: data.audited_by,
    attachment_url: data.attachment_url,
    attachment_text: data.attachment_text,
    assignee_deleted: data.assignee_deleted === true,
    verified_at: data.verified_at ? timestampToISO(data.verified_at) : undefined,
    verified_by: data.verified_by,
    verification_rejection_comment: data.verification_rejection_comment,
    verification_rejected_at:
      data.verification_rejected_at == null
        ? undefined
        : typeof data.verification_rejected_at === 'string'
          ? data.verification_rejected_at
          : timestampToISO(data.verification_rejected_at),
    verification_rejected_by: data.verification_rejected_by,
  };
};

export const api = {
  // --- Auth ---
  login: async (email: string, password: string): Promise<User> => {
    const usersRef = collection(db, COLLECTIONS.USERS);
    const q = query(usersRef, where('email', '==', email.toLowerCase().trim()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('Invalid email or password');
    const doc = snap.docs[0];
    const data = doc.data();
    if (data.password !== password) throw new Error('Invalid email or password');
    const { password: _, ...u } = { ...data, id: doc.id };
    return u as User;
  },

  // --- Users ---
  getUsers: async (): Promise<User[]> => {
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    return snap.docs.map((d) => {
      const data = d.data();
      const { password, ...u } = { ...data, id: d.id };
      return u as User;
    });
  },

  createUser: async (u: Omit<User, 'id'> & { password: string }): Promise<User> => {
    const ref = await addDoc(collection(db, COLLECTIONS.USERS), {
      ...u,
      password: u.password,
      approved: true,
      created_at: isoToTimestamp(new Date().toISOString()),
    });
    const { password, ...safe } = u;
    return { ...safe, id: ref.id } as User;
  },

  deleteUser: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTIONS.USERS, id));
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<void> => {
    await updateDoc(doc(db, COLLECTIONS.USERS, id), {
      ...updates,
      updated_at: isoToTimestamp(new Date().toISOString()),
    });
  },

  // --- Tasks ---
  getTasks: async (filters?: {
    assignedTo?: string;
    assignedBy?: string;
    status?: TaskStatus;
  }): Promise<Task[]> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    let q = query(tasksRef, orderBy('updated_at', 'desc'));
    if (filters?.assignedTo) {
      q = query(tasksRef, where('assigned_to_id', '==', filters.assignedTo), orderBy('updated_at', 'desc'));
    } else if (filters?.assignedBy) {
      q = query(tasksRef, where('assigned_by_id', '==', filters.assignedBy), orderBy('updated_at', 'desc'));
    } else if (filters?.status) {
      q = query(tasksRef, where('status', '==', filters.status), orderBy('updated_at', 'desc'));
    }
    const snap = await getDocs(q);
    let tasks = snap.docs.map((d) => docToTask(d));
    if (filters?.assignedTo && filters?.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    return tasks;
  },

  getTaskById: async (id: string): Promise<Task | null> => {
    const snap = await getDoc(doc(db, COLLECTIONS.TASKS, id));
    return snap.exists() ? docToTask(snap) : null;
  },

  /** Recent completed tasks for sidebar (e.g. limit 10). Requires Firestore index: status asc, completed_at desc. */
  getRecentCompletedTasks: async (limitCount: number = 10): Promise<Task[]> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const q = query(
      tasksRef,
      where('status', '==', 'completed'),
      orderBy('completed_at', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToTask(d));
  },

  /** Overdue tasks (server-side). Optional assignedToId for doer. Requires composite index. */
  getOverdueTasks: async (
    opts: { assignedToId?: string; limitCount?: number } = {}
  ): Promise<Task[]> => {
    const { assignedToId, limitCount = 50 } = opts;
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const today = new Date().toISOString().split('T')[0];
    let q = query(
      tasksRef,
      where('status', 'in', ['pending', 'overdue', 'pending_verification', 'correction_required']),
      where('due_date', '<', today),
      orderBy('due_date', 'asc'),
      limit(limitCount)
    );
    if (assignedToId) {
      q = query(
        tasksRef,
        where('assigned_to_id', '==', assignedToId),
        where('status', 'in', ['pending', 'overdue', 'pending_verification', 'correction_required']),
        where('due_date', '<', today),
        orderBy('due_date', 'asc'),
        limit(limitCount)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToTask(d));
  },

  /** Completed tasks with required attachment for Bogus Attachment page. */
  getBogusAttachmentTasks: async (limitCount: number = 50): Promise<Task[]> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const q = query(
      tasksRef,
      where('status', '==', 'completed'),
      where('attachment_required', '==', true),
      orderBy('updated_at', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToTask(d));
  },

  /** Paginated tasks. Returns tasks and lastDoc for next page. */
  getTasksPaginated: async (opts: {
    pageSize: number;
    startAfterDoc?: QueryDocumentSnapshot | null;
    assignedTo?: string;
    assignedBy?: string;
    status?: TaskStatus;
    statusIn?: TaskStatus[];
    recurring?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    verifierId?: string;
    sortBy?: 'updated_at' | 'start_date' | 'due_date' | 'completed_at';
    sortDirection?: 'asc' | 'desc';
  }): Promise<{ tasks: Task[]; lastDoc: QueryDocumentSnapshot | null }> => {
    const {
      pageSize,
      startAfterDoc,
      assignedTo,
      assignedBy,
      status,
      statusIn,
      recurring,
      dueDateFrom,
      dueDateTo,
      verifierId,
      sortBy,
      sortDirection,
    } = opts;
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const hasDueDateRange = Boolean(dueDateFrom || dueDateTo);
    const effectiveSortBy = sortBy || (hasDueDateRange ? 'due_date' : 'updated_at');
    const effectiveSortDirection = sortDirection || 'desc';
    const constraints: any[] = [
      orderBy(effectiveSortBy, effectiveSortDirection),
    ];
    if (assignedTo) {
      constraints.unshift(where('assigned_to_id', '==', assignedTo));
    }
    if (assignedBy) {
      constraints.unshift(where('assigned_by_id', '==', assignedBy));
    }
    if (verifierId) {
      constraints.unshift(where('verifier_id', '==', verifierId));
    }
    if (status) {
      constraints.unshift(where('status', '==', status));
    }
    if (statusIn && statusIn.length > 0) {
      constraints.unshift(where('status', 'in', statusIn));
    }
    if (recurring) {
      constraints.unshift(where('recurring', '==', recurring));
    }
    if (dueDateFrom) {
      constraints.unshift(where('due_date', '>=', dueDateFrom));
    }
    if (dueDateTo) {
      constraints.unshift(where('due_date', '<=', dueDateTo));
    }
    if (startAfterDoc) {
      constraints.push(startAfter(startAfterDoc));
    }
    constraints.push(limit(pageSize));
    try {
      const q = query(tasksRef, ...constraints);
      const snap = await getDocs(q);
      const tasks = snap.docs.map((d) => docToTask(d));
      const lastDoc =
        snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
      return { tasks, lastDoc };
    } catch (error) {
      const firestoreError = error as FirestoreError;
      const isFallbackError = firestoreError?.code === 'failed-precondition' || firestoreError?.code === 'invalid-argument';
      if (!isFallbackError) throw error;

      // Fallback when composite index is missing or multi-inequality is rejected:
      // Query primarily by ONE equality field, then filter and sort client-side
      // to avoid any further index or equality-mixing errors.
      const fallbackConstraints: any[] = [];
      if (assignedTo) {
        fallbackConstraints.push(where('assigned_to_id', '==', assignedTo));
      } else if (assignedBy) {
        fallbackConstraints.push(where('assigned_by_id', '==', assignedBy));
      } else if (verifierId) {
        fallbackConstraints.push(where('verifier_id', '==', verifierId));
      } else if (status) {
        fallbackConstraints.push(where('status', '==', status));
      }

      const fallbackQuery =
        fallbackConstraints.length > 0
          ? query(tasksRef, fallbackConstraints[0]) // Only use the FIRST constraint!
          : query(tasksRef);
      
      const fallbackSnap = await getDocs(fallbackQuery);
      let rawTasks = fallbackSnap.docs.map((d) => docToTask(d));

      if (assignedTo) rawTasks = rawTasks.filter((t) => t.assigned_to_id === assignedTo);
      if (assignedBy) rawTasks = rawTasks.filter((t) => t.assigned_by_id === assignedBy);
      if (verifierId) rawTasks = rawTasks.filter((t) => t.verifier_id === verifierId);
      if (status) rawTasks = rawTasks.filter((t) => t.status === status);
      if (statusIn && statusIn.length > 0) rawTasks = rawTasks.filter((t) => statusIn.includes(t.status as TaskStatus));
      if (recurring) rawTasks = rawTasks.filter((t) => t.recurring === recurring);
      if (dueDateFrom) rawTasks = rawTasks.filter((t) => t.due_date && t.due_date >= dueDateFrom);
      if (dueDateTo) rawTasks = rawTasks.filter((t) => t.due_date && t.due_date <= dueDateTo);

      const tasks = rawTasks.sort((a, b) => {
        const aValue = (a[effectiveSortBy] || '') as string;
        const bValue = (b[effectiveSortBy] || '') as string;
        if (aValue === bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;
        if (effectiveSortDirection === 'asc') {
          return aValue < bValue ? -1 : 1;
        }
        return aValue > bValue ? -1 : 1;
      });

      return { tasks, lastDoc: null };
    }
  },

  /** Fetch all tasks matching filters/sort. Useful for full-data export across pages. */
  getAllTasksByFilters: async (opts: {
    assignedTo?: string;
    assignedBy?: string;
    status?: TaskStatus;
    statusIn?: TaskStatus[];
    recurring?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    verifierId?: string;
    sortBy?: 'updated_at' | 'start_date' | 'due_date' | 'completed_at';
    sortDirection?: 'asc' | 'desc';
    batchSize?: number;
  }): Promise<Task[]> => {
    const { batchSize = 1000, ...filters } = opts;
    const allTasks: Task[] = [];
    let cursor: QueryDocumentSnapshot | null | undefined = undefined;

    for (let i = 0; i < 200; i += 1) {
      const { tasks, lastDoc } = await api.getTasksPaginated({
        pageSize: batchSize,
        startAfterDoc: cursor,
        ...filters,
      });

      allTasks.push(...tasks);

      if (!lastDoc || tasks.length === 0) {
        break;
      }

      cursor = lastDoc;
    }

    return allTasks;
  },

  /** Count tasks matching filters (for pagination totals). */
  getTasksCount: async (filters?: {
    assignedTo?: string;
    assignedBy?: string;
    status?: TaskStatus;
    statusIn?: TaskStatus[];
    recurring?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    verifierId?: string;
  }): Promise<number> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const constraints: any[] = [];
    if (filters?.assignedTo) constraints.push(where('assigned_to_id', '==', filters.assignedTo));
    if (filters?.assignedBy) constraints.push(where('assigned_by_id', '==', filters.assignedBy));
    if (filters?.verifierId) constraints.push(where('verifier_id', '==', filters.verifierId));
    if (filters?.status) constraints.push(where('status', '==', filters.status));
    if (filters?.statusIn && filters.statusIn.length > 0) constraints.push(where('status', 'in', filters.statusIn));
    if (filters?.recurring) constraints.push(where('recurring', '==', filters.recurring));
    if (filters?.dueDateFrom) constraints.push(where('due_date', '>=', filters.dueDateFrom));
    if (filters?.dueDateTo) constraints.push(where('due_date', '<=', filters.dueDateTo));
    const q = constraints.length > 0 ? query(tasksRef, ...constraints) : query(tasksRef);
    const countSnap = await getCountFromServer(q);
    return countSnap.data().count;
  },

  /** Incomplete tasks for current user (e.g. removal request dropdown). Limit 100. */
  getMyIncompleteTasks: async (userId: string, limitCount: number = 100): Promise<Task[]> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const q = query(
      tasksRef,
      where('assigned_to_id', '==', userId),
      where('status', 'in', ['pending', 'overdue', 'pending_verification', 'correction_required']),
      orderBy('updated_at', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToTask(d));
  },

  createTask: async (
    t: Omit<Task, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Task> => {
    const now = new Date().toISOString();
    const cleanData = Object.fromEntries(Object.entries(t).filter(([_, v]) => v !== undefined));
    const ref = await addDoc(collection(db, COLLECTIONS.TASKS), {
      ...cleanData,
      created_at: isoToTimestamp(now),
      updated_at: isoToTimestamp(now),
    });
    return { ...t, id: ref.id, created_at: now, updated_at: now };
  },

  cloneRecurringTask: async (original: Task, nextDueDate: string): Promise<Task> => {
    const {
      id,
      created_at,
      updated_at,
      completed_at,
      verified_at,
      verified_by,
      audit_status,
      audited_at,
      audited_by,
      attachment_url,
      attachment_text,
      status,
      due_date,
      is_holiday,
      ...baseFields
    } = original;

    return api.createTask({
      ...baseFields,
      due_date: nextDueDate,
      status: 'pending',
    } as Omit<Task, 'id' | 'created_at' | 'updated_at'>);
  },

  updateTask: async (id: string, updates: Partial<Task>): Promise<void> => {
    const toUpdate: Record<string, unknown> = {
      ...updates,
      updated_at: isoToTimestamp(new Date().toISOString()),
    };
    if (updates.completed_at) {
      toUpdate.completed_at = updates.completed_at;
      if (!updates.status) {
        toUpdate.status = 'completed';
      }
    }
    await updateDoc(doc(db, COLLECTIONS.TASKS, id), toUpdate);
  },

  deleteTask: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTIONS.TASKS, id));
  },

  setAuditStatus: async (
    id: string,
    status: AuditStatus,
    auditedBy: string
  ): Promise<void> => {
    await updateDoc(doc(db, COLLECTIONS.TASKS, id), {
      audit_status: status,
      audited_at: isoToTimestamp(new Date().toISOString()),
      audited_by: auditedBy,
      updated_at: isoToTimestamp(new Date().toISOString()),
    });
  },

  /** All tasks assigned to a user (for delete-member flow). */
  getTasksAssignedTo: async (userId: string): Promise<Task[]> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const q = query(
      tasksRef,
      where('assigned_to_id', '==', userId),
      orderBy('updated_at', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToTask(d));
  },

  /** Reassign all tasks from one user to another. */
  reassignTasksToUser: async (
    fromUserId: string,
    toUser: Pick<User, 'id' | 'name' | 'city'>
  ): Promise<void> => {
    const tasks = await api.getTasksAssignedTo(fromUserId);
    for (const t of tasks) {
      await api.updateTask(t.id, {
        assigned_to_id: toUser.id,
        assigned_to_name: toUser.name,
        assigned_to_city: toUser.city,
        assignee_deleted: false,
      });
    }
  },

  /** Mark all tasks assigned to user as assignee_deleted (after member delete). */
  markTasksAssigneeDeleted: async (userId: string): Promise<void> => {
    const tasks = await api.getTasksAssignedTo(userId);
    for (const t of tasks) {
      await api.updateTask(t.id, { assignee_deleted: true });
    }
  },

  // --- Holidays ---
  getHolidays: async (): Promise<Holiday[]> => {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.HOLIDAYS), orderBy('date', 'asc'))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: data.date,
        name: data.name,
        created_at: timestampToISO(data.created_at),
      };
    });
  },

  addHoliday: async (date: string, name: string): Promise<Holiday> => {
    const ref = await addDoc(collection(db, COLLECTIONS.HOLIDAYS), {
      date,
      name,
      created_at: isoToTimestamp(new Date().toISOString()),
    });
    return { id: ref.id, date, name, created_at: new Date().toISOString() };
  },

  deleteHoliday: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTIONS.HOLIDAYS, id));
  },

  // --- Absences ---
  getAbsences: async (): Promise<Absence[]> => {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.ABSENCES), orderBy('from_date', 'desc'))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        user_id: data.user_id,
        user_name: data.user_name,
        from_date: data.from_date,
        to_date: data.to_date,
        reason: data.reason,
        created_at: timestampToISO(data.created_at),
      };
    });
  },

  addAbsence: async (a: Omit<Absence, 'id' | 'created_at'>): Promise<Absence> => {
    const ref = await addDoc(collection(db, COLLECTIONS.ABSENCES), {
      ...a,
      created_at: isoToTimestamp(new Date().toISOString()),
    });
    return { ...a, id: ref.id, created_at: new Date().toISOString() };
  },

  // --- Removal Requests ---
  getRemovalRequests: async (): Promise<RemovalRequest[]> => {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.REMOVAL_REQUESTS),
        orderBy('created_at', 'desc')
      )
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        task_id: data.task_id,
        task_title: data.task_title,
        requested_by_id: data.requested_by_id,
        requested_by_name: data.requested_by_name,
        reason: data.reason,
        status: data.status || 'pending',
        created_at: timestampToISO(data.created_at),
        resolved_at: data.resolved_at ? timestampToISO(data.resolved_at) : undefined,
        resolved_by: data.resolved_by,
        rejection_reason: data.rejection_reason || undefined,
      };
    });
  },

  getRemovalRequestsPaginated: async (opts: {
    limitCount: number;
    startAfterDoc?: QueryDocumentSnapshot | null;
    requestedById?: string;
  }): Promise<{ requests: RemovalRequest[]; lastDoc: QueryDocumentSnapshot | null }> => {
    const { limitCount, startAfterDoc, requestedById } = opts;
    const ref = collection(db, COLLECTIONS.REMOVAL_REQUESTS);
    const base = requestedById
      ? query(ref, where('requested_by_id', '==', requestedById), orderBy('created_at', 'desc'), limit(limitCount))
      : query(ref, orderBy('created_at', 'desc'), limit(limitCount));
    const q = startAfterDoc ? query(base, startAfter(startAfterDoc)) : base;
    const snap = await getDocs(q);
    const requests = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        task_id: data.task_id,
        task_title: data.task_title,
        requested_by_id: data.requested_by_id,
        requested_by_name: data.requested_by_name,
        reason: data.reason,
        status: data.status || 'pending',
        created_at: timestampToISO(data.created_at),
        resolved_at: data.resolved_at ? timestampToISO(data.resolved_at) : undefined,
        resolved_by: data.resolved_by,
        rejection_reason: data.rejection_reason || undefined,
      };
    });
    const lastDoc = snap.docs.length === limitCount ? snap.docs[snap.docs.length - 1] : null;
    return { requests, lastDoc };
  },

  createRemovalRequest: async (
    r: Omit<RemovalRequest, 'id' | 'created_at' | 'status'>
  ): Promise<RemovalRequest> => {
    const ref = await addDoc(collection(db, COLLECTIONS.REMOVAL_REQUESTS), {
      ...r,
      status: 'pending',
      created_at: isoToTimestamp(new Date().toISOString()),
    });
    return {
      ...r,
      id: ref.id,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
  },

  resolveRemovalRequest: async (
    id: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    options?: { rejectionReason?: string }
  ): Promise<void> => {
    const payload: Record<string, unknown> = {
      status,
      resolved_at: isoToTimestamp(new Date().toISOString()),
      resolved_by: resolvedBy,
    };
    if (status === 'rejected') {
      payload.rejection_reason = (options?.rejectionReason ?? '').trim() || null;
    } else {
      payload.rejection_reason = null;
    }
    await updateDoc(doc(db, COLLECTIONS.REMOVAL_REQUESTS, id), payload);
  },

  // --- WhatsApp (11za) ---
  sendTaskAssignmentWhatsApp: async (
    phone: string,
    task: { title: string; due_date: string; description: string; link: string; assigned_by_name: string }
  ): Promise<void> => {
    const { whatsappService } = await import('./whatsapp');
    const templateName =
      import.meta.env.VITE_11ZA_TEMPLATE_TASK_ASSIGNMENT || 'task_assignment';

    await whatsappService.sendTaskAssignment({
      phone,
      templateName,
      taskName: task.title,
      dueDate: task.due_date,
      assignedBy: task.assigned_by_name,
      description: task.description,
      link: task.link,
    });
  },

  // --- Forgot Password (OTP) ---

  /** Find a user by phone number (normalized). Returns user doc id + data if found. */
  findUserByPhone: async (phone: string): Promise<{ id: string; name: string; phone: string } | null> => {
    const digits = phone.replace(/\D/g, '');
    // Try matching with +91 prefix, 91 prefix, and raw 10 digits
    const variants = new Set<string>();
    if (digits.length === 10) {
      variants.add('+91' + digits);
      variants.add('91' + digits);
      variants.add(digits);
    } else if (digits.length === 12 && digits.startsWith('91')) {
      variants.add('+' + digits);
      variants.add(digits);
      variants.add(digits.slice(2));
    } else {
      variants.add(phone.trim());
      variants.add(digits);
    }

    const usersRef = collection(db, COLLECTIONS.USERS);
    for (const variant of variants) {
      const q = query(usersRef, where('phone', '==', variant));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        return { id: d.id, name: data.name || '', phone: data.phone || '' };
      }
    }
    return null;
  },

  /** Generate and store a 6-digit OTP for password reset. Returns the OTP string. */
  createOtp: async (userId: string): Promise<string> => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    // Delete any previous OTPs for this user
    const otpRef = collection(db, COLLECTIONS.PASSWORD_RESET_OTPS);
    const oldSnap = await getDocs(query(otpRef, where('user_id', '==', userId)));
    for (const d of oldSnap.docs) {
      await deleteDoc(d.ref);
    }

    await addDoc(otpRef, {
      user_id: userId,
      otp,
      created_at: isoToTimestamp(now.toISOString()),
      expires_at: isoToTimestamp(expiresAt.toISOString()),
    });

    return otp;
  },

  /** Verify the OTP for a user. Returns true if valid, false otherwise. Deletes OTP on success. */
  verifyOtp: async (userId: string, otp: string): Promise<boolean> => {
    const otpRef = collection(db, COLLECTIONS.PASSWORD_RESET_OTPS);
    const q = query(otpRef, where('user_id', '==', userId), where('otp', '==', otp));
    const snap = await getDocs(q);

    if (snap.empty) return false;

    const d = snap.docs[0];
    const data = d.data();
    const expiresAt = data.expires_at?.toDate ? data.expires_at.toDate() : new Date(data.expires_at);

    if (new Date() > expiresAt) {
      // OTP expired — delete it
      await deleteDoc(d.ref);
      return false;
    }

    // Valid — delete OTP
    await deleteDoc(d.ref);
    return true;
  },

  /** Reset user password in Firestore. */
  resetPassword: async (userId: string, newPassword: string): Promise<void> => {
    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      password: newPassword,
      updated_at: isoToTimestamp(new Date().toISOString()),
    });
  },
};
