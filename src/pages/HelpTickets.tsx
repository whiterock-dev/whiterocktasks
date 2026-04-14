/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { HelpTicket, HelpTicketStatus } from '../types';

const StatusPill = ({ status }: { status: HelpTicketStatus }) => {
  const styles: Record<HelpTicketStatus, string> = {
    open: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
    resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rated: 'bg-teal-50 text-teal-700 border-teal-200',
  };
  const labels: Record<HelpTicketStatus, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    rated: 'Rated',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

const minutesBetween = (aIso: string, bIso: string): number | null => {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
};

const Stars = ({ value }: { value: number }) => {
  return (
    <span className="text-amber-500">
      {'★★★★★'.split('').map((ch, i) => (
        <span key={i} className={i < value ? 'opacity-100' : 'opacity-25'}>{ch}</span>
      ))}
    </span>
  );
};

export const HelpTickets: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [activeTab, setActiveTab] = useState<'assigned' | 'created'>('assigned');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [rateStars, setRateStars] = useState<Record<string, 1 | 2 | 3 | 4 | 5>>({});
  const [rateComment, setRateComment] = useState<Record<string, string>>({});

  const load = async () => {
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const all = await api.getHelpTickets();
      setTickets(all);
    } catch (e: any) {
      setError(e?.message || 'Failed to load help tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const assigned = useMemo(
    () => tickets.filter((t) => t.helper_id === user?.id).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [tickets, user?.id]
  );
  const created = useMemo(
    () => tickets.filter((t) => t.doer_id === user?.id).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [tickets, user?.id]
  );
  const createdPendingRatingCount = useMemo(
    () => created.filter((t) => t.status === 'resolved').length,
    [created]
  );

  const assignedPendingCount = useMemo(
    () => assigned.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    [assigned]
  );

  const list = activeTab === 'assigned' ? assigned : created;

  const setStatus = async (id: string, status: HelpTicketStatus) => {
    setSavingId(id);
    setError('');
    try {
      // Build a single update payload with status + optional helper note
      const note = noteDraft[id];
      const payload: Parameters<typeof api.updateHelpTicket>[1] = { status };
      if (status === 'resolved') {
        payload.resolved_at = new Date().toISOString();
      }
      if (note !== undefined) {
        payload.helper_note = note.trim() || null;
      }
      await api.updateHelpTicket(id, payload);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update ticket');
    } finally {
      setSavingId(null);
    }
  };

  const submitRating = async (id: string) => {
    setSavingId(id);
    setError('');
    try {
      const stars = rateStars[id] || 5;
      const comment = rateComment[id] || '';
      await api.rateHelpTicket(id, { stars, comment });
      await load();
      setExpandedId(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit rating');
    } finally {
      setSavingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Assigned to you and created by you. Rate tickets from the details after they are resolved.
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            <span className="inline-flex items-center gap-2"><RefreshCw size={16} /> Refresh</span>
          </Button>
          <Link to="/help/new">
            <Button><span className="inline-flex items-center gap-2"><ClipboardList size={16} /> Create Ticket</span></Button>
          </Link>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2">
        <div className="flex gap-2">
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'assigned' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setActiveTab('assigned')}
          >
            Assigned to me {assignedPendingCount > 0 ? `(${assignedPendingCount})` : ''}
          </button>
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'created' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setActiveTab('created')}
          >
            Created by me {createdPendingRatingCount > 0 ? `(${createdPendingRatingCount} to rate)` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          No tickets here yet.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => {
            const isExpanded = expandedId === t.id;
            const resolutionMins = t.resolved_at ? minutesBetween(t.created_at, t.resolved_at) : null;
            const canHelperAct = activeTab === 'assigned';
            const canEditHelperNote = canHelperAct && (t.status === 'open' || t.status === 'in_progress');
            const canRate = activeTab === 'created' && t.status === 'resolved';

            return (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                      <StatusPill status={t.status} />
                    </div>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                    <div className="text-xs text-slate-500 mt-2 flex flex-wrap gap-3">
                      <span>Doer: <span className="text-slate-700 font-medium">{t.doer_name}</span></span>
                      <span>Helper: <span className="text-slate-700 font-medium">{t.helper_name}</span></span>
                      {t.resolved_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={14} /> {resolutionMins == null ? '—' : `${resolutionMins} min`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 justify-end">
                    {activeTab !== 'assigned' && t.status === 'rated' && t.rating?.stars ? (
                      <span className="text-sm inline-flex items-center gap-2">
                        <Stars value={t.rating.stars} />
                        <span className="text-slate-500">({t.rating.stars}/5)</span>
                      </span>
                    ) : null}
                    <span className="text-slate-400 text-xs hidden md:inline">{new Date(t.created_at).toLocaleString()}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    >
                      {isExpanded ? 'Hide details' : 'View details'}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
                    {t.proposed_solutions && t.proposed_solutions.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-sm font-medium text-slate-700 mb-2">Proposed solutions</p>
                        <ul className="space-y-1 text-sm text-slate-700">
                          {t.proposed_solutions.map((s, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-slate-500">{s.priority ? `P${s.priority}` : '•'}</span>
                              <span className="flex-1">{s.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(t.helper_note || canHelperAct) && (
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Helper note</p>
                        <textarea
                          value={noteDraft[t.id] ?? (t.helper_note || '')}
                          onChange={(e) => setNoteDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          rows={3}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                          placeholder={canEditHelperNote ? 'Add what you tried / steps / final fix…' : ''}
                          disabled={!canEditHelperNote}
                        />
                      </div>
                    )}

                    {canHelperAct && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {(t.status === 'open' || t.status === 'in_progress') && (
                          <Button
                            variant="secondary"
                            onClick={() => setStatus(t.id, 'in_progress')}
                            isLoading={savingId === t.id}
                          >
                            Mark In Progress
                          </Button>
                        )}
                        {(t.status === 'open' || t.status === 'in_progress') && (
                          <Button
                            variant="success"
                            onClick={() => setStatus(t.id, 'resolved')}
                            isLoading={savingId === t.id}
                          >
                            <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> Resolved</span>
                          </Button>
                        )}
                      </div>
                    )}

                    {canRate && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-sm font-medium text-slate-700 mb-2">Rate the resolution</p>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => {
                              const current = rateStars[t.id] || 5;
                              const active = s <= current;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setRateStars((prev) => ({ ...prev, [t.id]: s as 1 | 2 | 3 | 4 | 5 }))}
                                  className={`h-9 w-9 rounded-lg border text-lg ${active ? 'border-amber-200 bg-white' : 'border-slate-200 bg-white'
                                    } hover:bg-slate-50`}
                                  aria-label={`Rate ${s} stars`}
                                >
                                  <span className={active ? 'text-amber-500' : 'text-slate-300'}>★</span>
                                </button>
                              );
                            })}
                          </div>
                          <span className="text-sm text-slate-600">{rateStars[t.id] || 5}/5</span>
                        </div>
                        <textarea
                          value={rateComment[t.id] ?? ''}
                          onChange={(e) => setRateComment((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          rows={3}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                          placeholder="Optional comment (not visible to helper)"
                        />
                        <div className="flex justify-end mt-2">
                          <Button onClick={() => submitRating(t.id)} isLoading={savingId === t.id}>
                            Submit rating
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeTab === 'assigned' && (t.rating?.stars || t.rating?.comment) && (
                      <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                        Rating is hidden from helpers.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

