/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { User } from '../types';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const HelpNew: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [helperId, setHelperId] = useState('');
  const [helperSearch, setHelperSearch] = useState('');
  const [helperOpen, setHelperOpen] = useState(false);
  const helperRef = useRef<HTMLDivElement>(null);

  const [proposedSolutions, setProposedSolutions] = useState<string[]>(['']);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoadingUsers(true);
    api.getUsers()
      .then((u) => {
        if (mounted) setUsers(u);
      })
      .finally(() => {
        if (mounted) setLoadingUsers(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!helperRef.current) return;
      if (!helperRef.current.contains(e.target as Node)) setHelperOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const helper = useMemo(() => users.find((u) => u.id === helperId) || null, [users, helperId]);

  const filteredHelpers = useMemo(() => {
    const s = helperSearch.toLowerCase().trim();
    if (!s) return users;
    return users.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const city = (u.city || '').toLowerCase();
      return name.includes(s) || email.includes(s) || city.includes(s);
    });
  }, [users, helperSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');

    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a description.');
      return;
    }
    if (!helperId) {
      setHelperOpen(true);
      setError('Please select a helper.');
      return;
    }
    if (!proposedSolutions[0]?.trim()) {
      setError('Please add at least 1 proposed solution.');
      return;
    }

    setSaving(true);
    try {
      const helperUser = users.find((u) => u.id === helperId);
      if (!helperUser) throw new Error('Selected helper not found');

      await api.createHelpTicket({
        title,
        description,
        helper: { id: helperUser.id, name: helperUser.name },
        doer: { id: user.id, name: user.name },
        proposedSolutions: proposedSolutions.map((text, idx) => ({
          text,
          priority: (idx + 1) as 1 | 2 | 3,
        })),
      });

      setSuccess('Help ticket created.');
      setTitle('');
      setDescription('');
      setProposedSolutions(['']);
      setHelperId('');
      setHelperSearch('');

      // Fast flow: go back to dashboard.
      navigate('/help');
    } catch (err: any) {
      setError(err?.message || 'Failed to create help ticket');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate('/help')}>Back</Button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}
        {success && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{success}</div>}

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary (e.g. 'Need help with today's report')"
          maxLength={80}
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            placeholder="What do you need? Any context, screenshots, steps, links…"
          />
        </div>

        <div ref={helperRef} className="relative">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Assign Helper</label>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={helperOpen ? helperSearch : (helper ? `${helper.name}${helper.city ? ` · ${helper.city}` : ''}` : '')}
              onChange={(e) => { setHelperSearch(e.target.value); setHelperOpen(true); }}
              onFocus={() => setHelperOpen(true)}
              placeholder={loadingUsers ? 'Loading members...' : 'Search member by name, email, or city...'}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              disabled={loadingUsers}
            />
            <button
              type="button"
              onClick={() => setHelperOpen((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-slate-50 text-slate-500"
              aria-label="Toggle helper list"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {helperOpen && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-auto">
              {filteredHelpers.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No matches.</div>
              ) : (
                filteredHelpers.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => {
                      setHelperId(u.id);
                      setHelperSearch('');
                      setHelperOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-slate-50 ${
                      helperId === u.id ? 'bg-teal-50' : ''
                    }`}
                  >
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}{u.city ? ` · ${u.city}` : ''}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Proposed solutions</p>
              <p className="text-xs text-slate-500">Solution 1 is required. Add up to 3 total.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setProposedSolutions((prev) => (prev.length >= 3 ? prev : [...prev, '']))}
                disabled={proposedSolutions.length >= 3}
              >
                + Add solution
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {proposedSolutions.map((sol, idx) => (
              <div key={idx} className="flex flex-col md:flex-row gap-3 md:items-start">
                <div className="flex items-center gap-2 md:w-44">
                  <div className="h-8 w-8 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center font-semibold">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Priority {idx + 1}</p>
                    <p className="text-xs text-slate-500">{idx === 0 ? 'Required' : 'Optional'}</p>
                  </div>
                </div>

                <div className="flex-1">
                  <textarea
                    value={sol}
                    onChange={(e) => {
                      const v = e.target.value;
                      setProposedSolutions((prev) => prev.map((x, i) => (i === idx ? v : x)));
                    }}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                    placeholder={idx === 0 ? 'Write the main proposed solution…' : 'Optional…'}
                  />
                </div>

                <div className="md:w-32 flex md:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setProposedSolutions((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={idx === 0}
                    className="w-full md:w-auto"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="submit" isLoading={saving}>Create Ticket</Button>
        </div>
      </form>
    </div>
  );
};

