/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Task, UserRole, User } from '../types';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';
import { useSearchParams } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ExternalLink,
    ClipboardCheck,
    Pencil,
} from 'lucide-react';
import { formatDateDDMMYYYY } from '../lib/utils';
import { AttachmentViewerModal } from '../components/ui/AttachmentViewerModal';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

export const ApproveTask: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewAttachment, setViewAttachment] = useState<{ urls: string[]; text?: string } | null>(null);
    const [rejectTask, setRejectTask] = useState<Task | null>(null);
    const [rejectComment, setRejectComment] = useState('');
    const [editTask, setEditTask] = useState<Task | null>(null);
    const [editDueDate, setEditDueDate] = useState('');
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [assignedToFilter, setAssignedToFilter] = useState('');
    const [debouncedAssignedTo, setDebouncedAssignedTo] = useState('');
    const [nameFilteredRows, setNameFilteredRows] = useState<Task[] | null>(null);

    const setClientPageFromRows = useCallback(
        (rows: Task[], pageNumber: number) => {
            const clientTotalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
            const safePage = Math.min(Math.max(pageNumber, 1), clientTotalPages);
            const startIndex = (safePage - 1) * rowsPerPage;
            const pagedRows = rows.slice(startIndex, startIndex + rowsPerPage);

            setTasks(pagedRows);
            setCurrentPage(safePage);
            setHasNextPage(safePage < clientTotalPages);
        },
        [rowsPerPage]
    );

    useEffect(() => {
        const t = setTimeout(() => setDebouncedAssignedTo(assignedToFilter), 300);
        return () => clearTimeout(t);
    }, [assignedToFilter]);

    useEffect(() => {
        api.getUsers().then(setAllUsers).catch(console.error);
    }, []);

    const [allPendingTasks, setAllPendingTasks] = useState<Task[] | null>(null);

    const loadAllPendingTasks = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const pendingTasks = await api.getAllTasksByFilters({
                status: 'pending_verification',
                verifierId: user.id
            });
            setAllPendingTasks(pendingTasks);
        } catch (err) {
            console.error('Failed to load pending tasks:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadAllPendingTasks();
    }, [loadAllPendingTasks]);

    useEffect(() => {
        if (!allPendingTasks || allUsers.length === 0) return;

        // Update available doers
        const uniqueDoerIds = new Set(allPendingTasks.map(t => t.assigned_to_id).filter(Boolean));
        setAvailableUsers(allUsers.filter(u => uniqueDoerIds.has(u.id)));

        // Apply name filter
        const query = debouncedAssignedTo.toLowerCase().trim();
        const filtered = query
            ? allPendingTasks.filter(t => (t.assigned_to_name || '').toLowerCase().includes(query))
            : allPendingTasks;

        setTotalResults(filtered.length);
        setNameFilteredRows(filtered);
    }, [allPendingTasks, allUsers, debouncedAssignedTo]);

    useEffect(() => {
        if (!nameFilteredRows) return;
        // Reset to page 1 if current page is out of bounds after filtering
        const maxPage = Math.max(1, Math.ceil(nameFilteredRows.length / rowsPerPage));
        const safePage = Math.min(currentPage, maxPage);
        if (safePage !== currentPage) {
            setCurrentPage(safePage);
        } else {
            setClientPageFromRows(nameFilteredRows, safePage);
        }
    }, [nameFilteredRows, currentPage, rowsPerPage, setClientPageFromRows]);

    const handleApprove = async (task: Task) => {
        if (!user) return;
        try {
            await api.updateTask(task.id, {
                completed_at: new Date().toISOString(),
                verified_by: user.name,
                verified_at: new Date().toISOString(),
            });
            await loadAllPendingTasks();
        } catch (err) {
            console.error('Failed to approve task:', err);
        }
    };

    const submitReject = async () => {
        if (!rejectTask || !user || !rejectComment.trim()) return;
        try {
            await api.updateTask(rejectTask.id, {
                status: 'correction_required',
                verification_rejection_comment: rejectComment.trim(),
                verification_rejected_at: new Date().toISOString(),
                verification_rejected_by: user.name,
            } as Partial<Task>);
            setRejectTask(null);
            setRejectComment('');
            await loadAllPendingTasks();
        } catch (err) {
            console.error('Failed to reject task:', err);
        }
    };

    const handleEditDueDate = async () => {
        if (!editTask || !editDueDate.trim()) return;
        try {
            await api.updateTask(editTask.id, { due_date: editDueDate });
            setEditTask(null);
            setEditDueDate('');
            await loadAllPendingTasks();
        } catch (err) {
            console.error('Failed to update due date:', err);
        }
    };

    const handleNextPage = () => {
        if (!hasNextPage) return;
        setCurrentPage(prev => prev + 1);
    };

    const handlePreviousPage = () => {
        if (currentPage <= 1) return;
        setCurrentPage(prev => prev - 1);
    };

    const handleFirstPage = () => {
        if (currentPage <= 1) return;
        setCurrentPage(1);
    };

    const handleLastPage = () => {
        const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
        if (currentPage >= totalPages) return;
        setCurrentPage(totalPages);
    };

    const isDoer = user?.role === UserRole.DOER;

    const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
    const startRow = totalResults === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const endRow = totalResults === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalResults);

    const paginationControls = (
        <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">Rows per page</span>
                    <select
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
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
                            disabled={loading || !hasNextPage}
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

    return (
        <div>
            <p className="text-slate-500 text-sm mb-4">
                Tasks awaiting your verification. Approve or reject after review.
            </p>
            <div className="relative z-40 flex flex-col sm:flex-row sm:items-center gap-4 mb-3">
                <div className="w-full sm:w-[250px]">
                    <SearchableUserSelect
                        users={availableUsers}
                        nameValue={assignedToFilter}
                        onNameChange={setAssignedToFilter}
                        placeholder="Search Doer Name"
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">{paginationControls}</div>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th className="whitespace-nowrap">Title</th>
                            <th>Description</th>
                            <th>Doer's Remark</th>
                            <th className="whitespace-nowrap">Doer</th>
                            {!isDoer && <th className="whitespace-nowrap">Verifier</th>}
                            <th className="whitespace-nowrap text-center">Due Date</th>
                            {/* <th className="whitespace-nowrap text-center">Priority</th> */}
                            <th className="whitespace-nowrap text-center">Attachment</th>
                            <th className="whitespace-nowrap text-right pr-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={isDoer ? 8 : 9} className="py-12 text-center text-slate-500">
                                    <div className="flex justify-center mb-4">
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-teal-600 animate-spin"></div>
                                    </div>
                                    Loading tasks...
                                </td>
                            </tr>
                        ) : tasks.length === 0 ? (
                            <tr>
                                <td colSpan={isDoer ? 8 : 9} className="py-16">
                                    <div className="flex flex-col items-center justify-center text-slate-500">
                                        <ClipboardCheck className="w-12 h-12 text-slate-300 mb-3" />
                                        <p className="text-base font-medium text-slate-600">No approval tasks found.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            tasks.map((task) => {
                                const canApproveTask = task.verifier_id === user?.id;
                                const canEditTask = user?.id === task.assigned_by_id || user?.id === task.verifier_id;
                                return (
                                    <tr key={task.id} className={highlightId === task.id ? 'bg-amber-50' : ''}>
                                        <td>
                                            <span className="font-medium text-slate-800">{task.title}</span>
                                        </td>
                                        <td className="whitespace-pre-wrap break-all text-sm text-slate-700">
                                            {task.description || '-'}
                                        </td>
                                        <td className="whitespace-pre-wrap break-all text-sm text-slate-700">
                                            {task.doer_remark?.trim() || '-'}
                                        </td>
                                        <td>
                                            {task.assigned_to_name}
                                            {task.assignee_deleted && (
                                                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                                            )}
                                        </td>
                                        {!isDoer && (
                                            <td>
                                                <span className="text-sm font-medium text-slate-700">{task.verifier_name || '-'}</span>
                                            </td>
                                        )}
                                        <td className="text-center whitespace-nowrap text-slate-600 font-medium">{formatDateDDMMYYYY(task.due_date)}</td>
                                        {/*
                                        <td className="text-center">
                                            <span
                                                className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${task.priority === 'urgent'
                                                    ? 'bg-red-100 text-red-800'
                                                    : task.priority === 'high'
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-slate-100 text-slate-600'
                                                    }`}
                                            >
                                                {task.priority}
                                            </span>
                                        </td>
                                        */}
                                        <td className="text-center">
                                            {((task.attachment_urls && task.attachment_urls.length > 0) || task.attachment_url || task.attachment_text) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewAttachment({ 
                                                        urls: task.attachment_urls || (task.attachment_url ? [task.attachment_url] : []), 
                                                        text: task.attachment_text 
                                                    })}
                                                    className="text-teal-600 hover:underline text-sm inline-flex items-center justify-center gap-1 font-medium whitespace-nowrap"
                                                >
                                                    <ExternalLink size={14} />
                                                    View
                                                </button>
                                            ) : task.attachment_required ? (
                                                <span className="text-amber-600 text-xs font-medium whitespace-nowrap">Required</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right pr-4">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center justify-end py-2 h-full">
                                                {canApproveTask ? (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="success"
                                                            onClick={() => handleApprove(task)}
                                                            className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => {
                                                                setRejectTask(task);
                                                                setRejectComment('');
                                                            }}
                                                            className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                                                        >
                                                            Reject
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400 text-sm whitespace-nowrap">
                                                        {task.verifier_name ? `Verifier: ${task.verifier_name}` : 'No verifier assigned'}
                                                    </span>
                                                )}
                                                {canEditTask && (
                                                    <button
                                                        type="button"
                                                        title="Edit due date"
                                                        onClick={() => {
                                                            setEditTask(task);
                                                            setEditDueDate(task.due_date || '');
                                                        }}
                                                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-colors"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{paginationControls}</div>

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
                            <Button variant="danger" disabled={!rejectComment.trim()} onClick={() => submitReject()}>
                                Submit rejection
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {editTask && user && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="card p-6 max-w-sm w-full shadow-xl">
                        <h3 className="text-lg font-semibold mb-2 text-slate-800">Edit Due Date</h3>
                        <p className="text-sm text-slate-600 mb-4">
                            Update the due date for <strong>{editTask.title}</strong>
                        </p>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                        <input
                            type="date"
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setEditTask(null);
                                    setEditDueDate('');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                disabled={!editDueDate.trim() || editDueDate === editTask.due_date}
                                onClick={handleEditDueDate}
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {viewAttachment && (
                <AttachmentViewerModal
                    urls={viewAttachment.urls}
                    text={viewAttachment.text}
                    onClose={() => setViewAttachment(null)}
                />
            )}
        </div>
    );
};