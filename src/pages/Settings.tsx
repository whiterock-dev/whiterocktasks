/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Holiday, Absence, UserRole } from '../types';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Calendar, ChevronDown, ChevronUp, Plus } from 'lucide-react';

const LIST_MAX_HEIGHT = 'min(20rem, 50vh)';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [absenceFrom, setAbsenceFrom] = useState('');
  const [absenceTo, setAbsenceTo] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(true);
  const [absencesOpen, setAbsencesOpen] = useState(true);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [showMarkAbsentModal, setShowMarkAbsentModal] = useState(false);

  const isManager = user?.role === UserRole.MANAGER || user?.role === UserRole.OWNER;

  useEffect(() => {
    api.getHolidays().then(setHolidays);
    api.getAbsences().then(setAbsences);
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate || !holidayName) return;
    setLoading(true);
    try {
      await api.addHoliday(holidayDate, holidayName);
      setHolidays(await api.getHolidays());
      setHolidayDate('');
      setHolidayName('');
      setShowAddHolidayModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      await api.deleteHoliday(id);
      setHolidays(await api.getHolidays());
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAbsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !absenceFrom || !absenceTo) return;
    setLoading(true);
    try {
      await api.addAbsence({
        user_id: user.id,
        user_name: user.name,
        from_date: absenceFrom,
        to_date: absenceTo,
        reason: absenceReason,
      });
      setAbsences(await api.getAbsences());
      setAbsenceFrom('');
      setAbsenceTo('');
      setAbsenceReason('');
      setShowMarkAbsentModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <section className="space-y-6">
        <div className="card overflow-hidden">
          <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Calendar size={20} className="text-slate-500" />
              Holidays & Absence
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Company holidays and personal absences. Tasks on these dates are excluded from KPI.
            </p>
          </div>

          <div className="p-6">
            {/* Holidays */}
            <div className="mb-8">
              <button
                type="button"
                onClick={() => setHolidaysOpen((o) => !o)}
                className="w-full flex items-center justify-between text-left py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <h3 className="font-semibold text-slate-800">
                  Holidays
                  <span className="text-sm font-normal text-slate-500 ml-2">({holidays.length})</span>
                </h3>
                {holidaysOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </button>
              {holidaysOpen && (
                <>
                  {isManager && (
                    <div className="mb-4">
                      <Button type="button" onClick={() => setShowAddHolidayModal(true)} size="sm">
                        <Plus size={16} className="mr-1.5" />
                        Add Holiday
                      </Button>
                    </div>
                  )}
                  <div
                    className="overflow-y-auto border border-slate-200 rounded-lg bg-white"
                    style={{ maxHeight: LIST_MAX_HEIGHT }}
                  >
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Date</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Name</th>
                          {isManager && <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {holidays.length === 0 ? (
                          <tr>
                            <td colSpan={isManager ? 3 : 2} className="py-8 px-4 text-center text-slate-500">
                              No holidays added yet.
                            </td>
                          </tr>
                        ) : (
                          holidays.map((h) => (
                            <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="py-2.5 px-4 text-slate-700">{h.date}</td>
                              <td className="py-2.5 px-4 font-medium text-slate-800">{h.name}</td>
                              {isManager && (
                                <td className="py-2.5 px-4 text-right">
                                  <Button size="sm" variant="danger" onClick={() => handleDeleteHoliday(h.id)}>
                                    Delete
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Absence */}
            <div>
              <button
                type="button"
                onClick={() => setAbsencesOpen((o) => !o)}
                className="w-full flex items-center justify-between text-left py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <h3 className="font-semibold text-slate-800">
                  Absence records
                  <span className="text-sm font-normal text-slate-500 ml-2">({absences.length})</span>
                </h3>
                {absencesOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </button>
              {absencesOpen && (
                <>
                  <div className="mb-4">
                    <Button type="button" onClick={() => setShowMarkAbsentModal(true)} size="sm">
                      <Plus size={16} className="mr-1.5" />
                      Mark myself absent
                    </Button>
                  </div>
                  <div
                    className="overflow-y-auto border border-slate-200 rounded-lg bg-white"
                    style={{ maxHeight: LIST_MAX_HEIGHT }}
                  >
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Member</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">From</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">To</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absences.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 px-4 text-center text-slate-500">
                              No absence records yet.
                            </td>
                          </tr>
                        ) : (
                          absences.map((a) => (
                            <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="py-2.5 px-4 font-medium text-slate-800">{a.user_name}</td>
                              <td className="py-2.5 px-4 text-slate-700">{a.from_date}</td>
                              <td className="py-2.5 px-4 text-slate-700">{a.to_date}</td>
                              <td className="py-2.5 px-4 text-slate-600">{a.reason || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {showAddHolidayModal && isManager && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Holiday</h3>
            <form onSubmit={handleAddHoliday} className="space-y-4">
              <Input
                label="Date"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
              />
              <Input
                label="Name"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                required
                placeholder="e.g. Diwali"
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={loading}>
                  Add Holiday
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAddHolidayModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMarkAbsentModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Mark myself absent</h3>
            <p className="text-sm text-slate-600 mb-4">Tasks during this period won&apos;t count in KPI.</p>
            <form onSubmit={handleMarkAbsent} className="space-y-4">
              <Input
                label="From Date"
                type="date"
                value={absenceFrom}
                onChange={(e) => setAbsenceFrom(e.target.value)}
                required
              />
              <Input
                label="To Date"
                type="date"
                value={absenceTo}
                onChange={(e) => setAbsenceTo(e.target.value)}
                required
              />
              <Input
                label="Reason (optional)"
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="Leave, sick, etc."
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={loading}>
                  Submit
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowMarkAbsentModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
