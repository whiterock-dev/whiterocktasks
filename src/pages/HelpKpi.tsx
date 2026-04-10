/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { UserRole } from '../types';

export const HelpKpi: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === UserRole.OWNER;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<null | Awaited<ReturnType<typeof api.computeHelpKpis>>>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.computeHelpKpis({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to load KPIs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  if (!user) return null;
  if (!isOwner) return <div className="text-slate-500">Access denied. Only Owner can view Help KPIs.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Doer-wise unresolved count, Helper-wise rating and resolution performance.
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
          <Button onClick={load} isLoading={loading}>Apply</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : !data ? null : (
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
                  {data.doerWise.length === 0 ? (
                    <tr><td colSpan={2} className="py-4 px-4 text-slate-500">No data.</td></tr>
                  ) : data.doerWise.map((r) => (
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
                  {data.helperWise.length === 0 ? (
                    <tr><td colSpan={4} className="py-4 px-4 text-slate-500">No data.</td></tr>
                  ) : data.helperWise.map((r) => (
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
  );
};

