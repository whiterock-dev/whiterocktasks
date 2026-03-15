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
    recurring?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    verifierId?: string;
  }): Promise<{ tasks: Task[]; lastDoc: QueryDocumentSnapshot | null }> => {
    const {
      pageSize,
      startAfterDoc,
      assignedTo,
      assignedBy,
      status,
      recurring,
      dueDateFrom,
      dueDateTo,
      verifierId,
    } = opts;
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const hasDueDateRange = Boolean(dueDateFrom || dueDateTo);
    const constraints: unknown[] = [
      hasDueDateRange ? orderBy('due_date', 'desc') : orderBy('updated_at', 'desc'),
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
      const isIndexError = firestoreError?.code === 'failed-precondition';
      if (!isIndexError) throw error;

      // Fallback when composite index is missing: query without orderBy/startAfter,
      // then sort client-side and return all matches in a single batch.
      const fallbackConstraints: unknown[] = [];
      if (assignedTo) {
        fallbackConstraints.push(where('assigned_to_id', '==', assignedTo));
      }
      if (assignedBy) {
        fallbackConstraints.push(where('assigned_by_id', '==', assignedBy));
      }
      if (verifierId) {
        fallbackConstraints.push(where('verifier_id', '==', verifierId));
      }
      if (status) {
        fallbackConstraints.push(where('status', '==', status));
      }
      if (recurring) {
        fallbackConstraints.push(where('recurring', '==', recurring));
      }
      if (dueDateFrom) {
        fallbackConstraints.push(where('due_date', '>=', dueDateFrom));
      }
      if (dueDateTo) {
        fallbackConstraints.push(where('due_date', '<=', dueDateTo));
      }

      const fallbackQuery =
        fallbackConstraints.length > 0
          ? query(tasksRef, ...fallbackConstraints)
          : query(tasksRef);
      const fallbackSnap = await getDocs(fallbackQuery);
      const tasks = fallbackSnap.docs
        .map((d) => docToTask(d))
        .sort((a, b) => {
          if (hasDueDateRange) {
            if (a.due_date === b.due_date) return a.updated_at < b.updated_at ? 1 : -1;
            return a.due_date < b.due_date ? 1 : -1;
          }
          return a.updated_at < b.updated_at ? 1 : -1;
        });

      return { tasks, lastDoc: null };
    }
  },

  /** Count tasks matching filters (for pagination totals). */
  getTasksCount: async (filters?: {
    assignedTo?: string;
    assignedBy?: string;
    status?: TaskStatus;
    recurring?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    verifierId?: string;
  }): Promise<number> => {
    const tasksRef = collection(db, COLLECTIONS.TASKS);
    const constraints: unknown[] = [];
    if (filters?.assignedTo) constraints.push(where('assigned_to_id', '==', filters.assignedTo));
    if (filters?.assignedBy) constraints.push(where('assigned_by_id', '==', filters.assignedBy));
    if (filters?.verifierId) constraints.push(where('verifier_id', '==', filters.verifierId));
    if (filters?.status) constraints.push(where('status', '==', filters.status));
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

  updateTask: async (id: string, updates: Partial<Task>): Promise<void> => {
    const toUpdate: Record<string, unknown> = {
      ...updates,
      updated_at: isoToTimestamp(new Date().toISOString()),
    };
    if (updates.completed_at) {
      toUpdate.completed_at = updates.completed_at;
      toUpdate.status = 'completed';
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
      };
    });
  },

  getRemovalRequestsPaginated: async (opts: {
    limitCount: number;
    startAfterDoc?: QueryDocumentSnapshot | null;
  }): Promise<{ requests: RemovalRequest[]; lastDoc: QueryDocumentSnapshot | null }> => {
    const { limitCount, startAfterDoc } = opts;
    const ref = collection(db, COLLECTIONS.REMOVAL_REQUESTS);
    const base = query(ref, orderBy('created_at', 'desc'), limit(limitCount));
    const q = startAfterDoc ? query(ref, orderBy('created_at', 'desc'), limit(limitCount), startAfter(startAfterDoc)) : base;
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
    resolvedBy: string
  ): Promise<void> => {
    await updateDoc(doc(db, COLLECTIONS.REMOVAL_REQUESTS, id), {
      status,
      resolved_at: isoToTimestamp(new Date().toISOString()),
      resolved_by: resolvedBy,
    });
  },

  // --- WhatsApp (11za) ---
  sendTaskAssignmentWhatsApp: async (
    phone: string,
    task: { title: string; due_date: string; priority: TaskPriority; description: string; link: string; assigned_by_name: string }
  ): Promise<void> => {
    const { whatsappService } = await import('./whatsapp');
    const templateName =
      import.meta.env.VITE_11ZA_TEMPLATE_TASK_ASSIGNMENT || 'task_assignment';

    await whatsappService.sendTaskAssignment({
      phone,
      templateName,
      taskName: task.title,
      dueDate: task.due_date,
      priority: task.priority,
      assignedBy: task.assigned_by_name,
      description: task.description,
      link: task.link,
    });
  },
};
