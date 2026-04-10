/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { HelpTicket, HelpTicketStatus, User, UserRole } from '../types';

const minutesBetween = (aIso: string, bIso: string): number | null => {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
};

export const HelpLogs: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === UserRole.OWNER;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HelpTicket[]>([]);
  const [error, setError] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [helperId, setHelperId] = useState('');
  const [doerId, setDoerId] = useState('');
  const [status, setStatus] = useState<HelpTicketStatus | ''>('');

  // Default sort: Rating high -> low
  const [sortBy, setSortBy] = useState<'rating' | 'resolution_time' | 'date'>('rating');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const setSort = (next: 'rating' | 'resolution_time' | 'date') => {
    setSortBy((prev) => {
      if (prev === next) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      // Single default direction across columns: desc
      setSortDirection('desc');
      return next;
    });
  };

  const SortIcon = ({ active }: { active: boolean }) => {
    if (!active) return <ArrowUpDown size={14} className="text-slate-300" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-teal-600" />
      : <ArrowDown size={14} className="text-teal-600" />;
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, t] = await Promise.all([
        api.getUsers(),
        api.getHelpTickets({
          helperId: helperId || undefined,
          doerId: doerId || undefined,
          status: status || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sortBy,
          sortDirection,
        }),
      ]);
      setUsers(u);
      setRows(t);
    } catch (e: any) {
      setError(e?.message || 'Failed to load help logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, helperId, doerId, status, dateFrom, dateTo, sortBy, sortDirection]);

  const helperOptions = useMemo(() => users, [users]);
  const doerOptions = useMemo(() => users, [users]);

  if (!user) return null;
  if (!isOwner) {
    return <div className="text-slate-500">Access denied. Only Owner can view Help Logs.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Filter by date/helper/doer/status and sort by rating, resolution time, or date.
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Helper</label>
            <select
              value={helperId}
              onChange={(e) => setHelperId(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            >
              <option value="">All</option>
              {helperOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Doer</label>
            <select
              value={doerId}
              onChange={(e) => setDoerId(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            >
              <option value="">All</option>
              {doerOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="rated">Rated</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 select-none">
                <th className="py-3 px-4 font-semibold text-slate-800 text-left">
                  <button
                    type="button"
                    onClick={() => setSort('date')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Date</span>
                    <SortIcon active={sortBy === 'date'} />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-left">Ticket</th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-left">Doer</th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-left">Helper</th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-center">
                  <button
                    type="button"
                    onClick={() => setSort('resolution_time')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 justify-center w-full"
                  >
                    <span>Resolution</span>
                    <SortIcon active={sortBy === 'resolution_time'} />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-800 text-center">
                  <button
                    type="button"
                    onClick={() => setSort('rating')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 justify-center w-full"
                  >
                    <span>Rating</span>
                    <SortIcon active={sortBy === 'rating'} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const mins = t.resolved_at ? minutesBetween(t.created_at, t.resolved_at) : null;
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{t.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{t.doer_name}</td>
                    <td className="py-3 px-4 text-slate-700">{t.helper_name}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{t.status}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{mins == null ? '—' : `${mins} min`}</td>
                    <td className="py-3 px-4 text-center text-slate-700">
                      {t.rating?.stars ? `${t.rating.stars}/5` : '—'}
                      {t.rating?.comment ? (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.rating.comment}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

