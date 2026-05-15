/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, UserRole, User, Holiday } from '../types';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Button } from '../components/ui/Button';
import { CsvExportButton } from '../components/ui/CsvExportButton';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';
import { exportRowsToCsv, type CsvColumn } from '../lib/csv';
import { isHoliday, compressImageForUpload, getPendingDays, formatDateDDMMYYYY, getDisplayRecurring, formatRecurringLabel } from '../lib/utils';
import {
  Paperclip,
  Check,
  X,
  HelpCircle,
  ExternalLink,
  FileText,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  ChevronDown,
  Table2,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;
type TaskSortKey = 'start_date' | 'due_date';

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

export const TaskTable: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [pageCursors, setPageCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [assignedByFilter, setAssignedByFilter] = useState('');

  const [debouncedAssignedTo, setDebouncedAssignedTo] = useState('');
  const [debouncedAssignedBy, setDebouncedAssignedBy] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedTo(assignedToFilter), 300);
    return () => clearTimeout(t);
  }, [assignedToFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAssignedBy(assignedByFilter), 300);
    return () => clearTimeout(t);
  }, [assignedByFilter]);
  const [statusFilter, setStatusFilter] = useState('');
  const [recurringFilter, setRecurringFilter] = useState('');
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [doerRemark, setDoerRemark] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentText, setAttachmentText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewAttachment, setViewAttachment] = useState<{ url?: string; text?: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: TaskSortKey; direction: 'asc' | 'desc' } | null>(null);
  const [taskSummary, setTaskSummary] = useState({ dueToday: 0, overdue: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [nameFilteredRows, setNameFilteredRows] = useState<Task[] | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [rejectTask, setRejectTask] = useState<Task | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [recurringTaskLookup, setRecurringTaskLookup] = useState<Map<string, Task>>(new Map());

  // Edit State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  // const [editPriority, setEditPriority] = useState<Task['priority']>('medium');
  const [editRecurring, setEditRecurring] = useState<Task['recurring']>('none');
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([]);
  const [editAttachmentRequired, setEditAttachmentRequired] = useState(false);
  const [editAttachmentType, setEditAttachmentType] = useState<'media' | 'text'>('media');
  const [editAttachmentDescription, setEditAttachmentDescription] = useState('');
  const [editVerificationRequired, setEditVerificationRequired] = useState(false);
  const [editVerifierId, setEditVerifierId] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAuditor = user?.role === UserRole.AUDITOR;
  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;
  const isDoer = user?.role === UserRole.DOER;
  const isVerifier = user?.role === UserRole.VERIFIER;
  const isMyTasksRoute = location.pathname === '/my-tasks';
  const isManagerMyTasksView = isManager && isMyTasksRoute;
  const isSelfTasksView = isDoer || (isManager && isMyTasksRoute);

  const isRecurringMasterTask = useCallback((task: Task) => {
    return task.is_recurring_master === true;
  }, []);

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

  const getTodayLocal = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

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

  const getActiveFilters = useCallback(() => {
    const filters: {
      assignedTo?: string;
      assignedBy?: string;
      status?: Task['status'];
      statusIn?: Task['status'][];
      recurring?: string;
      dueDateFrom?: string;
      dueDateTo?: string;
      verifierId?: string;
    } = {};
    const openStatuses: Task['status'][] = [
      'pending',
      'in_progress',
      'overdue',
      'cancelled',
      'pending_verification',
      'correction_required',
    ];

    if (isSelfTasksView) {
      filters.assignedTo = user?.id ?? '';
    }
    if (isAuditor) {
      filters.status = 'completed';
    }
    if (isVerifier) {
      filters.verifierId = user?.id ?? '';
      filters.status = 'pending_verification';
    }

    if (!isAuditor && !isVerifier) {
      if (!isSelfTasksView && statusFilter) {
        filters.status = statusFilter as Task['status'];
      } else if (isSelfTasksView && statusFilter) {
        filters.status = statusFilter as Task['status'];
      } else if (!isSelfTasksView && !statusFilter) {
        filters.statusIn = openStatuses;
      } else if (isSelfTasksView && !statusFilter) {
        filters.statusIn = openStatuses;
      }
    }

    const range = resolveDoerDateRange();
    if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;
    if (range.dueDateTo) filters.dueDateTo = range.dueDateTo;

    return filters;
  }, [user?.id, isSelfTasksView, isAuditor, isVerifier, recurringFilter, resolveDoerDateRange, statusFilter, dateFilter]);

  const getDoerBaseFilters = useCallback(() => {
    const filters: {
      status?: Task['status'];
      statusIn?: Task['status'][];
      dueDateFrom?: string;
      dueDateTo?: string;
    } = {};

    const openStatuses: Task['status'][] = [
      'pending',
      'in_progress',
      'overdue',
      'cancelled',
      'pending_verification',
      'correction_required',
    ];

    if (statusFilter) {
      filters.status = statusFilter as Task['status'];
    } else {
      filters.statusIn = openStatuses;
    }

    const range = resolveDoerDateRange();
    if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;
    if (range.dueDateTo) filters.dueDateTo = range.dueDateTo;

    return filters;
  }, [resolveDoerDateRange, statusFilter, dateFilter]);

  const sortRowsByConfig = useCallback(
    (rows: Task[]) => {
      if (!sortConfig) return rows;
      return [...rows].sort((a, b) => {
        const aValue = (a[sortConfig.key] || '') as string;
        const bValue = (b[sortConfig.key] || '') as string;

        if (aValue === bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;

        if (sortConfig.direction === 'asc') {
          return aValue < bValue ? -1 : 1;
        }
        return aValue > bValue ? -1 : 1;
      });
    },
    [sortConfig]
  );

  const getDoerVisibleRows = useCallback(async (): Promise<Task[]> => {
    if (!user?.id) return [];

    const baseFilters = getDoerBaseFilters();
    const assignedToRows = await api.getAllTasksByFilters({
      assignedTo: user.id,
      sortBy: sortConfig?.key,
      sortDirection: sortConfig?.direction,
      ...baseFilters,
    });
    const safeAssignedToRows = assignedToRows.filter((task) => !isRecurringMasterTask(task));

    // In owner/manager My Tasks, show only tasks assigned to the logged-in user.
    if (isManagerMyTasksView) {
      return sortRowsByConfig(safeAssignedToRows);
    }

    const assignedByRows = await api.getAllTasksByFilters({
      assignedBy: user.id,
      sortBy: sortConfig?.key,
      sortDirection: sortConfig?.direction,
      ...baseFilters,
    });
    const safeAssignedByRows = assignedByRows.filter((task) => !isRecurringMasterTask(task));

    const mergedById = new Map<string, Task>();
    [...safeAssignedToRows, ...safeAssignedByRows].forEach((task) => {
      mergedById.set(task.id, task);
    });

    return sortRowsByConfig(Array.from(mergedById.values()));
  }, [getDoerBaseFilters, isManagerMyTasksView, isRecurringMasterTask, sortConfig, sortRowsByConfig, user?.id]);

  const applyNameFilters = useCallback(
    (list: Task[]) => {
      const assignedToQuery = debouncedAssignedTo.toLowerCase().trim();
      const assignedByQuery = debouncedAssignedBy.toLowerCase().trim();

      return list.filter((task) => {
        const assignee = (task.assigned_to_name || '').toLowerCase();
        const assigner = (task.assigned_by_name || '').toLowerCase();
        if (assignedToQuery && !assignee.includes(assignedToQuery)) return false;
        if (assignedByQuery && !assigner.includes(assignedByQuery)) return false;
        return true;
      });
    },
    [debouncedAssignedBy, debouncedAssignedTo]
  );

  const filterByStartDate = useCallback(
    (list: Task[]) => {
      const today = getTodayLocal();
      return list.filter((task) => {
        const rawStartDate = (task.start_date || '').trim();
        if (!rawStartDate) return true;

        const normalizedStartDate = rawStartDate.slice(0, 10);
        return normalizedStartDate <= today;
      });
    },
    [getTodayLocal]
  );

  const hasNameFilter = debouncedAssignedTo.trim().length > 0 || debouncedAssignedBy.trim().length > 0;

  const formatDateValue = useCallback((value?: string, opts?: { includeTime?: boolean; emptyValue?: string }) => {
    const { includeTime = false, emptyValue = '' } = opts || {};
    return formatDateDDMMYYYY(value, { includeTime, emptyValue });
  }, []);

  const loadPage = useCallback(
    async (startAfterDoc: QueryDocumentSnapshot | null | undefined, pageNumber: number) => {
      try {
        const filters = getActiveFilters();
        const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
          pageSize: rowsPerPage,
          startAfterDoc: startAfterDoc ?? undefined,
          sortBy: sortConfig?.key,
          sortDirection: sortConfig?.direction,
          ...filters,
        });
        const startedRows = filterByStartDate(nextTasks);
        await hydrateRecurringLookup(startedRows);
        setTasks(startedRows);
        setLastDoc(nextLastDoc);
        setCurrentPage(pageNumber);
        setHasNextPage(nextLastDoc != null);
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setTasks([]);
        setLastDoc(null);
        setCurrentPage(pageNumber);
        setHasNextPage(false);
      } finally {
        setLoading(false);
      }
    },
    [filterByStartDate, getActiveFilters, hydrateRecurringLookup, rowsPerPage, sortConfig]
  );

  const setClientPageFromRows = useCallback(
    (rows: Task[], pageNumber: number) => {
      const clientTotalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
      const safePage = Math.min(Math.max(pageNumber, 1), clientTotalPages);
      const startIndex = (safePage - 1) * rowsPerPage;
      const pagedRows = rows.slice(startIndex, startIndex + rowsPerPage);

      setTasks(pagedRows);
      setCurrentPage(safePage);
      setLastDoc(null);
      setHasNextPage(safePage < clientTotalPages);
    },
    [rowsPerPage]
  );

  useEffect(() => {
    api.getHolidays().then(setHolidays).catch(console.error);
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setCurrentPage(1);
      setPageCursors([null]);
      const filters = getActiveFilters();

      if (isSelfTasksView) {
        setLoading(true);
        try {
          const doerRows = await getDoerVisibleRows();
          if (!isActive) return;

          const startedRows = filterByStartDate(doerRows);
          const lookup = await hydrateRecurringLookup(startedRows);
          const recurringRows = recurringFilter
            ? startedRows.filter((task) => getDisplayRecurring(task, lookup) === recurringFilter)
            : startedRows;
          const filteredRows = applyNameFilters(recurringRows);
          setNameFilteredRows(filteredRows);
          setTotalResults(filteredRows.length);
          setClientPageFromRows(filteredRows, 1);
        } catch (err) {
          if (!isActive) return;
          console.error('Failed to load tasks:', err);
          setTasks([]);
          setTotalResults(0);
          setLastDoc(null);
          setHasNextPage(false);
        } finally {
          if (isActive) setLoading(false);
        }
        return;
      }

      if (hasNameFilter || recurringFilter) {
        try {
          const allRows = await api.getAllTasksByFilters({
            sortBy: sortConfig?.key,
            sortDirection: sortConfig?.direction,
            ...filters,
          });
          if (!isActive) return;

          const startedRows = filterByStartDate(allRows);
          const lookup = await hydrateRecurringLookup(startedRows);
          const recurringRows = recurringFilter
            ? startedRows.filter((task) => getDisplayRecurring(task, lookup) === recurringFilter)
            : startedRows;
          const filteredRows = applyNameFilters(recurringRows);
          setNameFilteredRows(filteredRows);
          setTotalResults(filteredRows.length);
          setClientPageFromRows(filteredRows, 1);
          setLoading(false);
        } catch (err) {
          if (!isActive) return;
          console.error('Failed to load tasks:', err);
          setTasks([]);
          setTotalResults(0);
          setLastDoc(null);
          setHasNextPage(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        if (!isActive) return;
        setNameFilteredRows(null);
        const count = await api.getTasksCount(filters);
        if (!isActive) return;
        setTotalResults(count);
        await loadPage(undefined, 1);
      } catch (err) {
        if (!isActive) return;
        console.error('Failed to load tasks:', err);
        setTasks([]);
        setTotalResults(0);
        setLastDoc(null);
        setHasNextPage(false);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    load();

    return () => {
      isActive = false;
    };
  }, [
    recurringFilter,
    hasNameFilter,
    applyNameFilters,
    filterByStartDate,
    getActiveFilters,
    getDoerVisibleRows,
    isSelfTasksView,
    loadPage,
    refreshToken,
    setClientPageFromRows,
    sortConfig,
  ]);

  useEffect(() => {
    if (isSelfTasksView && !sortConfig) {
      setSortConfig({ key: 'due_date', direction: 'asc' });
    }
  }, [isSelfTasksView, sortConfig]);

  useEffect(() => {
    if (isAuditor || isVerifier) return;
    let isMounted = true;

    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        let summaryTasks: Task[] = [];

        if (isSelfTasksView) {
          summaryTasks = await getDoerVisibleRows();
        } else {
          const filters = getActiveFilters();
          const summaryResult = await api.getTasksPaginated({
            pageSize: 5000,
            ...filters,
          });
          summaryTasks = filterByStartDate(summaryResult.tasks);
        }

        const summaryRows = applyNameFilters(filterByStartDate(summaryTasks));

        const today = getTodayLocal();
        const dueToday = summaryRows.filter(
          (t) =>
            t.due_date === today &&
            t.status !== 'completed' &&
            t.status !== 'cancelled' &&
            t.status !== 'closed_permanently'
        ).length;
        const overdue = summaryRows.filter(
          (t) =>
            t.due_date < today &&
            t.status !== 'completed' &&
            t.status !== 'cancelled' &&
            t.status !== 'closed_permanently'
        ).length;

        if (isMounted) setTaskSummary({ dueToday, overdue });
      } catch (err) {
        console.error('Failed to load task summary:', err);
        if (isMounted) setTaskSummary({ dueToday: 0, overdue: 0 });
      } finally {
        if (isMounted) setSummaryLoading(false);
      }
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [applyNameFilters, filterByStartDate, getActiveFilters, getDoerVisibleRows, getTodayLocal, isAuditor, isSelfTasksView, isVerifier]);

  const filteredTasks = applyNameFilters(filterByStartDate(tasks));

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (!sortConfig) return 0;
    const aValue = (a[sortConfig.key] || '') as string;
    const bValue = (b[sortConfig.key] || '') as string;

    if (aValue === bValue) return 0;
    if (!aValue) return 1;
    if (!bValue) return -1;

    if (sortConfig.direction === 'asc') {
      return aValue < bValue ? -1 : 1;
    }
    return aValue > bValue ? -1 : 1;
  });

  const isClientMode = hasNameFilter || isSelfTasksView;
  const tableColumnCount = 12;

  const effectiveTotalResults = isClientMode
    ? (nameFilteredRows?.length ?? 0)
    : totalResults;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalResults / rowsPerPage));

  const toggleDateSort = (key: TaskSortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const renderSortIcon = (key: TaskSortKey) => {
    if (sortConfig?.key !== key) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={14} className="text-teal-600" />
    ) : (
      <ArrowDown size={14} className="text-teal-600" />
    );
  };

  const handleExportCsv = async () => {
    if (!isManager || isSelfTasksView || exportingCsv) return;

    setExportingCsv(true);
    try {
      const filters = getActiveFilters();
      const exportRows = await api.getAllTasksByFilters({
        sortBy: sortConfig?.key,
        sortDirection: sortConfig?.direction,
        ...filters,
      });
      const exportRowsByName = applyNameFilters(exportRows);
      const exportLookup = await hydrateRecurringLookup(exportRowsByName);
      const exportRecurringRows = recurringFilter
        ? exportRowsByName.filter((task) => getDisplayRecurring(task, exportLookup) === recurringFilter)
        : exportRowsByName;

      const columns: CsvColumn<Task>[] = [
        { header: 'Title', accessor: (t) => t.title },
        { header: 'Description', accessor: (t) => t.description || '' },
        { header: 'Assigned To', accessor: (t) => t.assigned_to_name || '' },
        { header: 'Assigned To City', accessor: (t) => t.assigned_to_city || '' },
        { header: 'Assigned By', accessor: (t) => t.assigned_by_name || '' },
        { header: 'Start Date', accessor: (t) => formatDateValue(t.start_date, { emptyValue: '###' }) },
        { header: 'Due Date', accessor: (t) => formatDateValue(t.due_date, { emptyValue: '###' }) },
        // { header: 'Priority', accessor: (t) => t.priority || '' },
        { header: 'Recurring', accessor: (t) => formatRecurringLabel(getDisplayRecurring(t, exportLookup), 'None') },
        { header: 'Status', accessor: (t) => t.status || '' },
        { header: 'Verification Required', accessor: (t) => (t.verification_required ? 'Yes' : 'No') },
        { header: 'Verifier Name', accessor: (t) => t.verifier_name || '' },
        { header: 'Attachment Required', accessor: (t) => (t.attachment_required ? 'Yes' : 'No') },
        { header: 'Attachment Type', accessor: (t) => t.attachment_type || '' },
        {
          header: 'Attachment Content',
          accessor: (t) => {
            if (t.attachment_text && t.attachment_url) {
              return `Text: ${t.attachment_text} | URL: ${t.attachment_url}`;
            }
            return t.attachment_text || t.attachment_url || '';
          },
        },
        { header: 'Completed At', accessor: (t) => formatDateValue(t.completed_at, { includeTime: false }) },
        { header: 'Created At', accessor: (t) => formatDateValue(t.created_at, { includeTime: false }) },
        { header: 'Updated At', accessor: (t) => formatDateValue(t.updated_at, { includeTime: false }) },
      ];

      const now = new Date();
      const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      exportRowsToCsv({
        rows: exportRecurringRows,
        columns,
        fileName: `Task-table-${datePart}.csv`,
      });
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setExportingCsv(false);
    }
  };

  // Get unique lists of users and recurring types from the currently loaded tasks
  // (Note: For a fully complete list across all pages, we would need to query the users collection,
  // but for a simple client-side filter on paginated data, we extract from loaded tasks, or we can fetch users.
  // We will assume basic extraction from loaded tasks for now to avoid additional reads if not necessary,
  // OR we can fetch users. Let's fetch all users to populate the dropdowns properly.)
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then(setAllUsers).catch(console.error);
  }, []);

  // Initialize Assigned To filter with logged-in doer's name when in self view
  useEffect(() => {
    if (isSelfTasksView && isDoer && user?.name && !assignedToFilter) {
      setAssignedToFilter(user.name);
    }
  }, [isSelfTasksView, isDoer, user?.name]);





  const handleCompleteClick = (t: Task) => {
    setCompleteTask(t);
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

  const handleComplete = async (
    t: Task,
    url?: string,
    text?: string,
    remark?: string,
    opts?: { closePermanently?: boolean }
  ) => {
    if (!user) return;
    if (isRecurringMasterTask(t)) return;
    const closePermanently = opts?.closePermanently === true;
    if (!closePermanently && !remark?.trim()) return;
    if (t.attachment_required && !closePermanently) {
      const isText = t.attachment_type === 'text';
      if (isText && !text?.trim()) return;
      if (!isText && !url?.trim()) return;
      if (!isText) {
        const candidateUrl = (url || '').trim();
        try {
          const parsed = new URL(candidateUrl);
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

      if (closePermanently && t.recurring !== 'none') {
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'closed_permanently',
        });
      } else if (t.verification_required) {
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'pending_verification',
        });
        if (t.verifier_id) {
          const verifier = allUsers.find((u) => u.id === t.verifier_id);
          if (verifier?.phone) {
            try {
              await api.sendVerificationWhatsApp(verifier.phone, {
                title: t.title,
                doerName: user.name,
                doerRemark: remark?.trim() || '',
              });
            } catch (waErr) {
              console.error('Verification WhatsApp failed:', waErr);
            }
          }
        }
      } else {
        const completedAt = new Date().toISOString();
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'completed',
          completed_at: completedAt,
        });
      }
      if (isSelfTasksView) {
        setRefreshToken((prev) => prev + 1);
      } else {
        setLoading(true);
        await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
      }
      setCompleteTask(null);
      setDoerRemark('');
      setAttachmentUrl('');
      setAttachmentText('');
      setAttachmentFile(null);
      setUploading(false);
      setUploadProgress(0);
      setUploadError(null);
    } catch (err) {
      console.error(err);
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

  const handleAudit = async (taskId: string, status: 'audited' | 'bogus' | 'unclear') => {
    if (!user) return;
    try {
      await api.setAuditStatus(taskId, status, user.name);
      setLoading(true);
      await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextPage = () => {
    if (isClientMode) {
      if (loading || currentPage >= totalPages || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, currentPage + 1);
      return;
    }
    if (!lastDoc || !hasNextPage || loading) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[currentPage] = lastDoc;
      return next;
    });
    setLoading(true);
    loadPage(lastDoc, currentPage + 1);
  };

  const handlePreviousPage = () => {
    if (isClientMode) {
      if (currentPage <= 1 || loading || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, currentPage - 1);
      return;
    }
    if (currentPage <= 1 || loading) return;
    const previousCursor = pageCursors[currentPage - 2] ?? null;
    setLoading(true);
    loadPage(previousCursor, currentPage - 1);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRowsPerPage = Number(e.target.value);
    setRowsPerPage(nextRowsPerPage);
    setCurrentPage(1);
  };

  const handleFirstPage = () => {
    if (isClientMode) {
      if (currentPage <= 1 || loading || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, 1);
      return;
    }
    if (currentPage <= 1 || loading) return;
    setLoading(true);
    loadPage(null, 1);
  };

  const handleLastPage = async () => {
    if (isClientMode) {
      if (loading || currentPage >= totalPages || !nameFilteredRows) return;
      setClientPageFromRows(nameFilteredRows, totalPages);
      return;
    }
    if (loading || currentPage >= totalPages) return;

    // Firestore cursor pagination cannot jump directly to unknown pages, so we walk forward.
    let cursor = lastDoc;
    let targetPage = currentPage;
    setLoading(true);

    try {
      while (targetPage < totalPages && cursor != null) {
        const filters = getActiveFilters();
        const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
          pageSize: rowsPerPage,
          startAfterDoc: cursor,
          sortBy: sortConfig?.key,
          sortDirection: sortConfig?.direction,
          ...filters,
        });
        targetPage += 1;
        setPageCursors((prev) => {
          const next = [...prev];
          next[targetPage - 1] = cursor;
          return next;
        });
        setTasks(nextTasks);
        setLastDoc(nextLastDoc);
        setCurrentPage(targetPage);
        setHasNextPage(nextLastDoc != null);
        cursor = nextLastDoc;
      }
    } catch (err) {
      console.error('Failed to load last page:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setEditError('');
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditStartDate(t.start_date || '');
    setEditAssignedToId(t.assigned_to_id);
    setEditDueDate(t.due_date);
    // setEditPriority(t.priority);
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
    if (!editingTask || !user) return;
    setEditError('');

    if (editStartDate && editDueDate < editStartDate) {
      setEditError('Due date cannot be before start date.');
      return;
    }

    const isAssigneeLimitedEdit = isDoer && editingTask.assigned_to_id === user.id;

    if (!isAssigneeLimitedEdit) {
      if (editVerificationRequired && !editVerifierId) {
        setEditError('Please select a verifier when verification is required.');
        return;
      }

      if (editVerificationRequired && editVerifierId === editAssignedToId) {
        setEditError('Verifier and assignee cannot be the same member.');
        return;
      }
    }

    setEditSubmitting(true);
    try {
      const immutableRecurring = editingTask.recurring;
      if (isAssigneeLimitedEdit) {
        const updates: Partial<Task> = {
          title: editTitle,
          description: editDesc,
          start_date: editStartDate || (null as any),
          due_date: editDueDate,
          // priority: editPriority,
          recurring: immutableRecurring,
          recurring_days: immutableRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
          attachment_required: editAttachmentRequired,
          attachment_type: editAttachmentRequired ? editAttachmentType : (null as any),
          attachment_description: editAttachmentRequired ? (editAttachmentDescription || '') : (null as any),
        };
        if (editingTask.due_date !== editDueDate) {
          updates.is_holiday = isHoliday(editDueDate, holidays);
        }
        await api.updateTask(editingTask.id, updates);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
          )
        );
        setNameFilteredRows((prev) =>
          prev
            ? prev.map((t) =>
              t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
            )
            : null
        );
        setEditingTask(null);
        setRefreshToken((x) => x + 1);
      } else {
        const assigneeUser = allUsers.find((u) => u.id === editAssignedToId);
        const verifierUser = allUsers.find((u) => u.id === editVerifierId);
        const updates: Partial<Task> = {
          title: editTitle,
          description: editDesc,
          start_date: editStartDate || (null as any),
          assigned_to_id: editAssignedToId,
          assigned_to_name: assigneeUser?.name || editingTask.assigned_to_name,
          assigned_to_city: assigneeUser?.city || editingTask.assigned_to_city,
          due_date: editDueDate,
          // priority: editPriority,
          recurring: immutableRecurring,
          recurring_days: immutableRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
          attachment_required: editAttachmentRequired,
          attachment_type: editAttachmentRequired ? editAttachmentType : (null as any),
          attachment_description: editAttachmentRequired ? (editAttachmentDescription || '') : (null as any),
          verification_required: editVerificationRequired,
          verifier_id: editVerificationRequired ? editVerifierId : (null as any),
          verifier_name: editVerificationRequired ? (verifierUser?.name || '') : (null as any),
          assignee_deleted: false,
        };

        if (editingTask.due_date !== editDueDate) {
          updates.is_holiday = isHoliday(editDueDate, holidays);
        }

        await api.updateTask(editingTask.id, updates);

        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
          )
        );
        setNameFilteredRows((prev) =>
          prev
            ? prev.map((t) =>
              t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
            )
            : null
        );
        setEditingTask(null);
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;
    setLoading(true);
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePermanentlyTask = async (task: Task) => {
    if (task.recurring === 'none') return;
    if (!window.confirm('Are you sure you want to permanently close this recurring task? It will never spawn again.')) return;
    setLoading(true);
    try {
      await api.updateTask(task.id, { status: 'closed_permanently' });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: 'closed_permanently', updated_at: new Date().toISOString() } : t
        )
      );
      setNameFilteredRows((prev) =>
        prev
          ? prev.map((t) =>
            t.id === task.id ? { ...t, status: 'closed_permanently', updated_at: new Date().toISOString() } : t
          )
          : null
      );
    } catch (err) {
      console.error('Failed to close recurring task permanently:', err);
    } finally {
      setLoading(false);
    }
  };

  const startRow = effectiveTotalResults === 0 || sortedTasks.length === 0
    ? 0
    : (currentPage - 1) * rowsPerPage + 1;
  const endRow = effectiveTotalResults === 0 || sortedTasks.length === 0
    ? 0
    : Math.min(startRow + Math.max(sortedTasks.length - 1, 0), effectiveTotalResults);

  const paginationControls = (
    <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
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
            <span className="font-semibold text-slate-800">{effectiveTotalResults}</span> results
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="First page"
              onClick={handleFirstPage}
              disabled={loading || currentPage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Previous page"
              onClick={handlePreviousPage}
              disabled={loading || currentPage <= 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              onClick={handleNextPage}
              disabled={loading || !hasNextPage || currentPage >= totalPages}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Last page"
              onClick={handleLastPage}
              disabled={loading || currentPage >= totalPages || !hasNextPage}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isAuditor) {
    return (
      <div>
        <p className="text-slate-500 text-sm mb-4">Tasks pending audit. Mark as audited, bogus, or unclear.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {paginationControls}
        </div>
        <div className="table-container task-table-container">
          <table>
            <thead>
              <tr>
                <th className="sticky-col-1 text-center">Task</th>
                <th className="sticky-col-2 text-center">Description</th>
                <th className="whitespace-nowrap text-center">Name</th>
                <th className="whitespace-nowrap text-center">City</th>
                <th className="whitespace-nowrap text-center">Attachment</th>
                <th className="whitespace-nowrap text-center">Status</th>
                <th className="whitespace-nowrap text-center">Pending Days</th>
                <th className="whitespace-nowrap text-center pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => (
                <tr
                  key={t.id}
                  className={`${(t.status === 'overdue' || t.due_date < getTodayLocal()) &&
                    t.status !== 'completed' &&
                    t.status !== 'cancelled' &&
                    t.status !== 'closed_permanently'
                    ? 'overdue-row'
                    : ''} ${highlightId === t.id ? 'ring-2 ring-amber-300' : ''}`}
                >
                  <td className="sticky-col-1">{t.title}</td>
                  <td className="sticky-col-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                    {t.description || '-'}
                  </td>
                  <td>
                    {t.assigned_to_name}
                    {t.assignee_deleted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                    )}
                  </td>
                  <td>{t.assigned_to_city || (t.assignee_deleted ? '—' : '-')}</td>
                  <td className="text-center">
                    {(t.attachment_url || t.attachment_text) ? (
                      <button
                        type="button"
                        onClick={() => setViewAttachment({ url: t.attachment_url, text: t.attachment_text })}
                        className="text-teal-600 hover:underline text-sm inline-flex items-center justify-center gap-1 font-medium"
                      >
                        {t.attachment_url ? <ExternalLink size={14} /> : <FileText size={14} />}
                        View
                      </button>
                    ) : t.attachment_required ? (
                      <span className="text-amber-600 flex items-center justify-center gap-1">
                        <Paperclip size={14} /> Required
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${t.audit_status === 'audited'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.audit_status === 'bogus'
                          ? 'bg-red-100 text-red-800'
                          : t.audit_status === 'unclear'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {t.audit_status || 'pending'}
                    </span>
                  </td>
                  <td className="text-center">{getPendingDays(t.due_date)}</td>
                  <td className="text-right pr-4">
                    {(!t.audit_status || t.audit_status === 'pending') && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => handleAudit(t.id, 'audited')}
                        >
                          <Check size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleAudit(t.id, 'bogus')}
                        >
                          <X size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAudit(t.id, 'unclear')}
                        >
                          <HelpCircle size={14} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{paginationControls}</div>
      </div>
    );
  }

  if (isVerifier) {
    return (
      <div>
        <p className="text-slate-500 text-sm mb-4">Tasks awaiting your verification. Approve or reject after review.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {paginationControls}
        </div>
        <div className="table-container task-table-container">
          <table>
            <thead>
              <tr>
                <th className="sticky-col-1 text-center">Title</th>
                <th className="sticky-col-2 text-center">Description</th>
                <th className="whitespace-nowrap text-center">Doer</th>
                <th className="whitespace-nowrap text-center">Due Date</th>
                {/* <th className="whitespace-nowrap text-center">Priority</th> */}
                <th className="whitespace-nowrap text-center">Status</th>
                <th className="whitespace-nowrap text-center">Attachment</th>
                <th className="whitespace-nowrap text-center pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => (
                <tr
                  key={t.id}
                  className={`${(t.status === 'overdue' || t.due_date < getTodayLocal()) &&
                    t.status !== 'completed' &&
                    t.status !== 'cancelled' &&
                    t.status !== 'closed_permanently'
                    ? 'overdue-row'
                    : ''} ${highlightId === t.id ? 'ring-2 ring-amber-300' : ''}`}
                >
                  <td className="sticky-col-1">
                    <span className="font-medium text-slate-800">{t.title}</span>
                  </td>
                  <td className="sticky-col-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                    {t.description || '-'}
                  </td>
                  <td>
                    {t.assigned_to_name}
                    {t.assignee_deleted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                    )}
                  </td>
                  <td className="text-center whitespace-nowrap text-slate-600 font-medium">{formatDateValue(t.due_date)}</td>
                  {/*
                  <td className="text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${t.priority === 'urgent'
                        ? 'bg-red-100 text-red-800'
                        : t.priority === 'high'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  */}
                  <td className="text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${t.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'overdue'
                          ? 'bg-red-100 text-red-800'
                          : t.status === 'correction_required'
                            ? 'bg-amber-100 text-amber-800'
                            : t.status === 'pending_verification'
                              ? 'bg-sky-100 text-sky-800'
                              : t.status === 'closed_permanently'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {t.status === 'pending_verification'
                        ? 'Pending Verification'
                        : t.status === 'correction_required'
                          ? 'Correction Required'
                          : t.status === 'closed_permanently'
                            ? 'Closed Permanently'
                            : t.status}
                    </span>
                  </td>
                  <td className="text-center">
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
                  <td className="py-3 px-2 text-right pr-4">
                    {t.status === 'pending_verification' ? (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center justify-end py-2 h-full">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={async () => {
                            if (!user) return;
                            try {
                              const completedAt = new Date().toISOString();
                              await api.updateTask(t.id, {
                                status: 'completed',
                                completed_at: completedAt,
                                verified_by: user.name,
                                verified_at: completedAt,
                              });
                              setLoading(true);
                              await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setRejectTask(t);
                            setRejectComment('');
                          }}
                          className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-center">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{paginationControls}</div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-slate-500 text-sm mb-4">
        {isMyTasksRoute
          ? 'View and manage only your own tasks.'
          : isManager
            ? 'Manage and track all tasks across the team.'
            : 'View and manage your assigned tasks.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due Today</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {summaryLoading ? '...' : taskSummary.dueToday}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Overdue (Till Today)</p>
          <p className="mt-1 text-2xl font-bold text-red-700">
            {summaryLoading ? '...' : taskSummary.overdue}
          </p>
        </div>
      </div>

      <div className="relative z-40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
        {isSelfTasksView ? (
          <div className="flex flex-wrap items-center gap-3">
            <SearchableUserSelect
              users={allUsers}
              nameValue={assignedToFilter}
              onNameChange={setAssignedToFilter}
              placeholder="Search Doer Name"
            />

            <SearchableUserSelect
              users={allUsers}
              nameValue={assignedByFilter}
              onNameChange={setAssignedByFilter}
              placeholder="Search Assigned By"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="closed_permanently">Closed Permanently</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="correction_required">Correction Required</option>
            </select>

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
            <SearchableUserSelect
              users={allUsers}
              nameValue={assignedToFilter}
              onNameChange={setAssignedToFilter}
              placeholder="Search Doer Name"
            />

            <SearchableUserSelect
              users={allUsers}
              nameValue={assignedByFilter}
              onNameChange={setAssignedByFilter}
              placeholder="Search Assigned By"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="closed_permanently">Closed Permanently</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="correction_required">Correction Required</option>
            </select>

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
        )}
        {isManager && !isSelfTasksView && (
          <CsvExportButton
            onClick={handleExportCsv}
            loading={exportingCsv}
            className="w-full sm:w-auto text-sm px-3 py-2 h-9 flex items-center justify-center gap-2"
          />
        )}
      </div>
      <div className="mb-6">{paginationControls}</div>
      <div className="table-container task-table-container">
        <table>
          <thead>
            <tr>
              <th className="sticky-col-1 text-center">Title</th>
              <th className="sticky-col-2 text-center">Description</th>
              <th className="whitespace-nowrap text-center">Assigned To</th>
              <th className="whitespace-nowrap text-center">Assigned By</th>
              <th className="whitespace-nowrap text-center">
                <button
                  type="button"
                  onClick={() => toggleDateSort('start_date')}
                  className="inline-flex items-center justify-center gap-1 hover:text-teal-700"
                >
                  Start Date
                  {renderSortIcon('start_date')}
                </button>
              </th>
              <th className="whitespace-nowrap text-center">
                <button
                  type="button"
                  onClick={() => toggleDateSort('due_date')}
                  className="inline-flex items-center justify-center gap-1 hover:text-teal-700"
                >
                  Due Date
                  {renderSortIcon('due_date')}
                </button>
              </th>
              {/* <th className="whitespace-nowrap text-center">Priority</th> */}
              <th className="whitespace-nowrap text-center">Recurring</th>
              <th className="whitespace-nowrap text-center">Status</th>
              <th className="whitespace-nowrap text-center">Doer's Remark</th>
              <th className="whitespace-nowrap text-center">Verifier</th>
              <th className="whitespace-nowrap text-center">Attachment</th>
              <th className="whitespace-nowrap text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={tableColumnCount} className="py-12 text-center text-slate-500">
                  <div className="flex justify-center mb-4">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-teal-600 animate-spin"></div>
                  </div>
                  Loading tasks...
                </td>
              </tr>
            ) : sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={tableColumnCount} className="py-16">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <Table2 className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-base font-medium text-slate-600">No tasks found.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedTasks.map((t) => {
                const onHoliday = isHoliday(t.due_date, holidays);
                const today = getTodayLocal();
                const isOverdue =
                  (t.status === 'overdue' || t.due_date < today) &&
                  t.status !== 'completed' &&
                  t.status !== 'cancelled' &&
                  t.status !== 'closed_permanently';
                return (
                  <tr
                    key={t.id}
                    className={`${isOverdue ? 'overdue-row' : ''} ${!isOverdue && onHoliday ? 'holiday-row' : ''} ${highlightId === t.id ? 'ring-2 ring-amber-300' : ''}`}
                  >
                    <td className="sticky-col-1">
                      <span className="font-medium text-slate-800">{t.title}</span>
                      {onHoliday && (
                        <span className="ml-2 text-xs text-orange-600">(Holiday)</span>
                      )}
                      {t.assignee_deleted && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                      )}
                    </td>
                    <td className="sticky-col-2 whitespace-pre-wrap wrap-anywhere text-sm text-slate-700">
                      {t.description || '-'}
                    </td>
                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.assigned_to_name}
                        {t.assignee_deleted && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.assigned_by_name}
                      </span>
                    </td>
                    <td className="text-center whitespace-nowrap text-slate-600">
                      {t.start_date ? formatDateValue(t.start_date) : '-'}
                    </td>
                    <td className="text-center whitespace-nowrap text-slate-600 font-medium">
                      {formatDateValue(t.due_date)}
                    </td>
                    {/*
                    <td className="text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${t.priority === 'urgent'
                          ? 'bg-red-100 text-red-800'
                          : t.priority === 'high'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    */}
                    <td className="text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 capitalize whitespace-nowrap">
                        {formatRecurringLabel(getDisplayRecurring(t, taskById), 'None')}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1 max-w-[14rem] mx-auto">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${t.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'overdue'
                              ? 'bg-red-100 text-red-800'
                              : t.status === 'correction_required'
                                ? 'bg-amber-100 text-amber-800'
                                : t.status === 'pending_verification'
                                  ? 'bg-sky-100 text-sky-800'
                                  : t.status === 'closed_permanently'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                          {t.status === 'pending_verification'
                            ? 'Pending Verification'
                            : t.status === 'correction_required'
                              ? 'Correction Required'
                              : t.status === 'closed_permanently'
                                ? 'Closed Permanently'
                                : t.status}
                        </span>
                        {t.status === 'correction_required' && t.verification_rejection_comment && (
                          <p className="text-xs text-amber-900 text-left w-full break-words" title={t.verification_rejection_comment}>
                            <span className="font-medium">Verifier: </span>
                            {t.verification_rejection_comment}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-center whitespace-pre-wrap wrap-anywhere text-sm text-slate-700">
                      {t.doer_remark || '-'}
                    </td>
                    <td>
                      <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">
                        {t.verifier_name || t.verified_by || (t.verification_required ? 'Required' : '-')}
                      </span>
                    </td>
                    <td className="text-center">
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
                    <td className="py-3 px-2 text-right pr-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center justify-end py-2 h-full">
                        {(() => {
                          const showComplete =
                            t.assigned_to_id === user?.id &&
                            !isRecurringMasterTask(t) &&
                            t.status !== 'completed' &&
                            t.status !== 'pending_verification';
                          const isAssigner = t.assigned_by_id === user?.id;
                          const isManagerOrOwner = isOwner || isManager;
                          const assignerUser = allUsers.find(u => u.id === t.assigned_by_id);
                          const isAssignedByDoer = assignerUser?.role === UserRole.DOER;

                          const canEditTask =
                            isAssigner ||
                            (isManagerOrOwner && !isAssignedByDoer);

                          const canDeleteTask =
                            isAssigner ||
                            (!isSelfTasksView && isManagerOrOwner) ||
                            (isManagerOrOwner && (t.status === 'pending_verification' || t.status === 'correction_required'));

                          const canClosePermanently =
                            t.recurring !== 'none' &&
                            t.status !== 'closed_permanently' &&
                            (isAssigner || (isManagerOrOwner && !isAssignedByDoer));

                          const hasAnyAction = showComplete || canEditTask || canDeleteTask || canClosePermanently;
                          return (
                            <>
                              {showComplete && (
                                <Button size="sm" variant="success" onClick={() => handleCompleteClick(t)} className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap">
                                  Complete
                                </Button>
                              )}
                              {canClosePermanently && (
                                <Button size="sm" variant="danger" onClick={() => handleClosePermanentlyTask(t)} className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap">
                                  Close Permanently
                                </Button>
                              )}
                              {canEditTask && (
                                <Button size="sm" variant="secondary" onClick={() => openEditModal(t)} className="!px-2" title="Edit Task">
                                  <Pencil size={15} />
                                </Button>
                              )}
                              {canDeleteTask && (
                                <Button size="sm" variant="danger" onClick={() => handleDeleteTask(t.id)} className="!px-2" title="Delete Task">
                                  <Trash2 size={15} />
                                </Button>
                              )}
                              {!hasAnyAction && <span className="text-slate-400 text-center">-</span>}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">{paginationControls}</div>

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
            {getDisplayRecurring(completeTask, taskById) !== 'none' && (
              <p className="text-xs text-slate-600 mb-4">
                This task belongs to a recurring stream. New task instances are created by the scheduler.
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
            {completeTask.attachment_required && (completeTask.attachment_type === 'text' ? (
              <textarea
                value={attachmentText}
                onChange={(e) => setAttachmentText(e.target.value)}
                placeholder="Enter your text here (required)..."
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
                required
              />
            ) : (
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
                      {uploading && `Uploading(${Math.round(uploadProgress)}%) — `}
                      {!uploading && attachmentUrl && 'Done — '}
                      {attachmentFile.name}
                    </p>
                  )}
                  {uploadError && (
                    <p className="text-xs text-red-600 mt-1">{uploadError}</p>
                  )}
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
            ))}
            <div className="flex flex-wrap gap-2 justify-end">
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
              <pre className="flex-1 overflow-auto text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[100px]">
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

      {rejectTask && user && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="card p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2 text-slate-800">Reject verification</h3>
            <p className="text-sm text-slate-600 mb-3">
              Add a comment for <strong>{rejectTask.assigned_to_name}</strong>. They will see it on the task.
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
              placeholder="Reason for rejection (required)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectTask(null);
                  setRejectComment('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!rejectComment.trim()}
                onClick={async () => {
                  if (!rejectComment.trim()) return;
                  try {
                    await api.updateTask(rejectTask.id, {
                      status: 'correction_required',
                      verification_rejection_comment: rejectComment.trim(),
                      verification_rejected_at: new Date().toISOString(),
                      verification_rejected_by: user.name,
                    } as Partial<Task>);
                    setRejectTask(null);
                    setRejectComment('');
                    setLoading(true);
                    await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Submit rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card p-6 max-w-lg w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-slate-800">Edit Task</h3>
            {editError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {editError}
              </div>
            )}
            {(() => {
              const isAssigneeLimitedEdit = isDoer && editingTask.assigned_to_id === user?.id;
              return (
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
                      {isAssigneeLimitedEdit ? (
                        <p className="h-10 flex items-center text-sm text-slate-800 border border-slate-200 rounded-lg px-3 bg-slate-50">
                          {editingTask.assigned_to_name}
                        </p>
                      ) : (
                        <SearchableUserSelect
                          users={allUsers}
                          value={editAssignedToId}
                          onChange={setEditAssignedToId}
                          placeholder="Search member..."
                          required
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        min={editStartDate || undefined}
                        required
                        className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
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
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="flex items-center gap-2 pt-7">
                      <input
                        id="edit-attachment-required"
                        type="checkbox"
                        checked={editAttachmentRequired}
                        onChange={(e) => setEditAttachmentRequired(e.target.checked)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <label htmlFor="edit-attachment-required" className="text-sm font-medium text-slate-700">
                        Attachment required
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
                          placeholder="Describe required attachment"
                          className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  )}

                  {!isAssigneeLimitedEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          id="edit-verification-required"
                          type="checkbox"
                          checked={editVerificationRequired}
                          onChange={(e) => {
                            setEditVerificationRequired(e.target.checked);
                            if (!e.target.checked) {
                              setEditVerifierId('');
                            }
                          }}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <label htmlFor="edit-verification-required" className="text-sm font-medium text-slate-700">
                          Verification Required
                        </label>
                      </div>
                      {editVerificationRequired && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Verifier</label>
                          <SearchableUserSelect
                            users={allUsers}
                            value={editVerifierId}
                            onChange={setEditVerifierId}
                            placeholder="Search verifier..."
                            required={editVerificationRequired}
                            excludeUserId={editAssignedToId}
                          />
                        </div>
                      )}
                    </div>
                  )}
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
                  <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={() => setEditingTask(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={editSubmitting}>
                      Save Changes
                    </Button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
