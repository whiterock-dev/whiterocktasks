/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { RemovalRequest as RemovalRequestType, Task } from '../types';
import { Button } from '../components/ui/Button';
import { UserRole } from '../types';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { formatDateDDMMYYYY } from '../lib/utils';

const REQUESTS_PAGE_SIZE = 20;

export const RemovalRequest: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RemovalRequestType[]>([]);
  const [lastRequestDoc, setLastRequestDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: string; taskId: string } | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER;
  const canReviewRequests = isOwner || isManager;

  const loadRequests = useCallback(async (startAfterDoc?: QueryDocumentSnapshot | null) => {
    const { requests: nextRequests, lastDoc } = await api.getRemovalRequestsPaginated({
      limitCount: REQUESTS_PAGE_SIZE,
      startAfterDoc: startAfterDoc ?? undefined,
      requestedById: canReviewRequests ? undefined : user?.id,
    });
    setRequests(startAfterDoc ? (prev) => [...prev, ...nextRequests] : nextRequests);
    setLastRequestDoc(lastDoc);
    setHasNextPage(lastDoc != null);
  }, [canReviewRequests, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setInitialLoadDone(false);
    Promise.all([
      loadRequests(undefined),
      api.getMyIncompleteTasks(user.id).then((tasks) => {
        if (!cancelled) setMyTasks(tasks);
      }),
    ])
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setInitialLoadDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, loadRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskId || !reason) return;
    setSubmitting(true);
    try {
      const task = await api.getTaskById(taskId);
      if (!task) {
        alert('Task not found');
        return;
      }
      await api.createRemovalRequest({
        task_id: taskId,
        task_title: task.title,
        requested_by_id: user.id,
        requested_by_name: user.name,
        reason,
      });
      setTaskId('');
      setReason('');
      await loadRequests(undefined);
      setMyTasks(await api.getMyIncompleteTasks(user.id));
      setShowRequestModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string, taskIdForDelete: string) => {
    if (!user) return;
    setResolving(true);
    try {
      await api.resolveRemovalRequest(id, 'approved', user.name);
      await api.deleteTask(taskIdForDelete);
      await loadRequests(undefined);
      setMyTasks(await api.getMyIncompleteTasks(user.id));
    } catch (err) {
      console.error(err);
    } finally {
      setResolving(false);
    }
  };

  const openRejectModal = (id: string, tId: string) => {
    setRejectNote('');
    setRejectModal({ id, taskId: tId });
  };

  const submitReject = async () => {
    if (!user || !rejectModal) return;
    const note = rejectNote.trim();
    if (!note) {
      alert('Please enter a reason for rejection.');
      return;
    }
    setResolving(true);
    try {
      await api.resolveRemovalRequest(rejectModal.id, 'rejected', user.name, {
        rejectionReason: note,
      });
      setRejectModal(null);
      await loadRequests(undefined);
      setMyTasks(await api.getMyIncompleteTasks(user.id));
    } catch (err) {
      console.error(err);
    } finally {
      setResolving(false);
    }
  };

  const handleLoadMore = () => {
    if (!lastRequestDoc || !hasNextPage) return;
    setLoadingMore(true);
    loadRequests(lastRequestDoc).finally(() => setLoadingMore(false));
  };

  const colCount = canReviewRequests ? 7 : 6;

  return (
    <div>
      <p className="text-slate-600 mb-6">
        Request removal of a task assigned to you. The owner will review and approve or reject.
      </p>

      <Button onClick={() => setShowRequestModal(true)} className="mb-6">
        Request Task Removal
      </Button>

      {showRequestModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Request Task Removal</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Task</label>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  required
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="">Choose a task to request removal</option>
                  {myTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (Due: {formatDateDDMMYYYY(t.due_date)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Why should this task be removed?"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={submitting}>
                  Submit Request
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6">
            <h2 className="font-semibold text-slate-800 mb-2">Reject removal request</h2>
            <p className="text-sm text-slate-600 mb-4">
              The requester will see this reason. It cannot be empty.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
              placeholder="Explain why this removal request is denied..."
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setRejectModal(null)} disabled={resolving}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={submitReject} isLoading={resolving}>
                Reject request
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold text-slate-800 mb-4">
          {canReviewRequests ? 'All Removal Requests' : 'My Requests'}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-4 px-4 font-semibold text-slate-800">Task</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-800">Requested By</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-800">Request reason</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-800">Submitted</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-800">Status</th>
                <th className="text-left py-4 px-4 font-semibold text-slate-800 min-w-[200px]">
                  Decision / response
                </th>
                {canReviewRequests && (
                  <th className="text-right py-4 px-4 font-semibold text-slate-800">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {!initialLoadDone ? (
                <tr>
                  <td colSpan={colCount} className="py-12 px-4 text-center text-slate-500">
                    Loading requests…
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-8 px-4 text-center text-slate-500">
                    No removal requests yet.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-800">{r.task_title}</td>
                    <td className="py-3 px-4 text-slate-700">{r.requested_by_name}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-50">{r.reason}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {formatDateDDMMYYYY(r.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : r.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-sm max-w-xs">
                      {r.status === 'rejected' && r.rejection_reason ? (
                        <span className="text-slate-800">{r.rejection_reason}</span>
                      ) : r.status === 'approved' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    {canReviewRequests && (
                      <td className="py-3 px-4 text-right">
                        {r.status === 'pending' ? (
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button
                              size="sm"
                              variant="success"
                              disabled={resolving}
                              onClick={() => handleApprove(r.id, r.task_id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={resolving}
                              onClick={() => openRejectModal(r.id, r.task_id)}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasNextPage && initialLoadDone && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
