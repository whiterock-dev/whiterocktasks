/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { api } from '../services/api';
import { computeKpiByMember } from '../lib/utils';
import { Task, User, UserRole } from '../types';
import { Button } from '../components/ui/Button';

export const Kpi: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [memberRows, setMemberRows] = useState<ReturnType<typeof computeKpiByMember>>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [allData, setAllData] = useState<{ tasks: Task[], holidays: any[], absences: any[], users: User[] } | null>(null);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const isOwner = user?.role === UserRole.OWNER;
  const isOwnerOrManager = user?.role === UserRole.OWNER || user?.role === UserRole.MANAGER;
  const isDoer = user?.role === UserRole.DOER;

  const initialTab = useMemo(() => {
    const p = new URLSearchParams(location.search);
    return p.get('tab') === 'help' ? 'help' : 'tasks';
  }, [location.search]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'help'>(initialTab);

  // --- Help KPI state (Owner only) ---
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState('');
  const [helpDateFrom, setHelpDateFrom] = useState('');
  const [helpDateTo, setHelpDateTo] = useState('');
  const [helpData, setHelpData] = useState<null | Awaited<ReturnType<typeof api.computeHelpKpis>>>(null);

  const loadHelpKpi = async () => {
    if (!isOwner) return;
    setHelpLoading(true);
    setHelpError('');
    try {
      const res = await api.computeHelpKpis({
        dateFrom: helpDateFrom || undefined,
        dateTo: helpDateTo || undefined,
      });
      setHelpData(res);
    } catch (e: any) {
      setHelpError(e?.message || 'Failed to load Help KPI');
    } finally {
      setHelpLoading(false);
    }
  };

  useEffect(() => {
    if (isOwnerOrManager && !isDoer && !sortConfig) {
      setSortConfig({ key: 'overdue_percent', direction: 'desc' });
    }
  }, [isDoer, isOwnerOrManager, sortConfig]);

  useEffect(() => {
    const fetchAll = async () => {
      const [tasks, holidays, absences, users] = await Promise.all([
        api.getTasks(),
        api.getHolidays(),
        api.getAbsences(),
        api.getUsers(),
      ]);
      setAllData({ tasks, holidays, absences, users });
    };
    fetchAll();
  }, []);

  useEffect(() => {
    if (!allData) return;

    let filteredTasks = allData.tasks;

    if (dateFilter !== 'all_time') {
      const today = new Date();
      let startStr = '';
      let endStr = '';

      const getFormattedDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      if (dateFilter === 'today') {
        startStr = getFormattedDate(today);
        endStr = startStr;
      } else if (dateFilter === 'yesterday') {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        startStr = getFormattedDate(y);
        endStr = startStr;
      } else if (dateFilter === 'last_7_days') {
        const past = new Date(today);
        past.setDate(past.getDate() - 7);
        startStr = getFormattedDate(past);
        endStr = getFormattedDate(today);
      } else if (dateFilter === 'last_30_days') {
        const past = new Date(today);
        past.setDate(past.getDate() - 30);
        startStr = getFormattedDate(past);
        endStr = getFormattedDate(today);
      } else if (dateFilter === 'custom') {
        startStr = customStart;
        endStr = customEnd;
      }

      if (startStr && endStr) {
        filteredTasks = filteredTasks.filter(t => t.due_date >= startStr && t.due_date <= endStr);
      } else if (startStr) {
        filteredTasks = filteredTasks.filter(t => t.due_date >= startStr);
      } else if (endStr) {
        filteredTasks = filteredTasks.filter(t => t.due_date <= endStr);
      }
    }

    setMemberRows(computeKpiByMember(filteredTasks, allData.holidays, allData.absences, allData.users));
    setLoading(false);
  }, [allData, dateFilter, customStart, customEnd, isOwner, user?.id]);

  useEffect(() => {
    if (activeTab !== 'help') return;
    if (!isOwner) return;
    if (helpData) return;
    loadHelpKpi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isOwner]);

  if (loading) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 mb-4">
        <div className="flex gap-2">
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'tasks' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks KPI
          </button>
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'help' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setActiveTab('help')}
          >
            Help KPI
          </button>
        </div>
      </div>

      {activeTab === 'help' ? (
        !isOwner ? (
          <div className="text-slate-500">Access denied. Only Owner can view Help KPIs.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                Doer-wise unresolved count, Helper-wise rating and resolution performance.
              </div>
              <Button variant="secondary" onClick={loadHelpKpi} disabled={helpLoading}>Refresh</Button>
            </div>

            {helpError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{helpError}</div>}

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
              <div className="flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
                  <input
                    type="date"
                    value={helpDateFrom}
                    onChange={(e) => setHelpDateFrom(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
                  <input
                    type="date"
                    value={helpDateTo}
                    onChange={(e) => setHelpDateTo(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                </div>
                <Button onClick={loadHelpKpi} isLoading={helpLoading}>Apply</Button>
              </div>
            </div>

            {helpLoading ? (
              <div className="text-slate-500">Loading...</div>
            ) : !helpData ? null : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Doer-wise</h3>
                    <p className="text-sm text-slate-500">Unresolved tickets count</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-3 px-4 font-semibold text-slate-800">Doer</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-800">Unresolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {helpData.doerWise.length === 0 ? (
                          <tr><td colSpan={2} className="py-4 px-4 text-slate-500">No data.</td></tr>
                        ) : helpData.doerWise.map((r) => (
                          <tr key={r.doer_id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4 text-slate-700">{r.doer_name}</td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-800">{r.unresolved_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Helper-wise</h3>
                    <p className="text-sm text-slate-500">Avg rating, total solved, avg resolution time</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-3 px-4 font-semibold text-slate-800">Helper</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-800">Avg rating</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-800">Solved</th>
                          <th className="text-center py-3 px-4 font-semibold text-slate-800">Avg mins</th>
                        </tr>
                      </thead>
                      <tbody>
                        {helpData.helperWise.length === 0 ? (
                          <tr><td colSpan={4} className="py-4 px-4 text-slate-500">No data.</td></tr>
                        ) : helpData.helperWise.map((r) => (
                          <tr key={r.helper_id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4 text-slate-700">{r.helper_name}</td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-800">{r.avg_rating == null ? '—' : r.avg_rating}</td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-800">{r.total_solved}</td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-800">{r.avg_resolution_minutes == null ? '—' : r.avg_resolution_minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      ) : null}

      {activeTab !== 'tasks' ? null : (
        <>
          {/* <p className="text-slate-600 mb-6">
            {isOwner ? 'Full team KPI.' : 'Your personal KPI.'} Tasks on holidays and during absence are excluded.
          </p> */}

          {/*
          One fold: Task distribution + summary metrics (preserved for future restore)
          <div className="mb-8 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Overview</h2>
            <div className="grid grid-cols-1 gap-6 items-start">
              <div>
                <h3 className="text-base font-medium text-slate-700 mb-3">Task Distribution (Pie Chart)</h3>
                <div className="h-56 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
                  Pie chart component placeholder
                </div>
              </div>
              <div>
                <h3 className="text-base font-medium text-slate-700 mb-3">Summary Metrics</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-800">Metric</th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-800">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((row) => (
                        <tr key={row.label} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-700">{row.label}</td>
                          <td className="py-2 px-3 text-right font-medium text-slate-800">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          */}

          {/* KPI by Member table below */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <h2 className="text-lg font-semibold text-slate-800">
          {isOwnerOrManager ? 'KPI by Member' : 'My KPI'}
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 select-none">
              {[
                { key: 'userName', label: 'Name', align: 'left' },
                ...(isDoer
                  ? [
                    { key: 'overdue_percent', label: 'Overdue %', align: 'center' },
                    { key: 'late_completion_percent', label: 'Late %', align: 'center' },
                  ]
                  : [
                    { key: 'city', label: 'City', align: 'left' },
                    { key: 'total_assigned', label: 'Total Assigned', align: 'center' },
                    { key: 'on_time_completed', label: 'On Time', align: 'center' },
                    { key: 'late_completed', label: 'Late', align: 'center' },
                    { key: 'overdue_count', label: 'Overdue', align: 'center' },
                    { key: 'overdue_percent', label: 'Overdue %', align: 'center' },
                    { key: 'late_completion_percent', label: 'Late %', align: 'center' },
                  ]),
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => {
                    let direction: 'asc' | 'desc' = 'asc';
                    if (sortConfig && sortConfig.key === col.key && sortConfig.direction === 'asc') direction = 'desc';
                    setSortConfig({ key: col.key, direction });
                  }}
                  className={`py-4 px-4 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    <span>{col.label}</span>
                    <span className="shrink-0">
                      {sortConfig?.key === col.key ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-teal-600" /> : <ArrowDown size={14} className="text-teal-600" />
                      ) : (
                        <ArrowUpDown size={14} className="text-slate-300" />
                      )}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...memberRows]
              .filter((r) => isOwner || r.userId === user?.id)
              .sort((a, b) => {
                const activeSort = sortConfig || (isOwnerOrManager && !isDoer ? { key: 'overdue_percent', direction: 'desc' as const } : null);
                if (!activeSort) return 0;
                const { key, direction } = activeSort;
                let valA = (a as any)[key];
                let valB = (b as any)[key];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
              })
              .map((row) => (
                <tr
                  key={row.userId}
                  onClick={() => {
                    if (!isDoer) {
                      navigate(`/redzone?assignedTo=${encodeURIComponent(row.userName)}`);
                    }
                  }}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${!isDoer ? 'cursor-pointer' : ''}`}
                >
                  <td className="py-3 px-4 font-medium text-slate-800">{row.userName}</td>
                  {!isDoer && <td className="py-3 px-4 text-slate-600">{row.city || '-'}</td>}
                  {!isDoer && <td className="py-3 px-4 text-center text-slate-700">{row.total_assigned}</td>}
                  {!isDoer && <td className="py-3 px-4 text-center text-green-600">{row.on_time_completed}</td>}
                  {!isDoer && <td className="py-3 px-4 text-center text-amber-600">{row.late_completed}</td>}
                  {!isDoer && <td className="py-3 px-4 text-center text-red-600">{row.overdue_count}</td>}
                  <td className="py-3 px-4 text-center font-medium text-red-600">{row.overdue_percent}%</td>
                  <td className="py-3 px-4 text-center font-medium text-slate-800">
                    {row.late_completion_percent}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
};
