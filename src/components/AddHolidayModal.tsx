import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Sparkles, Users, User, Clock, Check } from 'lucide-react';
import { Employee, HolidayRecord } from '../types';
import { format } from 'date-fns';

interface AddHolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onSave: (records: Omit<HolidayRecord, 'id'>[]) => Promise<void>;
  preselectedEmployeeId?: string;
}

const COMMON_HOLIDAYS = [
  'Labor Day',
  'Thanksgiving Day',
  'Day After Thanksgiving',
  'Christmas Day',
  'Christmas Eve',
  'New Year\'s Day',
  'Memorial Day',
  'Independence Day',
  'Juneteenth',
  'Martin Luther King Jr. Day',
  'Presidents\' Day',
  'Veterans Day'
];

export const AddHolidayModal: React.FC<AddHolidayModalProps> = ({
  isOpen,
  onClose,
  employees,
  onSave,
  preselectedEmployeeId
}) => {
  const [recipientMode, setRecipientMode] = useState<'all' | 'single'>(preselectedEmployeeId ? 'single' : 'all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(preselectedEmployeeId || (employees[0]?.id || ''));
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [holidayName, setHolidayName] = useState<string>('Labor Day');
  const [hours, setHours] = useState<number>(8);
  const [note, setNote] = useState<string>('Paid Company Holiday');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const targetEmployees = recipientMode === 'all' 
    ? employees 
    : employees.filter(e => e.id === selectedEmployeeId);

  const totalCalculatedHours = targetEmployees.length * hours;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName.trim()) {
      alert('Please enter or select a holiday name.');
      return;
    }
    if (hours <= 0 || isNaN(hours)) {
      alert('Please enter a valid number of holiday hours.');
      return;
    }
    if (recipientMode === 'single' && !selectedEmployeeId) {
      alert('Please select an employee.');
      return;
    }

    setIsSubmitting(true);
    try {
      const recordsToCreate: Omit<HolidayRecord, 'id'>[] = targetEmployees.map(emp => ({
        employeeId: emp.id,
        employeeName: emp.name,
        date,
        holidayName: holidayName.trim(),
        hours: Number(hours),
        note: note.trim()
      }));

      await onSave(recordsToCreate);
      onClose();
    } catch (err: any) {
      console.error('Failed to create holiday hours:', err);
      alert('Error saving holiday hours: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl border border-indigo-100 overflow-hidden my-auto max-h-[95vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white relative flex justify-between items-start">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-amber-300 border border-white/10 shadow-inner">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black uppercase tracking-tight text-white">Record Holiday Hours</h2>
                <span className="bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                  Holiday Pay
                </span>
              </div>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-1">
                Designate company holiday compensation for reporting & payroll
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-indigo-200 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          {/* Recipient Mode Selection */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
              Credited Personnel Target
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRecipientMode('all')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  recipientMode === 'all'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Users size={16} />
                All Personnel ({employees.length})
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('single')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  recipientMode === 'single'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <User size={16} />
                Specific Personnel
              </button>
            </div>
          </div>

          {/* Individual Employee Selector */}
          {recipientMode === 'single' && (
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-fadeIn">
              <label className="text-[10px] font-black text-indigo-900 uppercase tracking-widest block mb-1.5">
                Select Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={e => setSelectedEmployeeId(e.target.value)}
                className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Holiday Date & Hours Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                Holiday Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                Holiday Hours Credited
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0.5"
                  max="24"
                  value={hours}
                  onChange={e => setHours(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 text-center outline-none focus:border-indigo-600 focus:bg-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setHours(4)}
                  className={`px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                    hours === 4 ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  4 hrs
                </button>
                <button
                  type="button"
                  onClick={() => setHours(8)}
                  className={`px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                    hours === 8 ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  8 hrs
                </button>
              </div>
            </div>
          </div>

          {/* Holiday Name & Presets */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
              Holiday Designation / Name
            </label>
            <input
              type="text"
              value={holidayName}
              onChange={e => setHolidayName(e.target.value)}
              placeholder="e.g., Labor Day, Thanksgiving, Christmas"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all"
              required
            />
            <div className="mt-2.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Quick Designation Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_HOLIDAYS.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHolidayName(h)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                      holidayName === h
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Manager Note */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
              Note / Reference
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g., Paid Company Holiday, Facility Closed"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-600 focus:bg-white transition-all"
            />
          </div>

          {/* Audit / Calculation Preview Banner */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between text-indigo-950">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-xs font-black">
                  {hours.toFixed(2)} hrs × {targetEmployees.length} personnel
                </p>
                <p className="text-[10px] text-indigo-700/80 font-medium">
                  {holidayName || 'Holiday'} • {date}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Total Credited</span>
              <span className="text-base font-black text-indigo-700">{totalCalculatedHours.toFixed(2)} hrs</span>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>Saving...</>
              ) : (
                <>
                  <Check size={14} />
                  Credit {hours.toFixed(1)} Holiday Hrs
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
