import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { api } from '../services/api';
import { computeKpi, computeKpiByMember } from '../lib/utils';
import { KpiMetrics, Task, User, UserRole } from '../types';

const PIE_COLORS = ['#14b8a6', '#22c55e', '#f59e0b', '#ef4444'];

export const Kpi: React.FC = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<KpiMetrics | null>(null);
  const [memberRows, setMemberRows] = useState<ReturnType<typeof computeKpiByMember>>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [allData, setAllData] = useState<{ tasks: Task[], holidays: any[], absences: any[], users: User[] } | null>(null);
  const [dateFilter, setDateFilter] = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const isOwner = user?.role === UserRole.OWNER;

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

    setMetrics(computeKpi(allData.tasks, allData.holidays, allData.absences, isOwner ? undefined : user?.id));
    setMemberRows(computeKpiByMember(filteredTasks, allData.holidays, allData.absences, allData.users));
    setLoading(false);
  }, [allData, dateFilter, customStart, customEnd, isOwner, user?.id]);

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!metrics) return null;

  const pieData = [
    { name: 'On Time Completed', value: metrics.on_time_completed, color: PIE_COLORS[0] },
    { name: 'Late Completed', value: metrics.late_completed, color: PIE_COLORS[1] },
    { name: 'Overdue', value: metrics.overdue_count, color: PIE_COLORS[2] },
    { name: 'Pending', value: Math.max(0, metrics.total_assigned - metrics.on_time_completed - metrics.late_completed - metrics.overdue_count), color: PIE_COLORS[3] },
  ].filter((d) => d.value > 0);

  const summaryRows = [
    { label: 'Total Assigned', value: metrics.total_assigned },
    { label: 'On Time Completed', value: metrics.on_time_completed },
    { label: 'Late Completed', value: metrics.late_completed },
    { label: 'Overdue Tasks', value: metrics.overdue_count },
    { label: 'Overdue %', value: `${metrics.overdue_percent}%` },
    { label: 'Late Completion %', value: `${metrics.late_completion_percent}%` },
  ];

  return (
    <div>
      <p className="text-slate-600 mb-6">
        {isOwner ? 'Full team KPI.' : 'Your personal KPI.'} Tasks on holidays and during absence are excluded.
      </p>

      {/* One fold: Task distribution + summary metrics */}
      <div className="mb-8 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {pieData.length > 0 && (
            <div>
              <h3 className="text-base font-medium text-slate-700 mb-3">Task Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className={pieData.length > 0 ? '' : 'lg:col-span-2'}>
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

      {/* KPI by Member table below */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <h2 className="text-lg font-semibold text-slate-800">
          {isOwner ? 'KPI by Member' : 'My KPI'}
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
                { key: 'city', label: 'City', align: 'left' },
                { key: 'total_assigned', label: 'Total Assigned', align: 'center' },
                { key: 'on_time_completed', label: 'On Time', align: 'center' },
                { key: 'late_completed', label: 'Late', align: 'center' },
                { key: 'overdue_count', label: 'Overdue', align: 'center' },
                { key: 'overdue_percent', label: 'Overdue %', align: 'center' },
                { key: 'late_completion_percent', label: 'Late %', align: 'center' }
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
                    <span className="flex-shrink-0">
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
                if (!sortConfig) return 0;
                const { key, direction } = sortConfig;
                let valA = (a as any)[key];
                let valB = (b as any)[key];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
              })
              .map((row) => (
                <tr key={row.userId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-800">{row.userName}</td>
                  <td className="py-3 px-4 text-slate-600">{row.city || '-'}</td>
                  <td className="py-3 px-4 text-center text-slate-700">{row.total_assigned}</td>
                  <td className="py-3 px-4 text-center text-green-600">{row.on_time_completed}</td>
                  <td className="py-3 px-4 text-center text-amber-600">{row.late_completed}</td>
                  <td className="py-3 px-4 text-center text-red-600">{row.overdue_count}</td>
                  <td className="py-3 px-4 text-center font-medium text-red-600">{row.overdue_percent}%</td>
                  <td className="py-3 px-4 text-center font-medium text-slate-800">
                    {row.late_completion_percent}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
