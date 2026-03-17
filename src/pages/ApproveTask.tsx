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
import { Task, UserRole } from '../types';
import { useSearchParams } from 'react-router-dom';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ExternalLink,
    FileText,
} from 'lucide-react';

const ROWS_PER_PAGE_OPTIONS = [25, 100, 500, 1000] as const;

export const ApproveTask: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
    const [pageCursors, setPageCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewAttachment, setViewAttachment] = useState<{ url?: string; text?: string } | null>(null);

    const isOwner = user?.role === UserRole.OWNER;
    const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;
    const canSeeAllApprovalTasks = isOwner || isManager;

    const getActiveFilters = useCallback(() => {
        return {
            status: 'pending_verification' as Task['status'],
            verifierId: canSeeAllApprovalTasks ? undefined : user?.id ?? '',
        };
    }, [canSeeAllApprovalTasks, user?.id]);

    const loadPage = useCallback(
        async (startAfterDoc: QueryDocumentSnapshot | null | undefined, pageNumber: number) => {
            try {
                const filters = getActiveFilters();
                const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
                    pageSize: rowsPerPage,
                    startAfterDoc: startAfterDoc ?? undefined,
                    ...filters,
                });
                setTasks(nextTasks);
                setLastDoc(nextLastDoc);
                setCurrentPage(pageNumber);
                setHasNextPage(nextLastDoc != null);
            } catch (err) {
                console.error('Failed to load approval tasks:', err);
                setTasks([]);
                setLastDoc(null);
                setCurrentPage(pageNumber);
                setHasNextPage(false);
            } finally {
                setLoading(false);
            }
        },
        [getActiveFilters, rowsPerPage]
    );

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setCurrentPage(1);
            setPageCursors([null]);
            try {
                const count = await api.getTasksCount(getActiveFilters());
                setTotalResults(count);
            } catch (err) {
                console.error('Failed to load approval task count:', err);
                setTotalResults(0);
            }
            await loadPage(undefined, 1);
        };
        load();
    }, [getActiveFilters, loadPage]);

    const handleApprove = async (task: Task) => {
        if (!user) return;
        try {
            await api.updateTask(task.id, {
                completed_at: new Date().toISOString(),
                verified_by: user.name,
                verified_at: new Date().toISOString(),
            });
            setLoading(true);
            await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
        } catch (err) {
            console.error('Failed to approve task:', err);
        }
    };

    const handleReject = async (task: Task) => {
        try {
            await api.updateTask(task.id, { status: 'correction_required' as Task['status'] });
            setLoading(true);
            await loadPage(pageCursors[currentPage - 1] ?? null, currentPage);
        } catch (err) {
            console.error('Failed to reject task:', err);
        }
    };

    const handleNextPage = () => {
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
        if (currentPage <= 1 || loading) return;
        const previousCursor = pageCursors[currentPage - 2] ?? null;
        setLoading(true);
        loadPage(previousCursor, currentPage - 1);
    };

    const handleFirstPage = () => {
        if (currentPage <= 1 || loading) return;
        setLoading(true);
        loadPage(null, 1);
    };

    const handleLastPage = async () => {
        const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
        if (loading || currentPage >= totalPages) return;

        let cursor = lastDoc;
        let targetPage = currentPage;
        setLoading(true);

        try {
            while (targetPage < totalPages && cursor != null) {
                const filters = getActiveFilters();
                const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
                    pageSize: rowsPerPage,
                    startAfterDoc: cursor,
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
            console.error('Failed to load last approval page:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-slate-500">Loading...</div>;

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
                {canSeeAllApprovalTasks
                    ? 'All tasks awaiting verification. You can approve only the tasks where you are the selected verifier.'
                    : 'Tasks awaiting your verification. Approve or reject after review.'}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">{paginationControls}</div>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th className="whitespace-nowrap">Title</th>
                            <th>Description</th>
                            <th className="whitespace-nowrap">Doer</th>
                            <th className="whitespace-nowrap">Verifier</th>
                            <th className="whitespace-nowrap text-center">Due Date</th>
                            <th className="whitespace-nowrap text-center">Priority</th>
                            <th className="whitespace-nowrap text-center">Attachment</th>
                            <th className="whitespace-nowrap text-right pr-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-6 text-center text-slate-500">
                                    No approval tasks found.
                                </td>
                            </tr>
                        ) : (
                            tasks.map((task) => {
                                const canApproveTask = task.verifier_id === user?.id;
                                return (
                                    <tr key={task.id} className={highlightId === task.id ? 'bg-amber-50' : ''}>
                                        <td>
                                            <span className="font-medium text-slate-800">{task.title}</span>
                                        </td>
                                        <td className="whitespace-pre-wrap break-all text-sm text-slate-700">
                                            {task.description || '-'}
                                        </td>
                                        <td>
                                            {task.assigned_to_name}
                                            {task.assignee_deleted && (
                                                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-sm font-medium text-slate-700">{task.verifier_name || '-'}</span>
                                        </td>
                                        <td className="text-center whitespace-nowrap text-slate-600 font-medium">{task.due_date}</td>
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
                                        <td className="text-center">
                                            {(task.attachment_url || task.attachment_text) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewAttachment({ url: task.attachment_url, text: task.attachment_text })}
                                                    className="text-teal-600 hover:underline text-sm inline-flex items-center justify-center gap-1 font-medium whitespace-nowrap"
                                                >
                                                    {task.attachment_url ? <ExternalLink size={14} /> : <FileText size={14} />}
                                                    View
                                                </button>
                                            ) : task.attachment_required ? (
                                                <span className="text-amber-600 text-xs font-medium whitespace-nowrap">Required</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right pr-4">
                                            {canApproveTask ? (
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center justify-end py-2 h-full">
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
                                                        onClick={() => handleReject(task)}
                                                        className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap"
                                                    >
                                                        Reject
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-sm whitespace-nowrap">
                                                    {task.verifier_name ? `Verifier: ${task.verifier_name}` : 'No verifier assigned'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">{paginationControls}</div>

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
        </div>
    );
};