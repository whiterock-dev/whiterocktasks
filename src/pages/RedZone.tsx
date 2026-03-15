/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task } from '../types';
import { UserRole } from '../types';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';

export const RedZone: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    const assignedToId =
      user?.role === UserRole.DOER ? user?.id : undefined;
    const overdue = await api.getOverdueTasks({
      assignedToId,
      limitCount: 50,
    });
    setTasks(overdue);
    setLoading(false);
  };

  const isOwner = user?.role === UserRole.OWNER;
  const isManager = user?.role === UserRole.MANAGER;
  const isDoer = user?.role === UserRole.DOER;
  const filtered = isOwner
    ? tasks
    : isManager
    ? tasks
    : isDoer
    ? tasks.filter((t) => t.assigned_to_id === user?.id)
    : [];

  if (loading) return <div className="text-slate-500">Loading...</div>;

  if (filtered.length === 0 && !loading) {
    return (
      <div>
        <p className="text-red-800/80 text-sm mb-4">Tasks that are past their due date and not yet completed.</p>
        <div className="rounded-xl p-6 text-center text-green-800 bg-green-50 border border-green-200">
          No overdue tasks. Great job!
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-red-800/80 text-sm mb-4">Tasks that are past their due date and not yet completed.</p>
      {filtered.length === 0 ? (
        <div className="rounded-xl p-6 text-center text-green-800 bg-green-50 border border-green-200">
          No overdue tasks. Great job!
        </div>
      ) : (
        <div className="rounded-xl border-2 border-red-200 overflow-hidden bg-white shadow-sm">
          <h2 className="px-5 py-4 text-lg font-semibold text-white bg-red-600 border-b border-red-700">
            Overdue Follow-up
          </h2>
          <div className="divide-y divide-red-100">
            {filtered.map((t) => {
              const daysOverdue = Math.ceil(
                (new Date().getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <Link
                  key={t.id}
                  to={`/tasks?highlight=${t.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-red-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                    <User size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{t.assigned_to_name}</p>
                    <p className="text-sm text-slate-600 truncate">
                      {t.title} • Due {t.due_date} • <span className="font-medium text-red-600">{daysOverdue} day(s) overdue</span>
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-800 shrink-0">
                    {t.priority}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
