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
import { UserPlus, Trash2, Pencil, Upload, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
    totalUniqueTasksCount: number;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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
    setDeleteLoading(true);
    try {
      const impact = await api.getMemberDeletionImpact(u.id);
      setDeleteModal({
        user: u,
        assignedToCount: impact.assignedToCount,
        assignedByCount: impact.assignedByCount,
        totalUniqueTasksCount: impact.totalUniqueTasksCount,
      });
    } catch (err) {
      console.error('Failed to load deletion impact:', err);
      alert('Failed to check tasks for this member.');
    } finally {
      setDeleteLoading(false);
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

      {deleteModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Delete member &amp; tasks?</h2>
            <p className="text-slate-600 text-sm mb-4">
              Are you sure you want to permanently delete <strong>{deleteModal.user.name}</strong> ({ROLE_LABELS[deleteModal.user.role]})?
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1 mb-4">
              <div className="flex justify-between text-slate-600">
                <span>Tasks assigned to member:</span>
                <span className="font-semibold text-slate-800">{deleteModal.assignedToCount}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tasks assigned by member:</span>
                <span className="font-semibold text-slate-800">{deleteModal.assignedByCount}</span>
              </div>
              <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between text-slate-700 font-medium">
                <span>Total tasks to be deleted:</span>
                <span className="font-bold text-red-600">{deleteModal.totalUniqueTasksCount}</span>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 mb-6">
              <strong>Warning:</strong> Deleting this member will permanently remove all <strong>{deleteModal.totalUniqueTasksCount}</strong> task(s) from the database across all types of tasks. This cannot be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setDeleteModal(null)} disabled={deleteSubmitting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteConfirm}
                disabled={deleteSubmitting}
                isLoading={deleteSubmitting}
              >
                Delete member &amp; tasks
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
