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
import { Button } from '../components/ui/Button';
import { Check, X, HelpCircle, ExternalLink, FileText } from 'lucide-react';

export const BogusAttachment: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewText, setViewText] = useState<string | null>(null);

  useEffect(() => {
    api.getBogusAttachmentTasks(50).then((t) => {
      setTasks(t);
      setLoading(false);
    });
  }, []);

  const handleAudit = async (taskId: string, status: 'audited' | 'bogus' | 'unclear') => {
    if (!user) return;
    try {
      await api.setAuditStatus(taskId, status, user.name);
      setTasks(await api.getBogusAttachmentTasks(50));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <p className="text-slate-500 text-sm mb-4">Review completed tasks with required attachments. Mark as audited, bogus, or unclear.</p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Task</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Assigned To</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Attachment Type</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">View</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-800">Status</th>
              <th className="text-right py-4 px-4 font-semibold text-slate-800">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                  No completed tasks with required attachments.
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-800">{t.title}</td>
                  <td className="py-3 px-4 text-slate-600">{t.assigned_to_name}</td>
                  <td className="py-3 px-4 text-slate-600">{t.attachment_description || '-'}</td>
                  <td className="py-3 px-4">
                    {t.attachment_url ? (
                      <a
                        href={t.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:underline text-sm inline-flex items-center gap-1"
                      >
                        <ExternalLink size={14} />
                        View
                      </a>
                    ) : t.attachment_text ? (
                      <button
                        type="button"
                        onClick={() => setViewText(t.attachment_text ?? '')}
                        className="text-teal-600 hover:underline text-sm inline-flex items-center gap-1"
                      >
                        <FileText size={14} />
                        View
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${t.audit_status === 'audited'
                          ? 'bg-green-100 text-green-800'
                          : t.audit_status === 'bogus'
                            ? 'bg-red-100 text-red-800'
                            : t.audit_status === 'unclear'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {t.audit_status || 'pending'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {(!t.audit_status || t.audit_status === 'pending') ? (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="success" onClick={() => handleAudit(t.id, 'audited')}>
                          <Check size={14} />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleAudit(t.id, 'bogus')}>
                          <X size={14} />
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleAudit(t.id, 'unclear')}>
                          <HelpCircle size={14} />
                        </Button>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewText !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewText(null)}>
          <div className="card p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Attachment</h3>
            <pre className="flex-1 overflow-auto text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-4 bg-slate-50">
              {viewText}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setViewText(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
