import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Task, UserRole, User } from '../types';
import {
  Repeat,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  Trash2,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../lib/utils';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
] as const;

export const RecurringTasks: React.FC = () => {
  const { user } = useAuth();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTask, setViewTask] = useState<Task | null>(null);
  const [viewAttachment, setViewAttachment] = useState<{ url?: string; text?: string } | null>(null);

  // Edit recurring master task
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<Task['priority']>('medium');
  const [editRecurring, setEditRecurring] = useState<Task['recurring']>('none');
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([]);
  const [editAttachmentRequired, setEditAttachmentRequired] = useState(false);
  const [editAttachmentType, setEditAttachmentType] = useState<'media' | 'text'>('media');
  const [editAttachmentDescription, setEditAttachmentDescription] = useState('');
  const [editVerificationRequired, setEditVerificationRequired] = useState(false);
  const [editVerifierId, setEditVerifierId] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);

  // Filter state – mirrors TaskTable
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [assignedByFilter, setAssignedByFilter] = useState('');
  const [assignedToDropdownOpen, setAssignedToDropdownOpen] = useState(false);
  const [assignedByDropdownOpen, setAssignedByDropdownOpen] = useState(false);
  const [debouncedAssignedTo, setDebouncedAssignedTo] = useState('');
  const [debouncedAssignedBy, setDebouncedAssignedBy] = useState('');
  const [recurringFilter, setRecurringFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const assignedToDropdownRef = useRef<HTMLDivElement>(null);
  const assignedByDropdownRef = useRef<HTMLDivElement>(null);

  // Users for name dropdowns
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then(setAllUsers).catch(console.error);
  }, []);

  // Debounced name filters
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedTo(assignedToFilter), 300);
    return () => clearTimeout(t);
  }, [assignedToFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedBy(assignedByFilter), 300);
    return () => clearTimeout(t);
  }, [assignedByFilter]);

  // Close dropdowns on outside click
  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (assignedToDropdownRef.current && !assignedToDropdownRef.current.contains(e.target as Node)) {
        setAssignedToDropdownOpen(false);
      }
      if (assignedByDropdownRef.current && !assignedByDropdownRef.current.contains(e.target as Node)) {
        setAssignedByDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const nameOptions = Array.from(
    new Set(allUsers.map((u) => (u.name || '').trim()).filter((name) => name.length > 0))
  ).sort((a, b) => a.localeCompare(b));

  const assignedToNameOptions = nameOptions.filter((name) =>
    name.toLowerCase().includes(assignedToFilter.toLowerCase().trim())
  );
  const assignedByNameOptions = nameOptions.filter((name) =>
    name.toLowerCase().includes(assignedByFilter.toLowerCase().trim())
  );

  const isDoer = user?.role === UserRole.DOER;
  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  const resolveDoerDateRange = useCallback((): { dueDateFrom?: string; dueDateTo?: string } => {
    if (dateFilter === 'all_time') return {};

    const today = new Date();
    const getFormattedDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (dateFilter === 'today') {
      const day = getFormattedDate(today);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const day = getFormattedDate(y);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'last_7_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      return { dueDateFrom: getFormattedDate(past), dueDateTo: getFormattedDate(today) };
    }
    if (dateFilter === 'last_30_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      return { dueDateFrom: getFormattedDate(past), dueDateTo: getFormattedDate(today) };
    }
    if (dateFilter === 'custom') {
      return { dueDateFrom: customStart || undefined, dueDateTo: customEnd || undefined };
    }
    return {};
  }, [dateFilter, customStart, customEnd]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const filters: {
        statusIn?: Task['status'][];
        assignedTo?: string;
        recurring?: string;
        dueDateFrom?: string;
        dueDateTo?: string;
      } = {};

      // Base: only active statuses
      filters.statusIn = ['pending', 'in_progress', 'overdue', 'pending_verification', 'correction_required'];

      if (isDoer && user?.id) {
        filters.assignedTo = user.id;
      }

      if (recurringFilter) {
        filters.recurring = recurringFilter;
      }

      // Date range (doer-specific or general)
      if (isDoer) {
        const range = resolveDoerDateRange();
        if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;
        if (range.dueDateTo) filters.dueDateTo = range.dueDateTo;
      }

      const allActive = await api.getAllTasksByFilters({ ...filters, includeRecurringMasters: true });

      // Client-side filtering: show only recurring masters (legacy-safe fallback).
      let filtered = allActive.filter(
        (t) => t.recurring !== 'none' && (t.is_recurring_master === true || !t.parent_task_id)
      );

      // Apply recurringFilter client-side if API doesn't handle it perfectly
      if (recurringFilter && recurringFilter !== 'none') {
        filtered = filtered.filter((t) => t.recurring === recurringFilter);
      }

      // Show one row per logical recurring stream (latest due_date),
      // so spawned/legacy duplicates don't appear multiple times.
      const streamMap = new Map<string, Task>();
      for (const task of filtered) {
        const key = JSON.stringify({
          title: task.title || '',
          assigned_to_id: task.assigned_to_id || '',
          assigned_by_id: task.assigned_by_id || '',
          recurring: task.recurring || '',
          recurring_days: Array.isArray(task.recurring_days)
            ? [...task.recurring_days].sort((a, b) => a - b)
            : [],
          verifier_id: task.verifier_id || '',
        });
        const prev = streamMap.get(key);
        if (!prev || String(task.due_date || '') > String(prev.due_date || '')) {
          streamMap.set(key, task);
        }
      }

      setAllTasks(Array.from(streamMap.values()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isDoer, recurringFilter, resolveDoerDateRange]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Client-side name filtering
  const filteredTasks = useMemo(() => {
    const assignedToQuery = debouncedAssignedTo.toLowerCase().trim();
    const assignedByQuery = debouncedAssignedBy.toLowerCase().trim();

    if (!assignedToQuery && !assignedByQuery) return allTasks;

    return allTasks.filter((t) => {
      if (assignedToQuery && !(t.assigned_to_name || '').toLowerCase().includes(assignedToQuery)) return false;
      if (assignedByQuery && !(t.assigned_by_name || '').toLowerCase().includes(assignedByQuery)) return false;
      return true;
    });
  }, [allTasks, debouncedAssignedTo, debouncedAssignedBy]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedAssignedTo, debouncedAssignedBy, recurringFilter, allTasks]);

  // Pagination calculations
  const totalResults = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const pageTasks = filteredTasks.slice(startIndex, startIndex + rowsPerPage);
  const startRow = totalResults === 0 ? 0 : startIndex + 1;
  const endRow = totalResults === 0 ? 0 : Math.min(startIndex + rowsPerPage, totalResults);

  const handleClosePermanently = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to permanently close this recurring task? It will never spawn again.')) return;
    try {
      await api.updateTask(taskId, { status: 'closed_permanently' });
      await loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecurringStream = async (taskId: string) => {
    if (!window.confirm('Delete this recurring stream? This will remove the parent and all linked child tasks.')) return;
    try {
      const all = await api.getAllTasksByFilters({ includeRecurringMasters: true, batchSize: 5000 });
      const idsToDelete = all
        .filter((t) => t.id === taskId || t.parent_task_id === taskId)
        .map((t) => t.id);

      for (const id of idsToDelete) {
        await api.deleteTask(id);
      }

      await loadTasks();
    } catch (err) {
      console.error('Failed to delete recurring stream:', err);
    }
  };

  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setEditError('');
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditAssignedToId(t.assigned_to_id);
    setEditDueDate(t.due_date);
    setEditPriority(t.priority);
    setEditRecurring(t.recurring);
    setEditRecurringDays(t.recurring_days || []);
    setEditAttachmentRequired(Boolean(t.attachment_required));
    setEditAttachmentType((t.attachment_type as 'media' | 'text') || 'media');
    setEditAttachmentDescription(t.attachment_description || '');
    setEditVerificationRequired(Boolean(t.verification_required));
    setEditVerifierId(t.verifier_id || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setEditError('');

    if (editVerificationRequired && !editVerifierId) {
      setEditError('Please select a verifier when verification is required.');
      return;
    }

    if (editVerificationRequired && editVerifierId === editAssignedToId) {
      setEditError('Verifier and assignee cannot be the same member.');
      return;
    }

    setEditSubmitting(true);
    try {
      const assigneeUser = allUsers.find((u) => u.id === editAssignedToId);
      const verifierUser = allUsers.find((u) => u.id === editVerifierId);

      const updates: Partial<Task> = {
        title: editTitle,
        description: editDesc,
        assigned_to_id: editAssignedToId,
        assigned_to_name: assigneeUser?.name || editingTask.assigned_to_name,
        assigned_to_city: assigneeUser?.city || editingTask.assigned_to_city,
        due_date: editDueDate,
        priority: editPriority,
        recurring: editRecurring,
        recurring_days: editRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : undefined,
        attachment_required: editAttachmentRequired,
        attachment_type: editAttachmentRequired ? editAttachmentType : undefined,
        attachment_description: editAttachmentRequired ? (editAttachmentDescription || '') : undefined,
        verification_required: editVerificationRequired,
        verifier_id: editVerificationRequired ? editVerifierId : undefined,
        verifier_name: editVerificationRequired ? (verifierUser?.name || '') : undefined,
      };

      await api.updateTask(editingTask.id, updates);
      setEditingTask(null);
      await loadTasks();
    } catch (err) {
      console.error('Failed to update recurring task:', err);
      setEditError('Failed to update recurring task.');
    } finally {
      setEditSubmitting(false);
    }
  };

  if (!user) return null;

  const paginationControls = (
    <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {ROWS_PER_PAGE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="text-sm text-slate-500 whitespace-nowrap">
            Showing <span className="font-semibold text-slate-800">{startRow}-{endRow}</span> of{' '}
            <span className="font-semibold text-slate-800">{totalResults}</span> results
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="First page"
              onClick={() => setCurrentPage(1)}
              disabled={loading || safePage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={loading || safePage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={loading || safePage >= totalPages}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Last page"
              onClick={() => setCurrentPage(totalPages)}
              disabled={loading || safePage >= totalPages}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Description ── */}
      <p className="text-slate-500 text-sm">All active recurring tasks and their schedules.</p>

      {/* ── Filter Bar ── */}
      <div className="relative z-40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {isDoer ? (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all_time">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-slate-500 text-sm">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div ref={assignedToDropdownRef} className="relative z-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={assignedToFilter}
                onChange={(e) => {
                  setAssignedToFilter(e.target.value);
                  setAssignedToDropdownOpen(true);
                }}
                onFocus={() => setAssignedToDropdownOpen(true)}
                placeholder="Search Doer Name"
                className="h-9 rounded-lg border border-slate-300 pl-9 pr-9 text-sm z-50"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              {assignedToDropdownOpen && (
                <ul className="absolute z-60 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {assignedToNameOptions.length === 0 ? (
                    <li className="py-2 px-3 text-sm text-slate-500">No member found</li>
                  ) : (
                    assignedToNameOptions.map((name) => (
                      <li
                        key={`to-${name}`}
                        onClick={() => {
                          setAssignedToFilter(name);
                          setAssignedToDropdownOpen(false);
                        }}
                        className="cursor-pointer py-2.5 px-3 text-sm hover:bg-slate-50 text-slate-700"
                      >
                        {name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div ref={assignedByDropdownRef} className="relative z-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={assignedByFilter}
                onChange={(e) => {
                  setAssignedByFilter(e.target.value);
                  setAssignedByDropdownOpen(true);
                }}
                onFocus={() => setAssignedByDropdownOpen(true)}
                placeholder="Search Assigned By Name"
                className="h-9 rounded-lg border border-slate-300 pl-9 pr-9 text-sm"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              {assignedByDropdownOpen && (
                <ul className="absolute z-60 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {assignedByNameOptions.length === 0 ? (
                    <li className="py-2 px-3 text-sm text-slate-500">No member found</li>
                  ) : (
                    assignedByNameOptions.map((name) => (
                      <li
                        key={`by-${name}`}
                        onClick={() => {
                          setAssignedByFilter(name);
                          setAssignedByDropdownOpen(false);
                        }}
                        className="cursor-pointer py-2.5 px-3 text-sm hover:bg-slate-50 text-slate-700"
                      >
                        {name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <select
              value={recurringFilter}
              onChange={(e) => setRecurringFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">All Recurring Types</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half Yearly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      <div>{paginationControls}</div>

      {/* ── Table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto min-h-[50vh]">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600 w-72">Title</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-96">Description</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-32">Frequency</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-24 text-center">Priority</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-56">Assigned To</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-56">Assigned By</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-52">Verifier</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-32 text-center">Attachment</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-32 text-center">Next Due</th>
                <th className="px-4 py-3 font-medium text-slate-600 w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    Loading recurring tasks...
                  </td>
                </tr>
              ) : pageTasks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <Repeat className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-base font-medium text-slate-600">No active recurring tasks found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-normal wrap-break-word align-top leading-6">
                      {t.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-normal wrap-break-word align-top leading-6">
                      {t.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize whitespace-normal wrap-break-word align-top leading-6">
                      {t.recurring.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize">
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-normal wrap-break-word align-top leading-6">{t.assigned_to_name}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-normal wrap-break-word align-top leading-6">{t.assigned_by_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-normal wrap-break-word align-top leading-6">
                      {t.verification_required ? (t.verifier_name || 'Required') : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-center">
                      {(t.attachment_url || t.attachment_text) ? (
                        <button
                          type="button"
                          onClick={() => setViewAttachment({ url: t.attachment_url, text: t.attachment_text })}
                          className="text-teal-600 hover:underline text-sm inline-flex items-center justify-center gap-1 font-medium whitespace-nowrap"
                        >
                          {t.attachment_url ? <ExternalLink size={14} /> : <FileText size={14} />}
                          View
                        </button>
                      ) : t.attachment_required ? (
                        <span className="text-amber-600 text-xs font-medium whitespace-nowrap">Required</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-center whitespace-nowrap">
                      {formatDateDDMMYYYY(t.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(isManager || t.assigned_by_id === user?.id) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditModal(t)}
                            title="Edit Recurring Task"
                          >
                            <Pencil size={14} />
                          </Button>
                        )}
                        {(isManager || t.assigned_by_id === user?.id) && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleClosePermanently(t.id)}
                          >
                            Close Permanently
                          </Button>
                        )}
                        {(isManager || t.assigned_by_id === user?.id) && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteRecurringStream(t.id)}
                            title="Delete Recurring Stream"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                        {!isManager && t.assigned_by_id !== user?.id && (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom Pagination ── */}
      <div>{paginationControls}</div>

      {viewTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewTask(null)}>
          <div className="card p-6 max-w-2xl w-full max-h-[85vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Recurring Task Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Title</p>
                <p className="text-slate-800 font-medium mt-1 whitespace-pre-wrap">{viewTask.title}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Description</p>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewTask.description || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Frequency</p>
                <p className="text-slate-700 mt-1 capitalize">{viewTask.recurring.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Next Due Date</p>
                <p className="text-slate-700 mt-1">{formatDateDDMMYYYY(viewTask.due_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Assigned To</p>
                <p className="text-slate-700 mt-1">{viewTask.assigned_to_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Assigned By</p>
                <p className="text-slate-700 mt-1">{viewTask.assigned_by_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Priority</p>
                <p className="text-slate-700 mt-1 capitalize">{viewTask.priority}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Verifier</p>
                <p className="text-slate-700 mt-1">{viewTask.verifier_name || (viewTask.verification_required ? 'Required' : '-')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Attachment Required</p>
                <p className="text-slate-700 mt-1">{viewTask.attachment_required ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Attachment Type</p>
                <p className="text-slate-700 mt-1 capitalize">{viewTask.attachment_type || '-'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Attachment Note</p>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewTask.attachment_description || '-'}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setViewTask(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {viewAttachment && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewAttachment(null)}>
          <div className="card p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Attachment</h3>
            {viewAttachment.url && (
              <div className="mb-4">
                <a
                  href={viewAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-teal-600 hover:underline font-medium"
                >
                  <ExternalLink size={18} />
                  Open media / link
                </a>
              </div>
            )}
            {viewAttachment.text != null && viewAttachment.text !== '' && (
              <pre className="flex-1 overflow-auto text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-4 bg-slate-50">
                {viewAttachment.text}
              </pre>
            )}
            {viewAttachment.url && !viewAttachment.text && <p className="text-sm text-slate-500">Media or link attached. Use the link above to view.</p>}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setViewAttachment(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 max-w-lg w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Edit Recurring Task</h3>
            {editError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {editError}
              </div>
            )}
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
                  <select
                    value={editAssignedToId}
                    onChange={(e) => setEditAssignedToId(e.target.value)}
                    required
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select a member</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Next Due Date</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    required
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Task['priority'])}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recurring</label>
                  <select
                    value={editRecurring}
                    onChange={(e) => setEditRecurring(e.target.value as Task['recurring'])}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half Yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {editRecurring === 'daily' && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-600 mb-2 font-medium">Recurring Days</p>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => {
                          setEditRecurringDays((prev) =>
                            prev.includes(d.value)
                              ? prev.filter((x) => x !== d.value)
                              : [...prev, d.value].sort((a, b) => a - b)
                          );
                        }}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${editRecurringDays.includes(d.value)
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <input
                    id="rec-edit-attach-required"
                    type="checkbox"
                    checked={editAttachmentRequired}
                    onChange={(e) => setEditAttachmentRequired(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="rec-edit-attach-required" className="text-sm font-medium text-slate-700">
                    Attachment Required
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="rec-edit-verification-required"
                    type="checkbox"
                    checked={editVerificationRequired}
                    onChange={(e) => {
                      setEditVerificationRequired(e.target.checked);
                      if (!e.target.checked) setEditVerifierId('');
                    }}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="rec-edit-verification-required" className="text-sm font-medium text-slate-700">
                    Verification Required
                  </label>
                </div>
              </div>

              {editAttachmentRequired && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Type</label>
                    <select
                      value={editAttachmentType}
                      onChange={(e) => setEditAttachmentType(e.target.value as 'media' | 'text')}
                      className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="media">Media</option>
                      <option value="text">Text</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Note</label>
                    <input
                      type="text"
                      value={editAttachmentDescription}
                      onChange={(e) => setEditAttachmentDescription(e.target.value)}
                      className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              {editVerificationRequired && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Verifier</label>
                  <select
                    value={editVerifierId}
                    onChange={(e) => setEditVerifierId(e.target.value)}
                    required={editVerificationRequired}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select verifier</option>
                    {allUsers
                      .filter((u) => u.id !== editAssignedToId)
                      .map((u) => (
                        <option key={`rec-verifier-${u.id}`} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setEditingTask(null)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={editSubmitting}>Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
