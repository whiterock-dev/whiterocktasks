/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ExternalLink, FileText, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, User, UserRole } from '../types';
import { formatDateDDMMYYYY, getDisplayRecurring, formatRecurringLabel } from '../lib/utils';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

export const CompletedTasks: React.FC = () => {
    const { user } = useAuth();
    const isDoer = user?.role === UserRole.DOER;
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
    const [dateFilter, setDateFilter] = useState('all_time');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [assignedToFilter, setAssignedToFilter] = useState('');
    const [assignedByFilter, setAssignedByFilter] = useState('');
    const [recurringFilter, setRecurringFilter] = useState('');
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [recurringTaskLookup, setRecurringTaskLookup] = useState<Map<string, Task>>(new Map());
    const taskById = useMemo(() => {
        const merged = new Map<string, Task>();
        recurringTaskLookup.forEach((task, id) => merged.set(id, task));
        tasks.forEach((task) => merged.set(task.id, task));
        return merged;
    }, [recurringTaskLookup, tasks]);



    const isManager = user?.role === UserRole.OWNER || user?.role === UserRole.MANAGER;



    useEffect(() => {
        api
            .getUsers()
            .then((users) => setAllUsers(users))
            .catch(console.error);
    }, []);

    useEffect(() => {
        let isActive = true;

        const hydrate = async () => {
            const parentIds = Array.from(
                new Set(tasks.map((task) => task.parent_task_id).filter((id): id is string => Boolean(id)))
            );

            const lookup = new Map<string, Task>();
            tasks.forEach((task) => lookup.set(task.id, task));

            if (parentIds.length > 0) {
                const parents = await Promise.all(parentIds.map((id) => api.getTaskById(id)));
                if (!isActive) return;
                parents.forEach((parent) => {
                    if (parent) lookup.set(parent.id, parent);
                });
            }

            if (isActive) setRecurringTaskLookup(lookup);
        };

        hydrate().catch(console.error);
        return () => {
            isActive = false;
        };
    }, [tasks]);



    const resolveDoerDateRange = (): { dueDateFrom?: string; dueDateTo?: string } => {
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
    };

    useEffect(() => {
        let isActive = true;

        const load = async () => {
            setLoading(true);
            setCurrentPage(1);
            try {
                const filters: {
                    statusIn: Task['status'][];
                    dueDateFrom?: string;
                    dueDateTo?: string;
                } = {
                    statusIn: ['completed', 'closed_permanently'],
                };

                const range = resolveDoerDateRange();
                if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;
                if (range.dueDateTo) filters.dueDateTo = range.dueDateTo;

                let allRows: Task[] = [];
                if (!isManager) {
                    const [toTasks, byTasks] = await Promise.all([
                        api.getAllTasksByFilters({ sortBy: 'completed_at', sortDirection: 'desc', ...filters, assignedTo: user?.id || '' }),
                        api.getAllTasksByFilters({ sortBy: 'completed_at', sortDirection: 'desc', ...filters, assignedBy: user?.id || '' })
                    ]);
                    const taskMap = new Map<string, Task>();
                    toTasks.forEach(t => taskMap.set(t.id, t));
                    byTasks.forEach(t => taskMap.set(t.id, t));
                    allRows = Array.from(taskMap.values()).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
                } else {
                    allRows = await api.getAllTasksByFilters({
                        sortBy: 'completed_at',
                        sortDirection: 'desc',
                        ...filters,
                    });
                }

                if (!isActive) return;

                setTasks(allRows);
            } catch (error) {
                if (!isActive) return;
                console.error('Failed to load completed tasks:', error);
                setTasks([]);
            } finally {
                if (isActive) setLoading(false);
            }
        };

        load();
        return () => {
            isActive = false;
        };
    }, [isManager, isDoer, user?.id, dateFilter, customStart, customEnd]);

    const filteredTasks = useMemo(() => {

        const assignedToQuery = assignedToFilter.toLowerCase().trim();
        const assignedByQuery = assignedByFilter.toLowerCase().trim();

        return tasks.filter((task) => {
            const assignee = (task.assigned_to_name || '').toLowerCase();
            const assigner = (task.assigned_by_name || '').toLowerCase();
            if (assignedToQuery && !assignee.includes(assignedToQuery)) return false;
            if (assignedByQuery && !assigner.includes(assignedByQuery)) return false;
            if (recurringFilter && getDisplayRecurring(task, taskById) !== recurringFilter) return false;
            return true;
        });
    }, [tasks, assignedToFilter, assignedByFilter, recurringFilter, taskById]);

    useEffect(() => {
        setCurrentPage(1);
    }, [assignedToFilter, assignedByFilter, recurringFilter, tasks]);

    const totalResults = filteredTasks.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * rowsPerPage;
    const pageTasks = filteredTasks.slice(startIndex, startIndex + rowsPerPage);
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

    return (
        <div className="space-y-6">
            {/* ── Description ── */}
            <p className="text-slate-500 text-sm">
                {isManager ? 'All tasks that have been successfully completed or permanently closed.' : 'Tasks you have successfully completed or permanently closed.'}
            </p>

            {/* ── Filter Bar ── */}
            <div className="relative z-40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                </div>
            </div>

            {/* ── Top Pagination ── */}
            <div>{paginationControls}</div>

            {/* ── Table ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto min-h-[50vh]">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold">Task</th>
                                <th className="text-left px-4 py-3 font-semibold">Description</th>
                                <th className="text-left px-4 py-3 font-semibold">Due Date</th>
                                <th className="text-left px-4 py-3 font-semibold">Completed At</th>
                                <th className="text-left px-4 py-3 font-semibold">Assigned To</th>
                                <th className="text-left px-4 py-3 font-semibold">Assigned By</th>
                                <th className="text-left px-4 py-3 font-semibold">Verifier</th>
                                <th className="text-left px-4 py-3 font-semibold">Doer's Remark</th>
                                <th className="text-left px-4 py-3 font-semibold">Attachment</th>
                                <th className="text-left px-4 py-3 font-semibold">Status</th>
                                {/* <th className="text-left px-4 py-3 font-semibold">Priority</th> */}
                                <th className="text-left px-4 py-3 font-semibold">Recurring</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                                        Loading completed tasks...
                                    </td>
                                </tr>
                            ) : pageTasks.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="py-16">
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <CheckCircle2 className="w-12 h-12 text-slate-300 mb-3" />
                                            <p className="text-base font-medium text-slate-600">No completed tasks found.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                pageTasks.map((task) => (
                                    <tr key={task.id} className="border-t border-slate-100">
                                        <td className="px-4 py-3 text-slate-800">{task.title}</td>
                                        <td className="px-4 py-3 text-slate-600 wrap-anywhere">{task.description || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {task.due_date ? formatDateDDMMYYYY(task.due_date) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {formatDateDDMMYYYY(task.completed_at, { emptyValue: '-' })}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{task.assigned_to_name || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600">{task.assigned_by_name || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600">{task.verifier_name || task.verified_by || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-pre-wrap wrap-anywhere">{task.doer_remark || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {task.attachment_url ? (
                                                <a
                                                    href={task.attachment_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-teal-600 hover:underline"
                                                >
                                                    <ExternalLink size={14} />
                                                    View
                                                </a>
                                            ) : task.attachment_text ? (
                                                <span className="inline-flex items-center gap-1 text-slate-700">
                                                    <FileText size={14} />
                                                    Text
                                                </span>
                                            ) : task.attachment_required ? (
                                                <span className="text-amber-600 text-xs font-medium">Required</span>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium uppercase ${task.status === 'completed' ? "bg-emerald-50 text-emerald-700" :
                                                task.status === 'closed_permanently' ? "bg-purple-50 text-purple-700" :
                                                    "bg-slate-50 text-slate-700"
                                                }`}>
                                                {task.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        {/*
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium uppercase ${task.priority === 'high' ? "bg-red-50 text-red-700" :
                                                    task.priority === 'medium' ? "bg-amber-50 text-amber-700" :
                                                        "bg-slate-50 text-slate-700"
                                                }`}>
                                                {task.priority || '-'}
                                            </span>
                                        </td>
                                        */}
                                        <td className="px-4 py-3">
                                            <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 uppercase">
                                                {formatRecurringLabel(getDisplayRecurring(task, taskById), 'None')}
                                            </span>
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
        </div>
    );
};

export default CompletedTasks;
