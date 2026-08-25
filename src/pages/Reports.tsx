import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, TaskStatus } from '../types';
import { api } from '../services/api';

import { Kpi } from './Kpi';
import { CompletedTasks } from './CompletedTasks';
import { TaskTable } from './TaskTable';
import { VerifierPending } from './VerifierPending';
import { AssignedByMe } from './AssignedByMe';
import { RedZone } from './RedZone';

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('');

  // Counts for tabs
  const [taskTableCount, setTaskTableCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [assignedByMeCount, setAssignedByMeCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const loadCounts = async () => {
      try {
        const openStatuses: TaskStatus[] = ['pending', 'overdue', 'cancelled', 'pending_verification', 'correction_required'];

        if (user.role === UserRole.OWNER || user.role === UserRole.MANAGER) {
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          const dueDateTo = yesterday.toISOString().split('T')[0];

          const [approval, taskTableAll, overdue] = await Promise.all([
            api.getTasksCount({
              status: 'pending_verification',
              verifierId: user.id,
            }),
            api.getTasksCount({
              statusIn: openStatuses,
            }),
            api.getTasksCount({
              statusIn: ['pending', 'overdue', 'pending_verification', 'correction_required'],
              dueDateTo,
            })
          ]);
          setPendingApprovalCount(approval);
          setTaskTableCount(taskTableAll);
          setOverdueCount(overdue);
        } else {
          // For DOER and others
          const assignedByMe = await api.getTasksCount({
            assignedBy: user.id,
            statusIn: openStatuses,
          });
          setAssignedByMeCount(assignedByMe);
        }
      } catch (err) {
        console.error('Failed to load counts:', err);
      }
    };

    loadCounts();
    const interval = setInterval(loadCounts, 60000);
    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  const isManagerOrOwner = user.role === UserRole.OWNER || user.role === UserRole.MANAGER;

  const tabs = isManagerOrOwner
    ? [
      { id: 'verification', label: `Verification Pending ${pendingApprovalCount > 0 ? `(${pendingApprovalCount})` : ''}` },
      { id: 'tasktable', label: `Task Table ${taskTableCount > 0 ? `(${taskTableCount})` : ''}` },
      { id: 'overdue', label: `Overdue ${overdueCount > 0 ? `(${overdueCount})` : ''}` },
      { id: 'kpi', label: 'KPI' },
      { id: 'completed', label: 'Completed Tasks' },
    ]
    : [
      { id: 'assignedbyme', label: `Assigned By Me ${assignedByMeCount > 0 ? `(${assignedByMeCount})` : ''}` },
      { id: 'kpi', label: 'KPI' },
      { id: 'completed', label: 'Completed Tasks' },
    ];

  // Set default tab if current is invalid
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
                }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === 'kpi' && <Kpi />}
        {activeTab === 'completed' && <CompletedTasks />}
        { activeTab === 'verification' && <VerifierPending /> }
        { activeTab === 'tasktable' && <TaskTable /> }
        { activeTab === 'overdue' && <RedZone /> }
        { activeTab === 'assignedbyme' && <AssignedByMe /> }
      </div>
    </div>
  );
};
