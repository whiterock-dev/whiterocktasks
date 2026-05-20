/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { api } from '../services/api';

type VerifierRow = { verifier_id: string; verifier_name: string; count: number };

export const VerifierPending: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<VerifierRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isManagerOrOwner = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  useEffect(() => {
    if (!isManagerOrOwner) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api.getVerifierPendingCounts();
        setRows(data);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isManagerOrOwner]);

  if (!isManagerOrOwner) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-slate-500 text-sm">Access denied. This page is visible to Manager and Owner only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-500 text-sm -mt-4">Members assigned as verifier with tasks not yet verified or approved</p>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm font-medium">No pending verifications</p>
          <p className="text-slate-400 text-xs mt-1">All tasks have been verified or no tasks are awaiting verification.</p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse bg-white rounded-xl border border-slate-200 shadow-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50 border-b border-slate-200 select-none">
                <th className="py-4 px-4 font-semibold text-slate-800 text-left">#</th>
                <th className="py-4 px-4 font-semibold text-slate-800 text-left">Member Name</th>
                <th className="py-4 px-4 font-semibold text-slate-800 text-center">Pending Verifications</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.verifier_id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 text-sm text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-4 text-sm text-slate-800 font-medium">{row.verifier_name}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center justify-center min-w-8 h-7 px-2.5 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold">
                      {row.count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
