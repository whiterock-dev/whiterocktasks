import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, UserRole, User, Holiday } from '../types';
import { useSearchParams } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Button } from '../components/ui/Button';
import { isHoliday, compressImageForUpload, getPendingDays } from '../lib/utils';
import { Paperclip, Check, X, HelpCircle, ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 7;

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
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [assignedByFilter, setAssignedByFilter] = useState('');
  const [recurringFilter, setRecurringFilter] = useState('');
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentText, setAttachmentText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewAttachment, setViewAttachment] = useState<{ url?: string; text?: string } | null>(null);

  // Edit State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<Task['priority']>('medium');
  const [editRecurring, setEditRecurring] = useState<Task['recurring']>('none');
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAuditor = user?.role === UserRole.AUDITOR;
  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;
  const isDoer = user?.role === UserRole.DOER;

  const loadPage = useCallback(
    async (startAfterDoc: QueryDocumentSnapshot | null | undefined, append: boolean) => {
      const filters: { assignedTo?: string; assignedBy?: string; status?: 'completed' } = {};
      if (isDoer) filters.assignedTo = user?.id ?? '';
      if (isAuditor) filters.status = 'completed';
      const { tasks: nextTasks, lastDoc: nextLastDoc } = await api.getTasksPaginated({
        pageSize: PAGE_SIZE,
        startAfterDoc: startAfterDoc ?? undefined,
        ...filters,
      });
      setTasks((prev) => (append ? [...prev, ...nextTasks] : nextTasks));
      setLastDoc(nextLastDoc);
      setHasNextPage(nextLastDoc != null);
      setLoading(false);
    },
    [user?.id, isDoer, isAuditor]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [h] = await Promise.all([api.getHolidays()]);
      setHolidays(h);
      await loadPage(undefined, false);
    };
    load();
  }, [loadPage]);

  let filteredTasks = tasks;
  if (isDoer && startDateFilter) {
    filteredTasks = tasks.filter((t) => t.start_date === startDateFilter);
  } else {
    if (assignedToFilter) {
      filteredTasks = filteredTasks.filter((t) => t.assigned_to_id === assignedToFilter);
    }
    if (assignedByFilter) {
      filteredTasks = filteredTasks.filter((t) => t.assigned_by_id === assignedByFilter);
    }
    if (recurringFilter) {
      filteredTasks = filteredTasks.filter((t) => t.recurring === recurringFilter);
    }
  }

  // Get unique lists of users and recurring types from the currently loaded tasks
  // (Note: For a fully complete list across all pages, we would need to query the users collection,
  // but for a simple client-side filter on paginated data, we extract from loaded tasks, or we can fetch users.
  // We will assume basic extraction from loaded tasks for now to avoid additional reads if not necessary,
  // OR we can fetch users. Let's fetch all users to populate the dropdowns properly.)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  useEffect(() => {
    api.getUsers().then(setAllUsers).catch(console.error);
  }, []);

  const handleCompleteClick = (t: Task) => {
    if (t.attachment_required) {
      setCompleteTask(t);
      setAttachmentUrl('');
      setAttachmentText('');
      setAttachmentFile(null);
      setUploading(false);
      setUploadError(null);
    } else {
      handleComplete(t, undefined, undefined);
    }
  };

  const handleMediaFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !completeTask) return;
    setAttachmentUrl('');
    setUploadError(null);
    setAttachmentFile(file);
    setUploading(true);
    const path = `task-attachments/${completeTask.id}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    try {
      const toUpload = await compressImageForUpload(file);
      await uploadBytes(storageRef, toUpload);
      const url = await getDownloadURL(storageRef);
      setAttachmentUrl(url);
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
      setAttachmentFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async (t: Task, url?: string, text?: string) => {
    if (!user) return;
    if (t.attachment_required) {
      const isText = t.attachment_type === 'text';
      if (isText && !text?.trim()) return;
      if (!isText && !url?.trim()) return;
    }
    try {
      await api.updateTask(t.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...(url && { attachment_url: url }),
        ...(text && { attachment_text: text }),
      });
      setLoading(true);
      await loadPage(undefined, false);
      setCompleteTask(null);
      setAttachmentUrl('');
      setAttachmentText('');
      setAttachmentFile(null);
      setUploading(false);
      setUploadError(null);
    } catch (err) {
      console.error(err);
    }
  };

  const closeCompleteModal = () => {
    setCompleteTask(null);
    setAttachmentUrl('');
    setAttachmentText('');
    setAttachmentFile(null);
    setUploading(false);
    setUploadError(null);
  };

  const handleAudit = async (taskId: string, status: 'audited' | 'bogus' | 'unclear') => {
    if (!user) return;
    try {
      await api.setAuditStatus(taskId, status, user.name);
      setLoading(true);
      await loadPage(undefined, false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadMore = () => {
    if (!lastDoc || !hasNextPage) return;
    setLoading(true);
    loadPage(lastDoc, true);
  };

  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditAssignedToId(t.assigned_to_id);
    setEditDueDate(t.due_date);
    setEditPriority(t.priority);
    setEditRecurring(t.recurring);
    setEditRecurringDays(t.recurring_days || []);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !user) return;
    setEditSubmitting(true);
    try {
      const assigneeUser = allUsers.find((u) => u.id === editAssignedToId);
      const updates: Partial<Task> = {
        title: editTitle,
        description: editDesc,
        assigned_to_id: editAssignedToId,
        assigned_to_name: assigneeUser?.name || editingTask.assigned_to_name,
        assigned_to_city: assigneeUser?.city || editingTask.assigned_to_city,
        due_date: editDueDate,
        priority: editPriority,
        recurring: editRecurring,
        recurring_days: editRecurring === 'daily' && editRecurringDays.length > 0 ? editRecurringDays : (null as any),
        assignee_deleted: false, // Reset flag if reassigned to active user
      };

      // Update holiday status if due date changed
      if (editingTask.due_date !== editDueDate) {
        updates.is_holiday = isHoliday(editDueDate, holidays);
      }

      await api.updateTask(editingTask.id, updates);

      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t)));
      setEditingTask(null);
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

  if (loading) return <div className="text-slate-500">Loading...</div>;

  if (isAuditor) {
    return (
      <div>
        <p className="text-slate-500 text-sm mb-4">Tasks pending audit. Mark as audited, bogus, or unclear.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm text-slate-600">
            Showing <span className="font-medium text-slate-800">{filteredTasks.length}</span> task{filteredTasks.length !== 1 ? 's' : ''}
            {hasNextPage && '+'}
          </p>
          {hasNextPage && (
            <Button size="sm" variant="secondary" onClick={handleLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th className="whitespace-nowrap">Name</th>
                <th className="whitespace-nowrap">City</th>
                <th className="min-w-[150px]">Task</th>
                <th className="min-w-[200px]">Description</th>
                <th className="whitespace-nowrap text-center">Attachment</th>
                <th className="whitespace-nowrap text-center">Status</th>
                <th className="whitespace-nowrap text-center">Pending Days</th>
                <th className="whitespace-nowrap text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => (
                <tr key={t.id} className={highlightId === t.id ? 'bg-amber-50' : ''}>
                  <td>
                    {t.assigned_to_name}
                    {t.assignee_deleted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                    )}
                  </td>
                  <td>{t.assigned_to_city || (t.assignee_deleted ? '—' : '-')}</td>
                  <td>{t.title}</td>
                  <td className="min-w-[150px] whitespace-pre-wrap break-words text-sm text-slate-700">
                    {t.description || '-'}
                  </td>
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
        {hasNextPage && (
          <div className="mt-3 flex justify-center border-t border-slate-100 pt-3">
            <Button variant="secondary" onClick={handleLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        {isDoer ? (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Filter by Start Date:</label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">All Doers</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <select
              value={assignedByFilter}
              onChange={(e) => setAssignedByFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">Assigned By (All)</option>
              {allUsers.map((u) => (
                <option key={`assigner-${u.id}`} value={u.id}>
                  {u.name}
                </option>
              ))}
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
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:ml-auto">
          <p className="text-sm text-slate-600">
            Showing <span className="font-medium text-slate-800">{filteredTasks.length}</span> task{filteredTasks.length !== 1 ? 's' : ''}
            {hasNextPage && '+'}
          </p>
          {hasNextPage && (
            <Button size="sm" variant="secondary" onClick={handleLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="whitespace-nowrap">Title</th>
              <th className="min-w-[180px]">Description</th>
              <th className="whitespace-nowrap">Assigned To</th>
              <th className="whitespace-nowrap">Assigned By</th>
              <th className="whitespace-nowrap text-center">Start Date</th>
              <th className="whitespace-nowrap text-center">Due Date</th>
              <th className="whitespace-nowrap text-center">Priority</th>
              <th className="whitespace-nowrap text-center">Recurring</th>
              <th className="whitespace-nowrap text-center">Status</th>
              <th className="whitespace-nowrap text-center">Attachment</th>
              <th className="whitespace-nowrap text-right pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((t) => {
              const onHoliday = isHoliday(t.due_date, holidays);
              return (
                <tr
                  key={t.id}
                  className={`${highlightId === t.id ? 'bg-amber-50' : ''} ${onHoliday ? 'bg-orange-50/50' : ''}`}
                >
                  <td>
                    <span className="font-medium text-slate-800">{t.title}</span>
                    {onHoliday && (
                      <span className="ml-2 text-xs text-orange-600">(Holiday)</span>
                    )}
                    {t.assignee_deleted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                    )}
                  </td>
                  <td className="min-w-[200px] whitespace-pre-wrap break-words text-sm text-slate-700">
                    {t.description || '-'}
                  </td>
                  <td>
                    {t.assigned_to_name}
                    {t.assignee_deleted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">Member deleted</span>
                    )}
                  </td>
                  <td>
                    <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                      {t.assigned_by_name}
                    </span>
                  </td>
                  <td className="text-center whitespace-nowrap text-slate-600">{t.start_date || '-'}</td>
                  <td className="text-center whitespace-nowrap text-slate-600 font-medium">{t.due_date}</td>
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
                  <td className="text-center">
                    <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 capitalize whitespace-nowrap">
                      {t.recurring || 'None'}
                    </span>
                  </td>
                  <td className="text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap ${t.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'overdue'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {t.status}
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
                      {t.assigned_to_id === user?.id && t.status !== 'completed' && (
                        <Button size="sm" variant="success" onClick={() => handleCompleteClick(t)} className="w-full sm:w-auto text-xs sm:text-sm px-2 py-1 whitespace-nowrap">
                          Complete
                        </Button>
                      )}
                      {(isOwner || isManager || t.assigned_by_id === user?.id) && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => openEditModal(t)} className="!px-2" title="Edit Task">
                            <Pencil size={15} />
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteTask(t.id)} className="!px-2" title="Delete Task">
                            <Trash2 size={15} />
                          </Button>
                        </>
                      )}
                      {!(t.assigned_to_id === user?.id && t.status !== 'completed') && !(isOwner || isManager || t.assigned_by_id === user?.id) && (
                        <span className="text-slate-400 text-center">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      {completeTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              {completeTask.attachment_type === 'text'
                ? 'Text required to mark complete'
                : 'Upload media required to mark complete'}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {completeTask.attachment_description ||
                (completeTask.attachment_type === 'text'
                  ? 'You must enter text below to complete this task.'
                  : 'Upload a photo/video or paste a link to your media.')}
            </p>
            {completeTask.attachment_type === 'text' ? (
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
                      {attachmentFile.name}
                      {uploading && ' — Uploading...'}
                      {!uploading && attachmentUrl && ' — Done'}
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
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={closeCompleteModal}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleComplete(
                    completeTask,
                    completeTask.attachment_type === 'text' ? undefined : attachmentUrl,
                    completeTask.attachment_type === 'text' ? attachmentText : undefined
                  )
                }
                disabled={
                  completeTask.attachment_type === 'text'
                    ? !attachmentText.trim()
                    : !attachmentUrl.trim()
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
          </div>
        </div>
      )}
    </div>
  );
};
