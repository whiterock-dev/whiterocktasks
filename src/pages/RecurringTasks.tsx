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
} from 'lucide-react';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

export const RecurringTasks: React.FC = () => {
  const { user } = useAuth();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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

      const allActive = await api.getAllTasksByFilters(filters);

      // Client-side filtering: recurring != 'none'
      let filtered = allActive.filter((t) => t.recurring !== 'none');

      // Apply recurringFilter client-side if API doesn't handle it perfectly
      if (recurringFilter && recurringFilter !== 'none') {
        filtered = filtered.filter((t) => t.recurring === recurringFilter);
      }

      setAllTasks(filtered);
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
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Task</th>
                <th className="px-4 py-3 font-medium text-slate-600">Frequency</th>
                {!isDoer && <th className="px-4 py-3 font-medium text-slate-600">Assigned To</th>}
                <th className="px-4 py-3 font-medium text-slate-600">Assigned By</th>
                <th className="px-4 py-3 font-medium text-slate-600">Next Due</th>
                {isManager && <th className="px-4 py-3 font-medium text-slate-600 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 6 : isDoer ? 4 : 5} className="p-8 text-center text-slate-500">
                    Loading recurring tasks...
                  </td>
                </tr>
              ) : pageTasks.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 6 : isDoer ? 4 : 5} className="p-8">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <Repeat className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-base font-medium text-slate-600">No active recurring tasks found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">{t.title}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {t.recurring.replace('_', ' ')}
                    </td>
                    {!isDoer && <td className="px-4 py-3 text-slate-600">{t.assigned_to_name}</td>}
                    <td className="px-4 py-3 text-slate-600">{t.assigned_by_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(t.due_date).toLocaleDateString('en-GB')}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleClosePermanently(t.id)}
                        >
                          Close Permanently
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom Pagination ── */}
      <div>{paginationControls}</div>
    </div>
  );
};
