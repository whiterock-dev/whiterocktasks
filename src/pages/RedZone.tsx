/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { storage } from '../lib/firebase';
import { compressImageForUpload, isHoliday, formatDateDDMMYYYY, getDisplayRecurring, formatRecurringLabel } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';
import { Holiday, Task, User, UserRole } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
  Pencil,
  User as UserIcon,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertTriangle,
} from 'lucide-react';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

export const RedZone: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchParams] = useSearchParams();
  const [assignedToFilter, setAssignedToFilter] = useState(searchParams.get('assignedTo') || '');
  const [assignedByFilter, setAssignedByFilter] = useState('');
  const [assignedToDropdownOpen, setAssignedToDropdownOpen] = useState(false);
  const [assignedByDropdownOpen, setAssignedByDropdownOpen] = useState(false);
  const [debouncedAssignedTo, setDebouncedAssignedTo] = useState('');
  const [debouncedAssignedBy, setDebouncedAssignedBy] = useState('');
  const [recurringFilter, setRecurringFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [doerRemark, setDoerRemark] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentText, setAttachmentText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  // const [editPriority, setEditPriority] = useState<Task['priority']>('medium');
  const [editRecurring, setEditRecurring] = useState<Task['recurring']>('none');
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [recurringTaskLookup, setRecurringTaskLookup] = useState<Map<string, Task>>(new Map());

  const hydrateRecurringLookup = useCallback(async (rows: Task[]) => {
    const lookup = new Map<string, Task>();
    rows.forEach((task) => lookup.set(task.id, task));

    const parentIds = Array.from(
      new Set(
        rows
          .map((task) => task.parent_task_id)
          .filter((parentId): parentId is string => Boolean(parentId))
      )
    );

    const missingParentIds = parentIds.filter((parentId) => !lookup.has(parentId));
    if (missingParentIds.length > 0) {
      const parents = await Promise.all(missingParentIds.map((parentId) => api.getTaskById(parentId)));
      parents.forEach((parent) => {
        if (parent) lookup.set(parent.id, parent);
      });
    }

    setRecurringTaskLookup(lookup);
    return lookup;
  }, []);

  const taskById = useMemo(() => {
    const merged = new Map<string, Task>();
    recurringTaskLookup.forEach((task, id) => merged.set(id, task));
    tasks.forEach((task) => merged.set(task.id, task));
    return merged;
  }, [recurringTaskLookup, tasks]);
  const assignedToDropdownRef = useRef<HTMLDivElement>(null);
  const assignedByDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedTo(assignedToFilter), 300);
    return () => clearTimeout(t);
  }, [assignedToFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedBy(assignedByFilter), 300);
    return () => clearTimeout(t);
  }, [assignedByFilter]);

  useEffect(() => {
    api.getUsers().then(setAllUsers).catch(console.error);
    api.getHolidays().then(setHolidays).catch(console.error);
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const assignedToId =
      user?.role === UserRole.DOER ? user?.id : undefined;
    const overdue = await api.getOverdueTasks({
      assignedToId,
      limitCount: 500,
    });
    await hydrateRecurringLookup(overdue);
    setTasks(overdue);
    setLoading(false);
  }, [hydrateRecurringLookup, user?.id, user?.role]);

  useEffect(() => {
    loadTasks().catch(console.error);
  }, [loadTasks]);

  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER;
  const isDoer = user?.role === UserRole.DOER;

  const nameOptions = Array.from(
    new Set(allUsers.map((u) => (u.name || '').trim()).filter((name) => name.length > 0))
  ).sort((a, b) => a.localeCompare(b));

  const assignedToNameOptions = nameOptions.filter((name) =>
    name.toLowerCase().includes(assignedToFilter.toLowerCase().trim())
  );

  const assignedByNameOptions = nameOptions.filter((name) =>
    name.toLowerCase().includes(assignedByFilter.toLowerCase().trim())
  );

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

  const resolveDateRange = useCallback((): { dueDateFrom?: string; dueDateTo?: string } => {
    if (dateFilter === 'all_time') return {};

    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (dateFilter === 'today') {
      const day = formatDate(today);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const day = formatDate(yesterday);
      return { dueDateFrom: day, dueDateTo: day };
    }
    if (dateFilter === 'last_7_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      return { dueDateFrom: formatDate(past), dueDateTo: formatDate(today) };
    }
    if (dateFilter === 'last_30_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      return { dueDateFrom: formatDate(past), dueDateTo: formatDate(today) };
    }
    if (dateFilter === 'custom') {
      return { dueDateFrom: customStart || undefined, dueDateTo: customEnd || undefined };
    }

    return {};
  }, [customEnd, customStart, dateFilter]);

  const filtered = useMemo(() => {
    const visibleTasks = isOwner || isManager ? tasks : isDoer ? tasks.filter((t) => t.assigned_to_id === user?.id) : [];
    const range = resolveDateRange();
    const dateFilteredTasks = visibleTasks.filter((task) => {
      if (range.dueDateFrom && task.due_date < range.dueDateFrom) return false;
      if (range.dueDateTo && task.due_date > range.dueDateTo) return false;
      return true;
    });

    if (isDoer) {
      return dateFilteredTasks;
    }

    return dateFilteredTasks.filter((task) => {
      const assignee = (task.assigned_to_name || '').toLowerCase();
      const assigner = (task.assigned_by_name || '').toLowerCase();
      const assignedToQuery = debouncedAssignedTo.toLowerCase().trim();
      const assignedByQuery = debouncedAssignedBy.toLowerCase().trim();

      if (assignedToQuery && !assignee.includes(assignedToQuery)) return false;
      if (assignedByQuery && !assigner.includes(assignedByQuery)) return false;
      if (recurringFilter && getDisplayRecurring(task, taskById) !== recurringFilter) return false;
      if (cityFilter && (task.assigned_to_city || '').toLowerCase() !== cityFilter.toLowerCase()) return false;
      return true;
    });
  }, [cityFilter, debouncedAssignedBy, debouncedAssignedTo, isDoer, isManager, isOwner, recurringFilter, resolveDateRange, taskById, tasks, user?.id]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [cityFilter, debouncedAssignedTo, debouncedAssignedBy, recurringFilter, dateFilter, customStart, customEnd, tasks]);

  // Pagination
  const totalResults = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const pageItems = filtered.slice(startIndex, startIndex + rowsPerPage);
  const startRow = totalResults === 0 ? 0 : startIndex + 1;
  const endRow = totalResults === 0 ? 0 : Math.min(startIndex + rowsPerPage, totalResults);

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
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="text-sm text-slate-500 whitespace-nowrap">
            Showing <span className="font-semibold text-slate-800">{startRow}-{endRow}</span> of{' '}
            <span className="font-semibold text-slate-800">{totalResults}</span> results
          </p>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="First page" onClick={() => setCurrentPage(1)} disabled={loading || safePage <= 1} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronsLeft size={16} /></button>
            <button type="button" aria-label="Previous page" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={loading || safePage <= 1} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Next page" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={loading || safePage >= totalPages} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            <button type="button" aria-label="Last page" onClick={() => setCurrentPage(totalPages)} disabled={loading || safePage >= totalPages} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronsRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );

  const handleComplete = useCallback(
    async (task: Task, url?: string, text?: string, remark?: string, opts?: { closePermanently?: boolean }) => {
      if (!user) return;
      const closePermanently = opts?.closePermanently === true;
      if (!closePermanently && !remark?.trim()) return;
      if (task.attachment_required && !closePermanently) {
        const isText = task.attachment_type === 'text';
        if (isText && !text?.trim()) return;
        if (!isText && !url?.trim()) return;
        if (!isText) {
          try {
            const parsed = new URL((url || '').trim());
            const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
            if (!isHttp) {
              setUploadError('Please enter a valid media link starting with http:// or https://');
              return;
            }
          } catch {
            setUploadError('Please enter a valid media link starting with http:// or https://');
            return;
          }
        }
      }

      try {
        const baseUpdates: Partial<Task> = {
          ...(url && { attachment_url: url }),
          ...(text && { attachment_text: text }),
          ...(!closePermanently && { doer_remark: remark?.trim() }),
        };

        if (closePermanently && task.recurring !== 'none') {
          await api.updateTask(task.id, {
            ...baseUpdates,
            status: 'closed_permanently',
          });
        } else if (task.verification_required) {
          await api.updateTask(task.id, {
            ...baseUpdates,
            status: 'pending_verification',
          });
        } else {
          const completedAt = new Date().toISOString();
          await api.updateTask(task.id, {
            ...baseUpdates,
            status: 'completed',
            completed_at: completedAt,
          });
        }

        setCompleteTask(null);
        setDoerRemark('');
        setAttachmentUrl('');
        setAttachmentText('');
        setAttachmentFile(null);
        setUploading(false);
        setUploadProgress(0);
        setUploadError(null);
        await loadTasks();
      } catch (err) {
        console.error('Failed to complete overdue task:', err);
      }
    },
    [loadTasks, user]
  );

  const handleCompleteClick = (task: Task) => {
    setCompleteTask(task);
    setDoerRemark('');
    setAttachmentUrl('');
    setAttachmentText('');
    setAttachmentFile(null);
    setUploading(false);
    setUploadProgress(0);
    setUploadError(null);
  };

  const handleMediaFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !completeTask) return;

    setAttachmentUrl('');
    setUploadError(null);
    setAttachmentFile(file);
    setUploading(true);
    setUploadProgress(0);

    const path = `task-attachments/${completeTask.id}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);

    try {
      const toUpload = await compressImageForUpload(file);
      const uploadTask = uploadBytesResumable(storageRef, toUpload);

      uploadTask.on('state_changed', (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      });

      await uploadTask;
      const url = await getDownloadURL(storageRef);
      setAttachmentUrl(url);
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
      setAttachmentFile(null);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const closeCompleteModal = () => {
    setCompleteTask(null);
    setDoerRemark('');
    setAttachmentUrl('');
    setAttachmentText('');
    setAttachmentFile(null);
    setUploading(false);
    setUploadProgress(0);
    setUploadError(null);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditAssignedToId(task.assigned_to_id);
    setEditDueDate(task.due_date);
    // setEditPriority(task.priority);
    setEditRecurring(task.recurring);
    setEditRecurringDays(task.recurring_days || []);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !user) return;

    setEditSubmitting(true);
    try {
      const immutableRecurring = editingTask.recurring;
      const assigneeUser = allUsers.find((member) => member.id === editAssignedToId);
      const updates: Partial<Task> = {
        title: editTitle,
        description: editDesc,
        assigned_to_id: editAssignedToId,
        assigned_to_name: assigneeUser?.name || editingTask.assigned_to_name,
        assigned_to_city: assigneeUser?.city || editingTask.assigned_to_city,
        due_date: editDueDate,
        recurring: immutableRecurring,
        recurring_days: immutableRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
        assignee_deleted: false,
      };

      if (editingTask.due_date !== editDueDate) {
        updates.is_holiday = isHoliday(editDueDate, holidays);
      }

      await api.updateTask(editingTask.id, updates);
      setEditingTask(null);
      await loadTasks();
    } catch (err) {
      console.error('Failed to update overdue task:', err);
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <p className="text-red-800/80 text-sm mb-4">Tasks that are past their due date and not yet completed.</p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
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

            <div ref={assignedToDropdownRef} className="relative">
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
                className="h-9 rounded-lg border border-slate-300 pl-9 pr-9 text-sm"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              {assignedToDropdownOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
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

            <div ref={assignedByDropdownRef} className="relative">
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
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
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
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half Yearly</option>
              <option value="yearly">Yearly</option>
            </select>

            {(() => {
              const cities = Array.from(
                new Set(
                  allUsers
                    .map((u) => (u.city || '').trim())
                    .filter((c) => c.length > 0)
                )
              ).sort((a, b) => a.localeCompare(b));
              return cities.length > 0 ? (
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="">All Cities</option>
                  {cities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              ) : null;
            })()}
          </div>
        )}
      </div>
      {paginationControls}
      {pageItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm mt-4 p-16">
          <div className="flex flex-col items-center justify-center text-slate-500">
            <AlertTriangle className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-base font-medium text-slate-600">No overdue tasks.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-red-200 overflow-hidden bg-white shadow-sm mt-4">
          <h2 className="px-5 py-4 text-lg font-semibold text-white bg-red-600 border-b border-red-700">
            Overdue Follow-up ({filtered.length})
          </h2>
          <div className="divide-y divide-red-100">
            {pageItems.map((t) => {
              const daysOverdue = Math.floor(
                (new Date().getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)
              );
              const canEdit = isOwner || isManager || t.assigned_by_id === user?.id;
              const canComplete = t.assigned_to_id === user?.id && t.status !== 'completed' && t.status !== 'pending_verification';
              return (
                <div
                  key={t.id}
                  className="flex items-start gap-4 p-4 hover:bg-red-50/50 transition-colors"
                >
                  <Link to={`/tasks?highlight=${t.id}`} className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                      <UserIcon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                      {t.description ? (
                        <p className="mt-1 text-sm text-slate-600 line-clamp-2">{t.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        {!isDoer ? (
                          <span>
                            <span className="font-medium text-slate-700">Doer:</span> {t.assigned_to_name}
                          </span>
                        ) : null}
                        <span>
                          <span className="font-medium text-slate-700">Due:</span>{' '}
                          {formatDateDDMMYYYY(t.due_date)}
                        </span>
                        <span className="text-red-700 font-semibold">{daysOverdue} day(s) overdue</span>
                        <span>
                          <span className="font-medium text-slate-700">Assigned by:</span> {t.assigned_by_name}
                        </span>
                        <span>
                          <span className="font-medium text-slate-700">Recurring:</span>{' '}
                          {formatRecurringLabel(getDisplayRecurring(t, taskById), 'Non-recurring')}
                        </span>
                        <span>
                          <span className="font-medium text-slate-700">Status:</span> {t.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    {/*
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-800 shrink-0 capitalize">
                      {t.priority}
                    </span>
                    */}
                    {canComplete && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleCompleteClick(t)}
                        className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                        title="Complete Task"
                      >
                        Complete
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditModal(t)}
                        className="px-2"
                        title="Edit Task"
                      >
                        <Pencil size={15} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-4">{paginationControls}</div>

      {completeTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              {completeTask.attachment_required
                ? completeTask.attachment_type === 'text'
                  ? 'Text required to mark complete'
                  : 'Upload media required to mark complete'
                : 'Mark task complete'}
            </h3>
            {completeTask.attachment_required && (
              <p className="text-sm text-slate-600 mb-4">
                {completeTask.attachment_description ||
                  (completeTask.attachment_type === 'text'
                    ? 'You must enter text below to complete this task.'
                    : 'Upload a photo/video or paste a link to your media.')}
              </p>
            )}
            {formatRecurringLabel(getDisplayRecurring(completeTask, taskById), 'Non-recurring') !== 'Non-recurring' && (
              <p className="text-xs text-slate-600 mb-4">
                {(isDoer && user?.id !== completeTask.assigned_by_id)
                  ? 'This task belongs to a recurring stream. Completing it will automatically create the next occurrence.'
                  : <>This task belongs to a recurring stream. Use <strong>Complete</strong> to mark it done and create the next occurrence, or <strong>Close Permanently</strong> to stop it from recurring.</>}
              </p>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Doer's Remark <span className="text-red-600">*</span>
              </label>
              <textarea
                value={doerRemark}
                onChange={(e) => setDoerRemark(e.target.value)}
                placeholder="Add a completion remark (required)..."
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            {completeTask.attachment_required && completeTask.attachment_type === 'text' ? (
              <textarea
                value={attachmentText}
                onChange={(e) => setAttachmentText(e.target.value)}
                placeholder="Enter your text here (required)..."
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
                required
              />
            ) : completeTask.attachment_required ? (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Upload photo or video
                  </label>
                  <input
                    key={completeTask.id}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleMediaFileSelect}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                  />
                  {attachmentFile && (
                    <p className="text-xs text-slate-500 mt-1">
                      {uploading && `Uploading... ${Math.round(uploadProgress)}% — `}
                      {!uploading && attachmentUrl && 'Done — '}
                      {attachmentFile.name}
                    </p>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Or paste media link
                  </label>
                  <input
                    type="url"
                    value={attachmentUrl}
                    onChange={(e) => {
                      setAttachmentUrl(e.target.value);
                      setAttachmentFile(null);
                      setUploadError(null);
                    }}
                    placeholder="e.g. Google Drive, cloud link for photo/video"
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  You must either upload a file or provide a link to mark this task complete.
                </p>
                {attachmentUrl.trim().length > 0 && (() => {
                  try {
                    const parsed = new URL(attachmentUrl.trim());
                    return !(parsed.protocol === 'http:' || parsed.protocol === 'https:');
                  } catch {
                    return true;
                  }
                })() && (
                    <p className="text-xs text-red-600 mt-1">Enter a valid URL (for example: https://...)</p>
                  )}
              </div>
            ) : null}
            <div className="flex gap-2 justify-end">
              {completeTask.recurring !== 'none' && (!isDoer || user?.id === completeTask.assigned_by_id) && (
                <Button
                  variant="danger"
                  onClick={() =>
                    handleComplete(
                      completeTask,
                      completeTask.attachment_type === 'text' ? undefined : attachmentUrl,
                      completeTask.attachment_type === 'text' ? attachmentText : undefined,
                      undefined,
                      { closePermanently: true }
                    )
                  }
                >
                  Close Permanently
                </Button>
              )}
              <Button variant="secondary" onClick={closeCompleteModal}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleComplete(
                    completeTask,
                    completeTask.attachment_type === 'text' ? undefined : attachmentUrl,
                    completeTask.attachment_type === 'text' ? attachmentText : undefined,
                    doerRemark
                  )
                }
                disabled={
                  !doerRemark.trim() ||
                  (completeTask.attachment_required
                    ? (completeTask.attachment_type === 'text'
                      ? !attachmentText.trim()
                      : !attachmentUrl.trim())
                    : false)
                }
              >
                Complete
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 max-w-lg w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Edit Task</h3>
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
                  <SearchableUserSelect
                    users={allUsers}
                    value={editAssignedToId}
                    onChange={setEditAssignedToId}
                    placeholder="Search member..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
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
                {/*
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
                    */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recurring</label>
                  <select
                    value={editRecurring}
                    disabled
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half Yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Recurring type cannot be changed after task creation.</p>
                </div>
              </div>
              {editRecurring === 'daily' && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-600 mb-2 font-medium">Recurring Days</p>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          setEditRecurringDays((prev) =>
                            prev.includes(day.value)
                              ? prev.filter((value) => value !== day.value)
                              : [...prev, day.value].sort((a, b) => a - b)
                          );
                        }}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${editRecurringDays.includes(day.value)
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setEditingTask(null)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={editSubmitting}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
