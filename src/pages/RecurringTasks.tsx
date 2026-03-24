import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Task, UserRole } from '../types';
import { Repeat } from 'lucide-react';

export const RecurringTasks: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const isDoer = user?.role === UserRole.DOER;
      const allActive = await api.getAllTasksByFilters({
        statusIn: ['pending', 'in_progress', 'overdue', 'pending_verification', 'correction_required'],
        ...(isDoer && user?.id ? { assignedTo: user.id } : {}),
      });
      setTasks(allActive.filter((t) => t.recurring !== 'none'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  const handleClosePermanently = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to permanently close this recurring task? It will never spawn again.')) return;
    try {
      await api.updateTask(taskId, { status: 'closed_permanently' });
      await loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto min-h-[50vh]">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading recurring tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center">
              <Repeat className="w-12 h-12 text-slate-300 mb-3" />
              <p>No active recurring tasks found.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Task</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Frequency</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Assigned To</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Next Due</th>
                  {isManager && <th className="px-4 py-3 font-medium text-slate-600 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">{t.title}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {t.recurring.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.assigned_to_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(t.due_date).toLocaleDateString('en-GB')}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleClosePermanently(t.id)}
                        >
                          Close Permanently
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
