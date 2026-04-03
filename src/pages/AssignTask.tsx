/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { RECURRING_OPTIONS, PRIORITY_OPTIONS } from '../lib/utils';
import { User, Task, RecurringType, TaskPriority } from '../types';
import { UserRole } from '../types';
import { Search, ChevronDown } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.DOER]: 'Doer',
  [UserRole.AUDITOR]: 'Auditor',
  [UserRole.VERIFIER]: 'Verifier',
};

export const AssignTask: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [recurring, setRecurring] = useState<RecurringType>('none');
  const [attachmentRequired, setAttachmentRequired] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'media' | 'text'>('media');
  const [attachmentDesc, setAttachmentDesc] = useState('');
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [assignedToId, setAssignedToId] = useState('');
  const [assignToSearch, setAssignToSearch] = useState('');
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const [verificationRequired, setVerificationRequired] = useState(true);
  const [verifierId, setVerifierId] = useState('');
  const [verifierSearch, setVerifierSearch] = useState('');
  const [verifierDropdownOpen, setVerifierDropdownOpen] = useState(false);
  const verifierDropdownRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [holidays, setHolidays] = useState<{ date: string }[]>([]);

  useEffect(() => {
    if (user?.role === UserRole.AUDITOR) {
      navigate('/tasks');
      return;
    }
    Promise.all([api.getUsers(), api.getHolidays()]).then(([u, h]) => {
      setUsers(u);
      setHolidays(h);
    });
  }, [user?.role, navigate]);

  useEffect(() => {
    if (attachmentRequired) setShowAttachmentModal(true);
    else { setAttachmentDesc(''); setAttachmentType('media'); }
  }, [attachmentRequired]);

  useEffect(() => {
    if (verificationRequired && !verifierId && user?.id) {
      setVerifierId(user.id);
    }
  }, [verificationRequired, verifierId, user?.id]);

  const DAYS = [
    { value: 0, label: 'Mon' },
    { value: 1, label: 'Tue' },
    { value: 2, label: 'Wed' },
    { value: 3, label: 'Thu' },
    { value: 4, label: 'Fri' },
    { value: 5, label: 'Sat' },
    { value: 6, label: 'Sun' },
  ];
  const toggleDay = (d: number) => {
    setRecurringDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError('');
    if (!assignedToId) {
      setAssignDropdownOpen(true);
      setFormError('Please select a member in Assign To.');
      return;
    }
    if (verificationRequired && !verifierId) {
      setVerifierDropdownOpen(true);
      setFormError('Please select a verifier.');
      return;
    }
    if (verificationRequired && verifierId === assignedToId) {
      setFormError('Verifier and assignee cannot be the same member.');
      return;
    }
    setLoading(true);
    setSuccess('');
    try {
      const assignee = users.find((u) => u.id === assignedToId);
      const verifier = users.find((u) => u.id === verifierId);
      const isHoliday = holidays.some((h) => h.date === dueDate);
      const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
        title,
        description,
        start_date: startDate || undefined,
        due_date: dueDate,
        priority,
        status: 'pending',
        recurring,
        is_recurring_master: recurring !== 'none',
        recurring_days: recurring === 'daily' && recurringDays.length > 0 ? recurringDays : undefined,
        attachment_required: attachmentRequired,
        attachment_type: attachmentRequired ? attachmentType : undefined,
        attachment_description: attachmentRequired ? attachmentDesc : undefined,
        assigned_to_id: assignedToId,
        assigned_to_name: assignee?.name || '',
        assigned_to_city: assignee?.city,
        assigned_by_id: user.id,
        assigned_by_name: user.name,
        verification_required: verificationRequired,
        verifier_id: verificationRequired ? verifierId : undefined,
        verifier_name: verificationRequired ? verifier?.name : undefined,
        is_holiday: isHoliday,
      };
      const created = await api.createTask(task);

      // For recurring tasks, master controls schedule and first child is created immediately for doer action.
      if (recurring !== 'none') {
        await api.createTask({
          ...task,
          recurring: 'none',
          is_recurring_master: false,
          recurring_days: undefined,
          parent_task_id: created.id,
        });
      }
      const assigneeUser = users.find((u) => u.id === assignedToId);
      let whatsappStatus = '';
      if (assigneeUser?.phone) {
        try {
          const link = `https://tasks.whiterock.co.in/#/tasks`;
          const formattedDate = created.due_date.split('-').reverse().join('-');
          const desc = created.description || 'N/A';

          await api.sendTaskAssignmentWhatsApp(assigneeUser.phone, {
            title: created.title,
            description: desc,
            due_date: formattedDate,
            assigned_by_name: created.assigned_by_name || user.name,
            link,
          });
          whatsappStatus = ' ';
        } catch (whatsappErr) {
          console.error('WhatsApp send failed:', whatsappErr);
          whatsappStatus = ' WhatsApp notification failed to send.';
        }
      } else {
        whatsappStatus = ' (No phone number — WhatsApp not sent)';
      }
      setSuccess('Task assigned successfully!' + whatsappStatus);
      setTitle('');
      setDescription('');
      setStartDate('');
      setDueDate('');
      setPriority('medium');
      setRecurring('none');
      setRecurringDays([]);
      setAttachmentRequired(false);
      setAttachmentDesc('');
      setAssignedToId('');
      setAssignToSearch('');
      setVerificationRequired(true);
      setVerifierId(user.id);
      setVerifierSearch('');
      setVerifierDropdownOpen(false);
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || 'Failed to assign task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const selectedUser = users.find((u) => u.id === assignedToId);
  const selectedVerifier = users.find((u) => u.id === verifierId);
  const assignFiltered = users.filter((u) => {
    const s = assignToSearch.toLowerCase().trim();
    if (!s) return true;
    const name = (u.name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const city = (u.city || '').toLowerCase();
    const role = (ROLE_LABELS[u.role] || '').toLowerCase();
    return name.includes(s) || email.includes(s) || city.includes(s) || role.includes(s);
  });

  const verifierFiltered = users
    .filter((u) => u.id !== assignedToId)
    .filter((u) => {
      const s = verifierSearch.toLowerCase().trim();
      if (!s) return true;
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const city = (u.city || '').toLowerCase();
      const role = (ROLE_LABELS[u.role] || '').toLowerCase();
      return name.includes(s) || email.includes(s) || city.includes(s) || role.includes(s);
    });

  useEffect(() => {
    if (assignedToId && verifierId === assignedToId) {
      setVerifierId('');
      setVerifierSearch('');
    }
  }, [assignedToId, verifierId]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setAssignDropdownOpen(false);
      }
      if (verifierDropdownRef.current && !verifierDropdownRef.current.contains(e.target as Node)) {
        setVerifierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  if (user?.role === UserRole.AUDITOR) return null;

  return (
    <div className="w-full max-w-6xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Input
              label="Task Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Enter task title"
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Task description..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
              />
              <Input
                label="Due Date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                min={startDate || today}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recurring</label>
                <select
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value as RecurringType)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500"
                >
                  {RECURRING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {recurring === 'daily' && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-2">On which days of the week?</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${recurringDays.includes(d.value)
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="attachment"
                checked={attachmentRequired}
                onChange={(e) => setAttachmentRequired(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="attachment" className="text-sm font-medium text-slate-700">
                Attachment required
              </label>
            </div>
            <div ref={assignDropdownRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={assignDropdownOpen ? assignToSearch : (selectedUser ? `${selectedUser.name} · ${ROLE_LABELS[selectedUser.role]}${selectedUser.city ? ` · ${selectedUser.city}` : ''}` : '')}
                  onChange={(e) => {
                    setAssignToSearch(e.target.value);
                    setAssignDropdownOpen(true);
                    if (!e.target.value) setAssignedToId('');
                    if (formError) setFormError('');
                  }}
                  onFocus={() => setAssignDropdownOpen(true)}
                  placeholder="Search by name, email, role, or city..."
                  className="w-full h-10 pl-10 pr-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={18}
                />
              </div>
              {assignDropdownOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {assignFiltered.length === 0 ? (
                    <li className="py-2 px-3 text-sm text-slate-500">No member found</li>
                  ) : (
                    assignFiltered.map((u) => (
                      <li
                        key={u.id}
                        role="option"
                        aria-selected={assignedToId === u.id}
                        onClick={() => {
                          setAssignedToId(u.id);
                          setAssignToSearch('');
                          setAssignDropdownOpen(false);
                          setFormError('');
                        }}
                        className={`cursor-pointer py-2.5 px-3 text-sm hover:bg-slate-50 ${assignedToId === u.id ? 'bg-teal-50 text-teal-800' : 'text-slate-700'}`}
                      >
                        <span className="font-medium">{u.name}</span>
                        <span className="text-slate-500">
                          {' · '}{ROLE_LABELS[u.role]}
                          {u.city ? ` · ${u.city}` : ''}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {!assignedToId && assignDropdownOpen && (
                <p className="mt-1 text-xs text-amber-600">Select a member to assign the task to.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="verificationRequired"
                checked={verificationRequired}
                onChange={(e) => {
                  setVerificationRequired(e.target.checked);
                  if (!e.target.checked) {
                    setVerifierId('');
                    setVerifierSearch('');
                  } else if (user?.id && !verifierId) {
                    setVerifierId(user.id);
                  }
                }}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="verificationRequired" className="text-sm font-medium text-slate-700">
                Verification Required
              </label>
            </div>
            {verificationRequired && (
              <div ref={verifierDropdownRef} className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">Verifier</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={verifierDropdownOpen ? verifierSearch : (selectedVerifier ? `${selectedVerifier.name} · ${ROLE_LABELS[selectedVerifier.role]}${selectedVerifier.city ? ` · ${selectedVerifier.city}` : ''}` : '')}
                    onChange={(e) => {
                      setVerifierSearch(e.target.value);
                      setVerifierDropdownOpen(true);
                      if (!e.target.value) setVerifierId('');
                      if (formError) setFormError('');
                    }}
                    onFocus={() => setVerifierDropdownOpen(true)}
                    placeholder="Search verifier by name, email, role, or city..."
                    className="w-full h-10 pl-10 pr-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    size={18}
                  />
                </div>
                {verifierDropdownOpen && (
                  <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                    {verifierFiltered.length === 0 ? (
                      <li className="py-2 px-3 text-sm text-slate-500">No verifier found</li>
                    ) : (
                      verifierFiltered.map((u) => (
                        <li
                          key={u.id}
                          role="option"
                          aria-selected={verifierId === u.id}
                          onClick={() => {
                            setVerifierId(u.id);
                            setVerifierSearch('');
                            setVerifierDropdownOpen(false);
                            setFormError('');
                          }}
                          className={`cursor-pointer py-2.5 px-3 text-sm hover:bg-slate-50 ${verifierId === u.id ? 'bg-teal-50 text-teal-800' : 'text-slate-700'}`}
                        >
                          <span className="font-medium">{u.name}</span>
                          <span className="text-slate-500">
                            {' · '}{ROLE_LABELS[u.role]}
                            {u.city ? ` · ${u.city}` : ''}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                {!verifierId && (
                  <p className="mt-1 text-xs text-amber-600">
                    Select a verifier. Any member except the selected assignee can verify this task.
                  </p>
                )}
              </div>
            )}
            {formError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{formError}</div>
            )}
            {success && (
              <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">{success}</div>
            )}
            <Button type="submit" isLoading={loading}>
              Save & Assign
            </Button>
          </div>
        </div>
      </form>

      {showAttachmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Attachment Required</h3>
            <div className="space-y-4 mb-4">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Type</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attachmentType"
                      checked={attachmentType === 'media'}
                      onChange={() => setAttachmentType('media')}
                      className="text-teal-600"
                    />
                    <span>Media (photo/video upload)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attachmentType"
                      checked={attachmentType === 'text'}
                      onChange={() => setAttachmentType('text')}
                      className="text-teal-600"
                    />
                    <span>Text</span>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Description (optional)</p>
                <textarea
                  value={attachmentDesc}
                  onChange={(e) => setAttachmentDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. Photo of completed work..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowAttachmentModal(false)}>Close</Button>
              <Button onClick={() => setShowAttachmentModal(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
