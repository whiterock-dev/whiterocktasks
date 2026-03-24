/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, Search, ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, UserRole } from '../types';
import { Button } from '../components/ui/Button';

const ROWS_PER_PAGE = 25;

export const CompletedTasks: React.FC = () => {
    const { user } = useAuth();
    const isDoer = user?.role === UserRole.DOER;
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [dateFilter, setDateFilter] = useState('all_time');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [assignedToFilter, setAssignedToFilter] = useState('');
    const [assignedByFilter, setAssignedByFilter] = useState('');
    const [assignedToDropdownOpen, setAssignedToDropdownOpen] = useState(false);
    const [assignedByDropdownOpen, setAssignedByDropdownOpen] = useState(false);
    const [debouncedAssignedTo, setDebouncedAssignedTo] = useState('');
    const [debouncedAssignedBy, setDebouncedAssignedBy] = useState('');
    const [recurringFilter, setRecurringFilter] = useState('');
    const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);

    const assignedToDropdownRef = useRef<HTMLDivElement>(null);
    const assignedByDropdownRef = useRef<HTMLDivElement>(null);

    const isManager = user?.role === UserRole.OWNER || user?.role === UserRole.MANAGER;

    useEffect(() => {
        const t = setTimeout(() => setDebouncedAssignedTo(assignedToFilter), 300);
        return () => clearTimeout(t);
    }, [assignedToFilter]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedAssignedBy(assignedByFilter), 300);
        return () => clearTimeout(t);
    }, [assignedByFilter]);

    useEffect(() => {
        api
            .getUsers()
            .then((users) => setAllUsers(users.map((u) => ({ id: u.id, name: u.name || '' }))))
            .catch(console.error);
    }, []);

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

    const formatDate = (value?: string) => {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    useEffect(() => {
        let isActive = true;

        const load = async () => {
            setLoading(true);
            setCurrentPage(1);
            try {
                const filters: {
                    status: 'completed';
                    assignedTo?: string;
                    dueDateFrom?: string;
                    dueDateTo?: string;
                } = {
                    status: 'completed',
                    ...(isManager ? {} : { assignedTo: user?.id || '' }),
                };

                if (isDoer) {
                    const range = resolveDoerDateRange();
                    if (range.dueDateFrom) filters.dueDateFrom = range.dueDateFrom;
                    if (range.dueDateTo) filters.dueDateTo = range.dueDateTo;
                }

                const allRows = await api.getAllTasksByFilters({
                    sortBy: 'completed_at',
                    sortDirection: 'desc',
                    ...filters,
                });
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
        if (isDoer) return tasks;

        const assignedToQuery = debouncedAssignedTo.toLowerCase().trim();
        const assignedByQuery = debouncedAssignedBy.toLowerCase().trim();

        return tasks.filter((task) => {
            const assignee = (task.assigned_to_name || '').toLowerCase();
            const assigner = (task.assigned_by_name || '').toLowerCase();
            if (assignedToQuery && !assignee.includes(assignedToQuery)) return false;
            if (assignedByQuery && !assigner.includes(assignedByQuery)) return false;
            if (recurringFilter && task.recurring !== recurringFilter) return false;
            return true;
        });
    }, [tasks, isDoer, debouncedAssignedTo, debouncedAssignedBy, recurringFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedAssignedTo, debouncedAssignedBy, recurringFilter, tasks]);

    const totalResults = filteredTasks.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / ROWS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ROWS_PER_PAGE;
    const pageTasks = filteredTasks.slice(startIndex, startIndex + ROWS_PER_PAGE);

    const nameOptions = Array.from(
        new Set(allUsers.map((u) => (u.name || '').trim()).filter((name) => name.length > 0))
    ).sort((a, b) => a.localeCompare(b));

    const assignedToNameOptions = nameOptions.filter((name) =>
        name.toLowerCase().includes(assignedToFilter.toLowerCase().trim())
    );
    const assignedByNameOptions = nameOptions.filter((name) =>
        name.toLowerCase().includes(assignedByFilter.toLowerCase().trim())
    );

    const goToFirstPage = () => {
        if (safePage === 1) return;
        setCurrentPage(1);
    };

    const goToPrevPage = () => {
        if (safePage <= 1) return;
        setCurrentPage((prev) => Math.max(1, prev - 1));
    };

    const goToNextPage = () => {
        if (safePage >= totalPages) return;
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-4 py-4 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                    {isManager ? 'Showing all completed tasks' : 'Showing your completed tasks'}
                </p>
                <p className="text-sm font-medium text-slate-700">Total: {totalResults}</p>
            </div>

            <div className="px-4 pt-4 pb-2 border-b border-slate-100">
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
                    </div>
                )}
            </div>

            <div className="overflow-x-auto">
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
                            <th className="text-left px-4 py-3 font-semibold">Attachment</th>
                            <th className="text-left px-4 py-3 font-semibold">Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                    Loading completed tasks...
                                </td>
                            </tr>
                        ) : pageTasks.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                    No completed tasks found.
                                </td>
                            </tr>
                        ) : (
                            pageTasks.map((task) => (
                                <tr key={task.id} className="border-t border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{task.title}</td>
                                    <td className="px-4 py-3 text-slate-600 wrap-anywhere">{task.description || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600">{task.due_date || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600">{formatDate(task.completed_at)}</td>
                                    <td className="px-4 py-3 text-slate-600">{task.assigned_to_name || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600">{task.assigned_by_name || '-'}</td>
                                    <td className="px-4 py-3 text-slate-600">{task.verifier_name || task.verified_by || '-'}</td>
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
                                        <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 uppercase">
                                            {task.priority}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    Page {safePage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={goToFirstPage} disabled={loading || safePage === 1}>
                        <ChevronsLeft size={16} />
                    </Button>
                    <Button variant="secondary" onClick={goToPrevPage} disabled={loading || safePage === 1}>
                        <ChevronLeft size={16} />
                    </Button>
                    <Button variant="secondary" onClick={goToNextPage} disabled={loading || safePage >= totalPages}>
                        <ChevronRight size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CompletedTasks;
