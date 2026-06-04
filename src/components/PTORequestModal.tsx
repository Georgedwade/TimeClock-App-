import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Employee } from '../types';
import { firebaseService } from '../services/firebaseService';
import { notificationService } from '../services/notificationService';
import { cn } from '../lib/utils';

interface PTORequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSuccess: (message: string) => void;
}

export const PTORequestModal: React.FC<PTORequestModalProps> = ({ isOpen, onClose, employee, onSuccess }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState<number>(8);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError('Please select both start and end dates.');
      return;
    }

    if (hours <= 0) {
      setError('Please enter a valid amount of hours.');
      return;
    }

    if (hours > (employee.ptoBalance || 0)) {
      setError(`Insufficient balance. You only have ${(employee.ptoBalance || 0).toFixed(2)} hours available.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData = {
        employeeId: employee.id,
        employeeName: employee.name,
        startDate,
        endDate,
        hoursRequested: hours,
        status: 'pending' as const,
        note
      };
      
      await firebaseService.addPTORequest(requestData);
      
      // Notify managers
      const allEmployees = await firebaseService.getEmployees();
      const managers = allEmployees.filter(emp => emp.role === 'manager');
      await notificationService.notifyManagersOfPTORequest(requestData, managers);

      onSuccess(`PTO request for ${hours} hours submitted successfully.`);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zrg-navy/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-zrg-lightblue/20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-zrg-blue rounded-xl flex items-center justify-center text-white">
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-zrg-navy uppercase tracking-tight">Request PTO</h2>
              <p className="text-[10px] text-zrg-blue font-bold uppercase tracking-widest mt-1">Available: {(employee.ptoBalance || 0).toFixed(2)} Hrs</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-300">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-zrg-orange/10 border border-zrg-orange/20 rounded-xl flex items-center gap-3 text-zrg-orange text-xs font-bold uppercase">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Start Date</label>
              <input 
                type="date" 
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">End Date</label>
              <input 
                type="date" 
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Hours to Apply</label>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest",
                hours > (employee.ptoBalance || 0) ? "text-zrg-orange" : "text-zrg-green"
              )}>
                {hours > (employee.ptoBalance || 0) ? 'Balance Exceeded' : 'Balance OK'}
              </span>
            </div>
            <input 
              type="number" 
              step="0.01"
              required
              value={hours}
              onChange={e => setHours(parseFloat(e.target.value))}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all tabular-nums"
              placeholder="8.00"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Note (Optional)</label>
            <textarea 
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all min-h-[100px] resize-none"
              placeholder="e.g. Family vacation, medical appointment..."
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || hours > (employee.ptoBalance || 0)}
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-zrg-blue/20 disabled:bg-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
            {!isSubmitting && <CheckCircle2 size={16} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
