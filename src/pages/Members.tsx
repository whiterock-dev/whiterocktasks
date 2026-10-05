/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { User, UserRole } from '../types';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { SearchableUserSelect } from '../components/ui/SearchableUserSelect';
import { UserPlus, Trash2, Pencil, Upload, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';

const ROWS_PER_PAGE_OPTIONS = [50, 100] as const;

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.DOER]: 'Doer',
  [UserRole.AUDITOR]: 'Auditor',
  [UserRole.VERIFIER]: 'Verifier',
};

export const Members: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.DOER);
  const [newUserCity, setNewUserCity] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(ROWS_PER_PAGE_OPTIONS[0]);
  const [cityFilter, setCityFilter] = useState('');

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.DOER);
  const [editCity, setEditCity] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteModal, setDeleteModal] = useState<{
    user: User;
    assignedToCount: number;
    assignedByCount: number;
    verifierCount: number;
    totalUniqueTasksCount: number;
    masterRecurringTasksCount: number;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);

  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  useEffect(() => {
    api.getUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) return;
    setSubmitting(true);
    setError('');
    try {

      let formattedPhone = newUserPhone?.trim() || undefined;
      if (formattedPhone && !formattedPhone.startsWith('+91')) {
        formattedPhone = '+91' + formattedPhone;
      }

      await api.createUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        city: newUserCity || undefined,
        phone: formattedPhone,
      });
      setUsers(await api.getUsers());
      setShowAddForm(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserCity('');
      setNewUserPhone('');
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = async (u: User) => {
    setPendingDeleteUser(u);
    setDeleteLoading(true);
    try {
      const impact = await api.getMemberDeletionImpact(u.id);
      setDeleteModal({
        user: u,
        assignedToCount: impact.assignedToCount,
        assignedByCount: impact.assignedByCount,
        verifierCount: impact.verifierCount,
        totalUniqueTasksCount: impact.totalUniqueTasksCount,
        masterRecurringTasksCount: impact.masterRecurringTasksCount,
      });
    } catch (err) {
      console.error('Failed to load deletion impact:', err);
      alert('Failed to check tasks for this member.');
    } finally {
      setDeleteLoading(false);
      setPendingDeleteUser(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    const { user: u } = deleteModal;
    setDeleteSubmitting(true);
    try {
      const res = await api.deleteUserAndAssociatedTasks(u.id);
      setUsers(await api.getUsers());
      setDeleteModal(null);
      alert(`Deleted member ${u.name} and permanently removed ${res.deletedTasksCount} associated task(s).`);
    } catch (err) {
      console.error(err);
      alert('Failed to delete member and tasks.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleRecheckImpact = async () => {
    if (!deleteModal) return;
    setRecheckLoading(true);
    try {
      const impact = await api.getMemberDeletionImpact(deleteModal.user.id);
      setDeleteModal(prev => prev ? {
        ...prev,
        assignedToCount: impact.assignedToCount,
        assignedByCount: impact.assignedByCount,
        verifierCount: impact.verifierCount,
        totalUniqueTasksCount: impact.totalUniqueTasksCount,
        masterRecurringTasksCount: impact.masterRecurringTasksCount,
      } : null);
    } catch (err) {
      console.error('Failed to recheck impact:', err);
    } finally {
      setRecheckLoading(false);
    }
  };

  const handleTransferAssignedBy = async () => {
    if (!deleteModal || !transferToUserId) return;
    const toUser = users.find(u => u.id === transferToUserId);
    if (!toUser) return;
    setTransferSubmitting(true);
    try {
      await api.transferAssignedByTasks(deleteModal.user.id, toUser.id, toUser.name);
      const impact = await api.getMemberDeletionImpact(deleteModal.user.id);
      setDeleteModal(prev => prev ? {
        ...prev,
        assignedToCount: impact.assignedToCount,
        assignedByCount: impact.assignedByCount,
        verifierCount: impact.verifierCount,
        totalUniqueTasksCount: impact.totalUniqueTasksCount,
        masterRecurringTasksCount: impact.masterRecurringTasksCount,
      } : null);
      setTransferToUserId('');
    } catch (err) {
      console.error('Transfer failed:', err);
      alert('Failed to transfer tasks. Please try again.');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPassword('');
    setEditRole(u.role);
    setEditCity(u.city || '');
    setEditPhone(u.phone || '');
    setEditError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSubmitting(true);
    setEditError('');
    try {

      let formattedPhone = editPhone?.trim() || undefined;
      if (formattedPhone && !formattedPhone.startsWith('+91')) {
        formattedPhone = '+91' + formattedPhone;
      }

      const updates: Partial<User> = {
        name: editName,
        email: editEmail,
        role: editRole,
        city: editCity || undefined,
        phone: formattedPhone,
      };
      if (editPassword.trim()) {
        updates.password = editPassword;
      }
      await api.updateUser(editingUser.id, updates);
      setUsers(await api.getUsers());
      setEditingUser(null);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update member');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'Name,Email,Password,City,Phone\nJohn Doe,john@example.com,pass123,New York,1234567890';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'members_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    setBulkMessage(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const currentUsers = await api.getUsers();
          const existingPhones = new Set(
            currentUsers.filter(u => u.phone).map(u => u.phone as string)
          );

          let successCount = 0;
          let duplicateCount = 0;
          let errorCount = 0;

          const rows = results.data as any[];

          const formatPhone = (phoneStr: string) => {
            let p = phoneStr?.trim() || '';
            if (!p) return undefined;
            if (p.startsWith('="') && p.endsWith('"')) {
              p = p.slice(2, -1);
            }
            p = p.replace(/[^\d+]/g, '');
            if (!p.startsWith('+91')) {
              if (p.startsWith('91') && p.length === 12) {
                p = '+' + p;
              } else {
                p = '+91' + p.replace(/^\+/, '');
              }
            }
            return p;
          };

          const processedRows = rows
            .filter(row => row.Name?.trim() && row.Email?.trim() && row.Password?.trim() && row.Phone?.trim())
            .map(row => ({
              ...row,
              formattedPhone: formatPhone(row.Phone || '')
            }));

          // Check for empty rows or missing required columns first
          if (processedRows.length === 0) {
            setBulkMessage({ text: 'CSV is empty or missing required columns (Name, Email, Password, Phone).', type: 'error' });
            setBulkUploading(false);
            if (event.target) event.target.value = '';
            return;
          }

          // Check for internal duplicates in the CSV
          const csvPhones = processedRows.map(row => row.formattedPhone).filter(Boolean) as string[];
          const internalDuplicates = csvPhones.filter((phone, index) => csvPhones.indexOf(phone) !== index);
          if (internalDuplicates.length > 0) {
            setBulkMessage({ text: `Duplicate phone numbers found within the CSV file: ${Array.from(new Set(internalDuplicates)).join(', ')}. Please fix and try again.`, type: 'error' });
            setBulkUploading(false);
            if (event.target) event.target.value = '';
            return;
          }

          const newUsersToAppend: User[] = [];

          for (const row of processedRows) {
            const phoneCell = row.formattedPhone;

            if (phoneCell && existingPhones.has(phoneCell)) {
              duplicateCount++;
              continue; // Skip if phone already exists
            }

            try {
              const createdUser = await api.createUser({
                name: row.Name.trim(),
                email: row.Email.trim(), // Kept email, but isn't part of dupe check now
                password: row.Password.trim(),
                role: UserRole.DOER, // Enforce DOER role for bulk imports
                city: row.City?.trim() || undefined,
                phone: phoneCell || undefined,
              });
              successCount++;
              newUsersToAppend.push(createdUser);
              // Add to local set to prevent any subsequent duplicates in the same batch from somehow passing
              if (phoneCell) existingPhones.add(phoneCell);
            } catch (err) {
              console.error('Error creating user from CSV:', err);
              errorCount++;
            }
          }

          if (newUsersToAppend.length > 0) {
            setUsers(prev => [...prev, ...newUsersToAppend]);
          }

          if (successCount > 0 && duplicateCount === 0 && errorCount === 0) {
            setBulkMessage({ text: `Successfully added ${successCount} members.`, type: 'success' });
          } else if (successCount > 0) {
            setBulkMessage({ text: `Added ${successCount} members. Skipped ${duplicateCount} duplicates. Errors: ${errorCount}.`, type: 'warning' });
          } else {
            setBulkMessage({ text: `Failed to add members. Skipped ${duplicateCount} duplicates. Errors: ${errorCount}.`, type: 'error' });
          }
        } catch (err) {
          console.error('Bulk upload failed:', err);
          setBulkMessage({ text: 'An unexpected error occurred during bulk upload.', type: 'error' });
        } finally {
          setBulkUploading(false);
          if (event.target) event.target.value = ''; // Reset input
        }
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        setBulkMessage({ text: 'Failed to parse CSV file. Ensure it is formatted correctly.', type: 'error' });
        setBulkUploading(false);
        if (event.target) event.target.value = '';
      }
    });
  };

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!isOwner && !isManager) return <div className="text-slate-500">Access denied. Only Owner and Managers can view Members.</div>;

  // Unique cities for the filter dropdown
  const uniqueCities = Array.from(
    new Set(users.map((u) => (u.city || '').trim()).filter((c) => c.length > 0))
  ).sort((a, b) => a.localeCompare(b));

  // Apply city filter, then sort alphabetically by name
  const filteredUsers = users
    .filter((u) => {
      if (!cityFilter) return true;
      return (u.city || '').trim().toLowerCase() === cityFilter.toLowerCase();
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const paginationControls = (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl mb-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Rows per page</span>
        <select
          value={rowsPerPage}
          onChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setCurrentPage(1); // Reset to first page when changing row count
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
          Showing <span className="font-semibold text-slate-800">{filteredUsers.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredUsers.length)}</span> of{' '}
          <span className="font-semibold text-slate-800">{filteredUsers.length}</span> results
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="First page"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage <= 1}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage <= 1}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredUsers.length / rowsPerPage)))}
            disabled={currentPage >= Math.ceil(filteredUsers.length / rowsPerPage) || filteredUsers.length === 0}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            aria-label="Last page"
            onClick={() => setCurrentPage(Math.ceil(filteredUsers.length / rowsPerPage))}
            disabled={currentPage >= Math.ceil(filteredUsers.length / rowsPerPage) || filteredUsers.length === 0}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        {(isOwner || isManager) && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowAddForm(true)}>
              <UserPlus size={18} className="mr-2" />
              Add Member
            </Button>

            <input
              type="file"
              accept=".csv"
              id="csv-upload"
              className="hidden"
              onChange={handleBulkUpload}
              disabled={bulkUploading}
            />
            <Button
              variant="secondary"
              onClick={() => document.getElementById('csv-upload')?.click()}
              disabled={bulkUploading}
            >
              <Upload size={18} className="mr-2" />
              {bulkUploading ? 'Uploading...' : 'Bulk Upload CSV'}
            </Button>

            <Button variant="secondary" onClick={handleDownloadTemplate}>
              <Download size={18} className="mr-2" />
              Download Template
            </Button>
          </div>
        )}
        {uniqueCities.length > 0 && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <select
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">All Cities</option>
              {uniqueCities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            {cityFilter && (
              <button
                type="button"
                onClick={() => { setCityFilter(''); setCurrentPage(1); }}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {bulkMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${bulkMessage.type === 'success' ? 'bg-teal-50 text-teal-700' :
          bulkMessage.type === 'error' ? 'bg-red-50 text-red-700' :
            'bg-yellow-50 text-yellow-700'
          }`}>
          {bulkMessage.text}
        </div>
      )}

      {showAddForm && (isOwner || isManager) && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="font-semibold text-slate-800 mb-4">Add New Member</h2>
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
              )}
              <form onSubmit={handleAddMember} className="space-y-4">
                <Input
                  label="Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                  placeholder="Full name"
                />
                <Input
                  label="Email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  placeholder="email@company.com"
                />
                <Input
                  label="Password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    <option value={UserRole.OWNER}>Owner</option>
                    <option value={UserRole.MANAGER}>Manager</option>
                    <option value={UserRole.DOER}>Doer</option>
                    <option value={UserRole.AUDITOR}>Auditor</option>
                  </select>
                </div>
                <Input
                  label="City"
                  value={newUserCity}
                  onChange={(e) => setNewUserCity(e.target.value)}
                  placeholder="City"
                />
                <Input
                  label="Phone (for WhatsApp)"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="+91..."
                />
                <div className="flex gap-2 pt-2">
                  <Button type="submit" isLoading={submitting}>
                    Add Member
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setShowAddForm(false); setError(''); setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserCity(''); setNewUserPhone(''); setNewUserRole(UserRole.DOER); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {paginationControls}

      <div className="overflow-x-auto mt-4">
        <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Name</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Email</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Role</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">City</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Phone</th>
              <th className="text-right py-4 px-4 font-semibold text-slate-800">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 font-medium text-slate-800">{u.name}</td>
                <td className="py-3 px-4 text-slate-600">{u.email}</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                    {u.role}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">{u.city || '-'}</td>
                <td className="py-3 px-4 text-slate-600">{u.phone || '-'}</td>
                <td className="py-3 px-4 text-right flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEditModal(u)}
                    disabled={u.id === user?.id}
                    title="Edit member"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteMember(u)}
                    disabled={u.id === user?.id || deleteLoading}
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        {paginationControls}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Member</h2>
              {editError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{editError}</div>
              )}
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <Input label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                <Input label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                <Input
                  label="New password (leave blank to keep current)"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                  >
                    <option value={UserRole.OWNER}>Owner</option>
                    <option value={UserRole.MANAGER}>Manager</option>
                    <option value={UserRole.DOER}>Doer</option>
                    <option value={UserRole.AUDITOR}>Auditor</option>
                  </select>
                </div>
                <Input label="City" value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="City" />
                <Input label="Phone (for WhatsApp)" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+91..." />
                <div className="flex gap-2 pt-2">
                  <Button type="submit" isLoading={editSubmitting}>Save changes</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteLoading && pendingDeleteUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-4 border-teal-100 border-t-teal-600 animate-spin" />
            <div className="text-center">
              <p className="text-slate-800 font-medium text-sm">Checking active tasks…</p>
              <p className="text-slate-500 text-xs mt-1">{pendingDeleteUser.name}</p>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-semibold text-slate-900">Delete Member</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="font-medium text-slate-700">{deleteModal.user.name}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                {ROLE_LABELS[deleteModal.user.role]}
              </p>
            </div>

            {/* Stats grid — 3-up, always visible, not scrollable */}
            <div className="px-6 pt-4 pb-3 shrink-0">
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Assigned to', count: deleteModal.assignedToCount },
                  { label: 'Assigned by', count: deleteModal.assignedByCount },
                  { label: 'Verifier', count: deleteModal.verifierCount },
                ].map(({ label, count }) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <div className={`text-2xl font-bold leading-none ${count > 0 ? 'text-orange-500' : 'text-green-500'}`}>{count}</div>
                    <div className="text-[11px] text-slate-500 mt-1.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>
              {deleteModal.masterRecurringTasksCount > 0 && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <span className="text-xs font-medium text-red-700">Active recurring tasks</span>
                  <span className="text-sm font-bold text-red-700">{deleteModal.masterRecurringTasksCount}</span>
                </div>
              )}
            </div>

            {/* Transfer section — kept OUTSIDE the scroll container so dropdown is never clipped */}
            {deleteModal.assignedByCount > 0 && (
              <div className="px-6 pb-3 shrink-0">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">Transfer assigned-by tasks</p>
                  <p className="text-xs text-blue-600 mt-0.5 mb-3">
                    {deleteModal.assignedByCount} active task(s) will be reassigned to the member you select.
                  </p>
                  <div className={transferSubmitting ? 'pointer-events-none opacity-60' : ''}>
                    <SearchableUserSelect
                      users={users}
                      value={transferToUserId}
                      onChange={setTransferToUserId}
                      excludeUserId={deleteModal.user.id}
                      placeholder="Search member to transfer to…"
                    />
                  </div>
                  <Button
                    className="mt-2.5 w-full"
                    size="sm"
                    onClick={handleTransferAssignedBy}
                    disabled={!transferToUserId || transferSubmitting}
                    isLoading={transferSubmitting}
                  >
                    Transfer tasks
                  </Button>
                </div>
              </div>
            )}

            {/* Scrollable body — only sections that have no dropdowns */}
            <div className="overflow-y-auto flex-1 px-6 pb-3 space-y-2.5">

              {deleteModal.masterRecurringTasksCount > 0 && (
                <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">
                    <strong>Cannot delete.</strong> Shift all {deleteModal.masterRecurringTasksCount} recurring task(s) to another member first.
                  </p>
                </div>
              )}

              {deleteModal.masterRecurringTasksCount === 0 && (
                <>
                  {deleteModal.assignedToCount > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-sm text-amber-900">
                        <strong>{deleteModal.assignedToCount} task(s)</strong> are still assigned to this member. Reassign them via the task list, then Recheck.
                      </p>
                    </div>
                  )}

                  {deleteModal.verifierCount > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-sm text-amber-900">
                        <strong>{deleteModal.verifierCount} task(s)</strong> still have this member as verifier. Update them via the task list, then Recheck.
                      </p>
                    </div>
                  )}

                  {(deleteModal.assignedToCount > 0 || deleteModal.verifierCount > 0) && (
                    <Button variant="secondary" size="sm" onClick={handleRecheckImpact} disabled={recheckLoading} isLoading={recheckLoading}>
                      <RefreshCw size={13} className="mr-1.5" />
                      Recheck counts
                    </Button>
                  )}

                  {deleteModal.assignedToCount === 0 && deleteModal.assignedByCount === 0 && deleteModal.verifierCount === 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                      <strong>Warning:</strong> All associations resolved. This action is permanent and cannot be undone.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => { setDeleteModal(null); setTransferToUserId(''); }}
                disabled={deleteSubmitting || transferSubmitting}
              >
                Cancel
              </Button>
              {deleteModal.masterRecurringTasksCount === 0 &&
                deleteModal.assignedToCount === 0 &&
                deleteModal.assignedByCount === 0 &&
                deleteModal.verifierCount === 0 && (
                <Button
                  variant="danger"
                  onClick={handleDeleteConfirm}
                  disabled={deleteSubmitting}
                  isLoading={deleteSubmitting}
                >
                  Delete member
                </Button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
