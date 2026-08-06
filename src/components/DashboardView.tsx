import React, { useState, useEffect, useMemo } from 'react';
import { supabaseService, safeLocalStorage } from '../services/supabaseService';
import { notificationService } from '../services/notificationService';
import { TimeLog, Employee, LogType, PTORequest } from '../types';
import { 
  Users, 
  History, 
  FileSpreadsheet, 
  Settings, 
  UserPlus, 
  Calendar,
  Clock,
  ArrowLeft,
  ChevronRight,
  Search,
  Filter,
  Download,
  AlertTriangle,
  Building2,
  Edit2,
  Trash2,
  X,
  FileText,
  Plus,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RegisterEmployeeModal } from './RegisterEmployeeModal';
import { ReportView } from './ReportView';
import { cn, formatDate, formatTime } from '../lib/utils';
import { differenceInMinutes, subDays, format } from 'date-fns';
import Papa from 'papaparse';

const logTypePriority: Record<LogType, number> = {
  [LogType.CLOCK_IN]: 1,
  [LogType.BREAK_START]: 2,
  [LogType.BREAK_END]: 3,
  [LogType.CLOCK_OUT]: 4
};

interface EditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: TimeLog | null;
  onSave: (id: string, data: Partial<TimeLog>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EditLogModal: React.FC<EditLogModalProps> = ({ isOpen, onClose, log, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Partial<TimeLog>>({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (log) {
      setFormData({
        ...log,
        // Ensure timestamp is formatted for datetime-local input
        timestamp: log.timestamp
      });
    }
    setIsConfirmingDelete(false);
  }, [log]);

  if (!isOpen || !log) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        <div className="p-8 border-b flex justify-between items-center text-zrg-navy">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Edit Record</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{log.employeeName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Punch Type</label>
            <select 
              value={formData.type || ''} 
              onChange={e => setFormData({ ...formData, type: e.target.value as LogType })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all appearance-none cursor-pointer"
            >
              <option value={LogType.CLOCK_IN}>CLOCK IN</option>
              <option value={LogType.BREAK_START}>BREAK START</option>
              <option value={LogType.BREAK_END}>BREAK END</option>
              <option value={LogType.CLOCK_OUT}>CLOCK OUT</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Timestamp</label>
            <input 
              type="datetime-local" 
              value={formData.timestamp ? format(formData.timestamp, "yyyy-MM-dd'T'HH:mm") : ''} 
              onChange={e => {
                const date = new Date(e.target.value);
                if (!isNaN(date.getTime())) {
                  setFormData({ ...formData, timestamp: date });
                }
              }}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Manager Note</label>
            <textarea 
              value={formData.note || ''} 
              onChange={e => setFormData({ ...formData, note: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all min-h-[100px] resize-none"
              placeholder="Explain why this record was modified..."
            />
          </div>
        </div>

        <div className="p-8 bg-slate-50 flex flex-col gap-3">
          <button 
            disabled={isConfirmingDelete}
            onClick={() => onSave(log.id!, formData)}
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-zrg-blue/20 disabled:opacity-50"
          >
            Update Record
          </button>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 bg-white border border-slate-200 text-slate-400 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                if (!isConfirmingDelete) {
                  setIsConfirmingDelete(true);
                  setTimeout(() => setIsConfirmingDelete(false), 3000);
                } else {
                  onDelete(log.id!);
                }
              }}
              className={cn(
                "flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
                isConfirmingDelete 
                  ? "bg-zrg-orange text-white animate-pulse" 
                  : "bg-zrg-orange/10 text-zrg-orange hover:bg-zrg-orange/20"
              )}
            >
              {isConfirmingDelete ? 'Confirm?' : 'Delete'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

interface ShiftSummary {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: TimeLog;
  clockOut: TimeLog | null;
  breaks: { start: TimeLog, end: TimeLog | null }[];
  totalBreakMinutes: number;
  totalWorkedMinutes: number;
  allLogs: TimeLog[];
}

interface ManualShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onSubmit: (logs: Omit<TimeLog, 'id'>[], oldLogIds?: string[]) => Promise<void>;
  initialShift?: ShiftSummary | null;
}

const ManualShiftModal: React.FC<ManualShiftModalProps> = ({ isOpen, onClose, employees, onSubmit, initialShift }) => {
  const [formData, setFormData] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    clockInTime: '08:00',
    clockOutTime: '17:00',
    breakStartTime: '',
    breakEndTime: '',
    note: ''
  });

  useEffect(() => {
    if (initialShift) {
      const clockIn = initialShift.clockIn;
      const clockOut = initialShift.clockOut;
      const breakStart = initialShift.breaks[0]?.start;
      const breakEnd = initialShift.breaks[0]?.end;

      setFormData({
        employeeId: initialShift.employeeId,
        date: format(clockIn.timestamp, 'yyyy-MM-dd'),
        clockInTime: format(clockIn.timestamp, 'HH:mm'),
        clockOutTime: clockOut ? format(clockOut.timestamp, 'HH:mm') : '17:00',
        breakStartTime: breakStart ? format(breakStart.timestamp, 'HH:mm') : '',
        breakEndTime: breakEnd ? format(breakEnd.timestamp, 'HH:mm') : '',
        note: clockIn.note || ''
      });
    } else {
      setFormData({
        employeeId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        clockInTime: '08:00',
        clockOutTime: '17:00',
        breakStartTime: '',
        breakEndTime: '',
        note: ''
      });
    }
  }, [initialShift]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find(emp => emp.id === formData.employeeId);
    if (!employee) {
      alert('Please select an employee');
      return;
    }

    const logs: Omit<TimeLog, 'id'>[] = [];
    
    const createLog = (time: string, type: LogType) => {
      if (!time) return;
      const [year, month, day] = formData.date.split('-').map(Number);
      const [hours, minutes] = time.split(':').map(Number);
      const timestamp = new Date(year, month - 1, day, hours, minutes, 0, 0);
      
      logs.push({
        employeeId: formData.employeeId,
        employeeName: employee.name,
        type,
        timestamp,
        photoUrl: '', // Manual entries don't have a photo
        note: formData.note || 'Manually entered shift'
      });
    };

    // Add logs in logical order
    createLog(formData.clockInTime, LogType.CLOCK_IN);
    if (formData.breakStartTime) createLog(formData.breakStartTime, LogType.BREAK_START);
    if (formData.breakEndTime) createLog(formData.breakEndTime, LogType.BREAK_END);
    createLog(formData.clockOutTime, LogType.CLOCK_OUT);

    // Sort logs by timestamp and logical chronological order just in case
    logs.sort((a, b) => {
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      const prioA = logTypePriority[a.type as LogType] || 0;
      const prioB = logTypePriority[b.type as LogType] || 0;
      return prioA - prioB;
    });

    const oldLogIds = initialShift?.allLogs.map(l => l.id).filter((id): id is string => !!id);
    await onSubmit(logs, oldLogIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl relative"
      >
        <div className="p-8 border-b flex justify-between items-center text-zrg-navy">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">{initialShift ? 'Edit Full Shift' : 'Add Full Shift'}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              {initialShift ? `Modifying records for ${initialShift.employeeName}` : 'Record a complete shift history'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Personnel</label>
              <select 
                required
                value={formData.employeeId}
                onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all appearance-none cursor-pointer"
              >
                <option value="">SELECT EMPLOYEE...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Shift Date</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-zrg-green uppercase tracking-widest block mb-1">Clock In</label>
              <input 
                type="time" 
                required
                value={formData.clockInTime}
                onChange={e => setFormData({ ...formData, clockInTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-zrg-orange uppercase tracking-widest block mb-1">Clock Out</label>
              <input 
                type="time" 
                required
                value={formData.clockOutTime}
                onChange={e => setFormData({ ...formData, clockOutTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-zrg-teal uppercase tracking-widest block mb-1">Break Start (Optional)</label>
              <input 
                type="time" 
                value={formData.breakStartTime}
                onChange={e => setFormData({ ...formData, breakStartTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>

            <div>
              <label className="text-[9px] font-black text-zrg-teal uppercase tracking-widest block mb-1">Break End (Optional)</label>
              <input 
                type="time" 
                value={formData.breakEndTime}
                onChange={e => setFormData({ ...formData, breakEndTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Note</label>
            <textarea 
              value={formData.note}
              onChange={e => setFormData({ ...formData, note: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all min-h-[80px] resize-none"
              placeholder="Manager notes regarding this manual entry..."
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-zrg-blue/20"
          >
            {initialShift ? 'Save Shift Changes' : 'Create All Records'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};


interface ManualPTOModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onSubmit: (request: Omit<PTORequest, 'id'>) => Promise<void>;
}

const ManualPTOModal: React.FC<ManualPTOModalProps> = ({ isOpen, onClose, employees, onSubmit }) => {
  const [formData, setFormData] = useState({
    employeeId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    hoursRequested: 8,
    note: '',
    managerNote: 'Manually entered by manager',
    status: 'approved' as const
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find(emp => emp.id === formData.employeeId);
    if (!employee) {
      alert('Please select an employee');
      return;
    }

    await onSubmit({
      ...formData,
      employeeName: employee.name,
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        <div className="p-8 border-b flex justify-between items-center text-zrg-navy">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Manual PTO Entry</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Record leave on behalf of personnel</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Select Employee</label>
            <select 
              required
              value={formData.employeeId}
              onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all appearance-none cursor-pointer"
            >
              <option value="">SELECT PERSONNEL...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Start Date</label>
              <input 
                type="date" 
                required
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-[11px] outline-none focus:border-zrg-blue transition-all"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">End Date</label>
              <input 
                type="date" 
                required
                value={formData.endDate}
                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-[11px] outline-none focus:border-zrg-blue transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Hours Applied</label>
              <input 
                type="number" 
                required
                step="0.5"
                value={formData.hoursRequested}
                onChange={e => setFormData({ ...formData, hoursRequested: parseFloat(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all tabular-nums"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Initial Status</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-[11px] outline-none focus:border-zrg-blue transition-all appearance-none"
              >
                <option value="approved">APPROVED</option>
                <option value="pending">PENDING</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Reason/Note</label>
            <textarea 
              value={formData.note}
              onChange={e => setFormData({ ...formData, note: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all min-h-[80px] resize-none"
              placeholder="e.g. Email request on 05/14..."
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-zrg-blue/20"
          >
            Create Record
          </button>
        </form>
      </motion.div>
    </div>
  );
};

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSave: (data: Partial<Employee>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({ isOpen, onClose, employee, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Partial<Employee>>({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (employee) {
      setFormData(employee);
    }
    setIsConfirmingDelete(false);
  }, [employee]);

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative"
      >
        <div className="p-8 border-b flex justify-between items-center text-zrg-navy">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Edit Profile</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{employee.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Display Name</label>
            <input 
              type="text" 
              value={formData.name || ''} 
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Email Address</label>
            <input 
              type="email" 
              value={formData.email || ''} 
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Job Title</label>
            <input 
              type="text" 
              value={formData.title || ''} 
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">PIN Code</label>
              <input 
                type="text" 
                maxLength={6}
                value={formData.pin || ''} 
                onChange={e => setFormData({ ...formData, pin: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all tabular-nums"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">PTO Balance</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.ptoBalance || 0} 
                onChange={e => setFormData({ ...formData, ptoBalance: parseFloat(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 flex flex-col gap-3">
          <button 
            disabled={isConfirmingDelete}
            onClick={() => onSave(formData)}
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-zrg-blue/20 disabled:opacity-50"
          >
            Save Changes
          </button>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 bg-white border border-slate-200 text-slate-400 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                if (!isConfirmingDelete) {
                  setIsConfirmingDelete(true);
                  setTimeout(() => setIsConfirmingDelete(false), 3000);
                } else {
                  onDelete(employee.id);
                }
              }}
              className={cn(
                "flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
                isConfirmingDelete 
                  ? "bg-zrg-orange text-white animate-pulse" 
                  : "bg-zrg-orange/10 text-zrg-orange hover:bg-zrg-orange/20"
              )}
            >
              {isConfirmingDelete ? 'Confirm?' : 'Delete'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

interface DashboardViewProps {
  onBack: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'reports' | 'pto' | 'personnel' | 'settings'>('status');
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ptoRequests, setPtoRequests] = useState<PTORequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isManualPTOModalOpen, setIsManualPTOModalOpen] = useState(false);
  const [isManualShiftModalOpen, setIsManualShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftSummary | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [requirePhotoVerification, setRequirePhotoVerification] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // PTO Filter & Search State
  const [ptoSearchQuery, setPtoSearchQuery] = useState('');
  const [ptoEmployeeFilter, setPtoEmployeeFilter] = useState('ALL');
  const [ptoStatusFilter, setPtoStatusFilter] = useState('ALL');
  const [ptoViewMode, setPtoViewMode] = useState<'table' | 'cards'>('table');
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    mailtoUrl?: string;
    recipient?: string;
  } | null>(null);

  // PTO Decision Modal State
  const [ptoDecisionTarget, setPtoDecisionTarget] = useState<{ request: PTORequest; action: 'approve' | 'deny' } | null>(null);
  const [ptoDecisionNote, setPtoDecisionNote] = useState('');
  const [ptoEmployeeEmail, setPtoEmployeeEmail] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const [hasLocalData, setHasLocalData] = useState(false);
  const [localDataCounts, setLocalDataCounts] = useState({ employees: 0, logs: 0, ptoRequests: 0 });
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ employees: number; logs: number; ptoRequests: number } | null>(null);

  useEffect(() => {
    try {
      const rawEmps = safeLocalStorage.getItem('zrg_employees');
      const rawLogs = safeLocalStorage.getItem('zrg_logs');
      const rawPto = safeLocalStorage.getItem('zrg_pto_requests');

      const safeParseArray = (str: string | null) => {
        if (!str) return [];
        try {
          const parsed = JSON.parse(str);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      const emps = safeParseArray(rawEmps);
      const lgs = safeParseArray(rawLogs);
      const pto = safeParseArray(rawPto);

      if (lgs.length > 0 || pto.length > 1 || emps.length > 8) {
        setHasLocalData(true);
        setLocalDataCounts({
          employees: emps.length,
          logs: lgs.length,
          ptoRequests: pto.length
        });
      }
    } catch (e) {
      console.error('Error checking local storage data:', e);
    }
  }, []);

  const handleExportDataFile = () => {
    try {
      const rawEmps = safeLocalStorage.getItem('zrg_employees');
      const rawLogs = safeLocalStorage.getItem('zrg_logs');
      const rawPto = safeLocalStorage.getItem('zrg_pto_requests');
      const rawSettings = safeLocalStorage.getItem('zrg_settings');

      const safeParseArray = (str: string | null) => {
        if (!str) return [];
        try {
          const parsed = JSON.parse(str);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      const backup = {
        employees: safeParseArray(rawEmps),
        logs: safeParseArray(rawLogs),
        pto_requests: safeParseArray(rawPto),
        settings: rawSettings ? JSON.parse(rawSettings) : null,
        exportedAt: new Date().toISOString()
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `zrg_timecard_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      alert('Failed to export backup file: ' + e);
    }
  };

  const handleImportDataFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        if (!backup || (!backup.employees && !backup.logs && !backup.pto_requests)) {
          alert('Invalid backup file structure.');
          return;
        }

        setIsMigrating(true);
        const res = await supabaseService.importBackupData(backup);
        if (res.success) {
          alert(`Success! Imported:\n- ${res.count.employees} employees\n- ${res.count.logs} time logs\n- ${res.count.pto_requests} PTO requests`);
          e.target.value = '';
        }
      } catch (err: any) {
        alert('Failed to import backup file: ' + (err.message || err));
      } finally {
        setIsMigrating(false);
      }
    };
    reader.readAsText(file);
  };

  const handleMigrateLocalDataToSupabase = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const rawEmps = safeLocalStorage.getItem('zrg_employees');
      const rawLogs = safeLocalStorage.getItem('zrg_logs');
      const rawPto = safeLocalStorage.getItem('zrg_pto_requests');
      const rawSettings = safeLocalStorage.getItem('zrg_settings');

      const safeParseArray = (str: string | null) => {
        if (!str) return [];
        try {
          const parsed = JSON.parse(str);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      const backup = {
        employees: safeParseArray(rawEmps),
        logs: safeParseArray(rawLogs),
        pto_requests: safeParseArray(rawPto),
        settings: rawSettings ? JSON.parse(rawSettings) : null
      };

      const res = await supabaseService.importBackupData(backup);
      if (res.success) {
        setMigrationResult(res.count);
        setHasLocalData(false);
        alert(`Successfully migrated browser-local data to Firebase Cloud Database!\n\nImport statistics:\n- ${res.count.employees} Employees added\n- ${res.count.logs} Time Logs / Punches added\n- ${res.count.pto_requests} PTO Requests added`);
      }
    } catch (err: any) {
      alert('Migration failed: ' + (err.message || err));
    } finally {
      setIsMigrating(false);
    }
  };

  useEffect(() => {
    const unsubLogs = supabaseService.subscribeToLogs(setLogs);
    const unsubEmployees = supabaseService.subscribeToEmployees(setEmployees);
    const unsubPTO = supabaseService.subscribeToPTORequests(setPtoRequests);
    const unsubSettings = supabaseService.subscribeToSettings((s) => {
      setRequirePhotoVerification(s.requirePhotoVerification);
    });
    return () => {
      unsubLogs();
      unsubEmployees();
      unsubPTO();
      unsubSettings();
    };
  }, []);


  const openApproveModal = (request: PTORequest) => {
    const emp = employees.find(e => e.id === request.employeeId);
    const defaultEmail = emp?.email || request.employeeEmail || (request.employeeName ? `${request.employeeName.toLowerCase().replace(/\s+/g, '.')}@zrgmedical.com` : 'dylan@zrgmedical.com');
    setPtoDecisionTarget({ request, action: 'approve' });
    setPtoDecisionNote('Approved');
    setPtoEmployeeEmail(defaultEmail);
  };

  const openDenyModal = (request: PTORequest) => {
    const emp = employees.find(e => e.id === request.employeeId);
    const defaultEmail = emp?.email || request.employeeEmail || (request.employeeName ? `${request.employeeName.toLowerCase().replace(/\s+/g, '.')}@zrgmedical.com` : 'dylan@zrgmedical.com');
    setPtoDecisionTarget({ request, action: 'deny' });
    setPtoDecisionNote('Request denied by management');
    setPtoEmployeeEmail(defaultEmail);
  };

  const confirmPTODecision = async () => {
    if (!ptoDecisionTarget || !ptoDecisionTarget.request.id) return;
    const { request, action } = ptoDecisionTarget;
    setIsSubmittingDecision(true);

    try {
      const isApprove = action === 'approve';
      const finalStatus = isApprove ? 'approved' : 'rejected';
      const finalNote = ptoDecisionNote.trim() || (isApprove ? 'Approved' : 'Request denied');

      // 1. Update status in database
      await supabaseService.updatePTORequestStatus(request.id, finalStatus, finalNote);

      // 2. Subtract from employee balance if approved
      if (isApprove) {
        await supabaseService.updateEmployeePTO(request.employeeId, -request.hoursRequested);
      }

      // 3. Update employee email if provided & employee exists
      let employee = employees.find(emp => emp.id === request.employeeId);
      if (employee && ptoEmployeeEmail && employee.email !== ptoEmployeeEmail) {
        employee = { ...employee, email: ptoEmployeeEmail };
        await supabaseService.updateEmployee(employee.id, { email: ptoEmployeeEmail });
      }

      // 4. Send email notification
      const updatedReq = { ...request, status: finalStatus as any, managerNote: finalNote };
      const dispatchResult = await notificationService.notifyEmployeeOfPTOStatus(
        updatedReq, 
        employee || {
          id: request.employeeId,
          name: request.employeeName,
          email: ptoEmployeeEmail || request.employeeEmail || 'dylan@zrgmedical.com',
          pin: '',
          role: 'staff'
        }
      );

      // 5. Toast feedback
      setToastNotification({
        message: `PTO Request ${isApprove ? 'Approved' : 'Denied'}! Email dispatched to ${dispatchResult.recipient}.`,
        mailtoUrl: dispatchResult.mailtoUrl,
        recipient: dispatchResult.recipient
      });

      setPtoDecisionTarget(null);
    } catch (err) {
      console.error('PTO decision error:', err);
      alert('Failed to process PTO request update. Please try again.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handleTogglePhotoVerification = async (checked: boolean) => {
    setIsSavingSettings(true);
    try {
      await supabaseService.updateSettings(checked);
    } catch (err) {
      console.error('Failed to update config settings:', err);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdatePTO = async (employeeId: string, employeeName: string) => {
    const amountStr = prompt(`Add PTO hours for ${employeeName}:`, '8');
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      alert('Please enter a valid number');
      return;
    }

    try {
      await supabaseService.updateEmployeePTO(employeeId, amount);
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update PTO balance');
    }
  };

  const handleUpdateRole = async (employeeId: string, currentRole: string) => {
    const newRole = currentRole === 'manager' ? 'staff' : 'manager';
    // Removed window.confirm for reliability in iframe
    try {
      await supabaseService.updateEmployeeRole(employeeId, newRole);
    } catch (err) {
      console.error('Role update failed:', err);
      alert('Failed to update role');
    }
  };

  const handleSaveEmployee = async (data: Partial<Employee>) => {
    if (!editingEmployee?.id) return;
    try {
      await supabaseService.updateEmployee(editingEmployee.id, data);
      setEditingEmployee(null);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save changes');
    }
  };

  const handleRegisterEmployee = async (employeeData: Omit<Employee, 'id'>) => {
    const isPinDuplicate = employees.some(emp => emp.pin === employeeData.pin);
    if (isPinDuplicate) {
      throw new Error('This PIN is already assigned to another employee. Please choose a unique 6-digit numeric PIN.');
    }

    try {
      await supabaseService.addEmployee(employeeData);
      setIsRegisterModalOpen(false);
    } catch (err) {
      console.error('Registration failed:', err);
      throw err;
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!id) {
      console.error('No employee ID provided for deletion');
      alert('Error: Missing Employee ID');
      return;
    }
    
    console.log('Finalizing deletion for employee ID:', id);
    try {
      await supabaseService.deleteEmployee(id);
      console.log('Successfully deleted employee record:', id);
      setEditingEmployee(null);
      setConfirmingDeleteId(null);
    } catch (err) {
      console.error('Delete operation failed globally:', err);
      alert('Deletion Failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSaveLog = async (id: string, data: Partial<TimeLog>) => {
    try {
      await supabaseService.updateLog(id, data);
      setEditingLog(null);
    } catch (err) {
      console.error('Save log failed:', err);
      alert('Failed to save log changes');
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await supabaseService.deleteLog(id);
      setEditingLog(null);
    } catch (err) {
      console.error('Delete log failed:', err);
      alert('Failed to delete log record');
    }
  };

  const handleDeletePTO = async (id: string) => {
    try {
      await supabaseService.deletePTORequest(id);
      setConfirmingDeleteId(null);
    } catch (err) {
      console.error('Delete PTO failed:', err);
      alert('Failed to delete PTO record');
    }
  };

  const handleAddManualPTO = async (request: Omit<PTORequest, 'id'>) => {
    try {
      await supabaseService.addPTORequest(request);
      if (request.status === 'approved') {
        // If it's already approved, subtract hours immediately
        await supabaseService.updateEmployeePTO(request.employeeId, -request.hoursRequested);
      }

      // 1. Always notify dylan@zrgmedical.com
      const managerResults = await notificationService.notifyManagersOfPTORequest(
        request, 
        employees.filter(e => e.role === 'manager')
      );

      // 2. If employee exists and request is approved or rejected, notify employee
      const employee = employees.find(e => e.id === request.employeeId);
      if (employee && (request.status === 'approved' || request.status === 'rejected')) {
        await notificationService.notifyEmployeeOfPTOStatus(request, employee);
      }

      setToastNotification({
        message: `PTO Record created. Notification email sent to dylan@zrgmedical.com.`,
        mailtoUrl: managerResults[0]?.mailtoUrl,
        recipient: 'dylan@zrgmedical.com'
      });
    } catch (err) {
      console.error('Manual PTO entry failed:', err);
      alert('Failed to record PTO entry');
    }
  };

  const handleSendEmailNotice = async (request: PTORequest) => {
    const employee = employees.find(e => e.id === request.employeeId);
    if (request.status === 'pending') {
      const res = await notificationService.notifyManagersOfPTORequest(request, employees.filter(e => e.role === 'manager'));
      setToastNotification({
        message: `Notification email dispatched to dylan@zrgmedical.com for ${request.employeeName}'s PTO request.`,
        mailtoUrl: res[0]?.mailtoUrl,
        recipient: 'dylan@zrgmedical.com'
      });
    } else {
      const res = await notificationService.notifyEmployeeOfPTOStatus(request, employee || {
        id: request.employeeId,
        name: request.employeeName,
        email: request.employeeEmail || 'dylan@zrgmedical.com',
        pin: '',
        role: 'staff'
      });
      setToastNotification({
        message: `Status notification email sent to ${res.recipient} for ${request.employeeName}.`,
        mailtoUrl: res.mailtoUrl,
        recipient: res.recipient
      });
    }
  };

  const handleManualShiftAdd = async (logsToSubmit: Omit<TimeLog, 'id'>[], oldLogIds?: string[]) => {
    try {
      if (oldLogIds && oldLogIds.length > 0) {
        // Use a single loop to delete all old logs
        for (const id of oldLogIds) {
          await supabaseService.deleteLog(id);
        }
      }
      
      for (const log of logsToSubmit) {
        await supabaseService.addLog(log);
      }
      setEditingShift(null);
    } catch (err) {
      console.error('Manual shift update failed:', err);
      alert('Failed to update shift records');
    }
  };

  const liveStatus = useMemo(() => {
    const statusMap: Record<string, { status: string, lastLog: TimeLog | null }> = {};
    employees.forEach(emp => {
      const empLogs = logs.filter(l => l.employeeId === emp.id).sort((a, b) => {
        const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
        if (timeDiff !== 0) return timeDiff;
        const prioA = logTypePriority[a.type as LogType] || 0;
        const prioB = logTypePriority[b.type as LogType] || 0;
        return prioB - prioA;
      });
      const last = empLogs[0] || null;
      
      let status = 'Inactive';
      if (last) {
        const isToday = last.timestamp.toDateString() === new Date().toDateString();
        if (last.type === LogType.CLOCK_IN || last.type === LogType.BREAK_END) {
          status = isToday ? 'Active' : 'Inactive';
        } else if (last.type === LogType.BREAK_START) {
          status = isToday ? 'On Break' : 'Inactive';
        } else {
          status = 'Clocked Out';
        }
      }
      
      statusMap[emp.id] = { status, lastLog: last };
    });
    return statusMap;
  }, [employees, logs]);

  const handleExport = () => {
    const exportData = logs.map(l => ({
      Date: formatDate(l.timestamp),
      Time: formatTime(l.timestamp),
      Employee: l.employeeName,
      Action: l.type.replace('_', ' ').toUpperCase(),
      Note: l.note || '',
      Photo: l.photoUrl
    }));
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `medclock_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter(l => 
    l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.type.replace('_', ' ').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const summarizedShifts = useMemo(() => {
    // 1. Group logs by employeeId
    const employeeLogs: Record<string, TimeLog[]> = {};
    logs.forEach(log => {
      if (!employeeLogs[log.employeeId]) {
        employeeLogs[log.employeeId] = [];
      }
      employeeLogs[log.employeeId].push(log);
    });

    const shifts: ShiftSummary[] = [];

    Object.entries(employeeLogs).forEach(([employeeId, empLogs]) => {
      // Sort employee logs chronologically (oldest first)
      empLogs.sort((a, b) => {
        const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
        if (timeDiff !== 0) return timeDiff;
        const prioA = logTypePriority[a.type as LogType] || 0;
        const prioB = logTypePriority[b.type as LogType] || 0;
        return prioA - prioB;
      });

      let activeShift: {
        clockIn: TimeLog;
        clockOut: TimeLog | null;
        breaks: { start: TimeLog; end: TimeLog | null }[];
        allLogs: TimeLog[];
      } | null = null;

      empLogs.forEach(log => {
        if (log.type === LogType.CLOCK_IN) {
          // If already in an active shift:
          if (activeShift) {
            // Check if it's a duplicate of the current shift's clockIn (e.g. within 5 minutes)
            const isDup = Math.abs(log.timestamp.getTime() - activeShift.clockIn.timestamp.getTime()) < 5 * 60 * 1000;
            if (!isDup) {
              // Close previous active shift, and push it
              const clockInMin = new Date(activeShift.clockIn.timestamp);
              clockInMin.setSeconds(0, 0);
              
              const clockOutMin = activeShift.clockOut ? new Date(activeShift.clockOut.timestamp) : null;
              if (clockOutMin) clockOutMin.setSeconds(0, 0);
              
              let totalBreakMinutes = 0;
              activeShift.breaks.forEach(b => {
                if (b.end) {
                  const startMin = new Date(b.start.timestamp);
                  startMin.setSeconds(0, 0);
                  const endMin = new Date(b.end.timestamp);
                  endMin.setSeconds(0, 0);
                  totalBreakMinutes += Math.round((endMin.getTime() - startMin.getTime()) / 60000);
                }
              });
              
              let totalWorkedMinutes = 0;
              if (clockOutMin) {
                const totalRawMinutes = Math.round((clockOutMin.getTime() - clockInMin.getTime()) / 60000);
                totalWorkedMinutes = Math.max(0, totalRawMinutes - totalBreakMinutes);
              }

              shifts.push({
                id: activeShift.clockIn.id || `shift-${activeShift.clockIn.timestamp.getTime()}`,
                employeeId,
                employeeName: activeShift.clockIn.employeeName,
                clockIn: activeShift.clockIn,
                clockOut: activeShift.clockOut,
                breaks: activeShift.breaks,
                totalBreakMinutes,
                totalWorkedMinutes,
                allLogs: activeShift.allLogs
              });

              // Start new shift
              activeShift = {
                clockIn: log,
                clockOut: null,
                breaks: [],
                allLogs: [log]
              };
            } else {
              // It is a duplicate. Add to allLogs but otherwise ignore
              activeShift.allLogs.push(log);
            }
          } else {
            // No active shift, start one
            activeShift = {
              clockIn: log,
              clockOut: null,
              breaks: [],
              allLogs: [log]
            };
          }
        } else if (activeShift) {
          activeShift.allLogs.push(log);
          
          if (log.type === LogType.CLOCK_OUT) {
            // Check duplicate CLOCK_OUT (within 5 minutes of a previous clockOut on this active shift)
            if (activeShift.clockOut) {
              const isDup = Math.abs(log.timestamp.getTime() - activeShift.clockOut.timestamp.getTime()) < 5 * 60 * 1000;
              if (!isDup) {
                // If they clocked out again after some time, update it to the latest
                activeShift.clockOut = log;
              }
            } else {
              activeShift.clockOut = log;
            }
          } else if (log.type === LogType.BREAK_START) {
            // Check duplicate BREAK_START
            const alreadyHasStart = activeShift.breaks.some(b => !b.end && Math.abs(log.timestamp.getTime() - b.start.timestamp.getTime()) < 5 * 60 * 1000);
            if (!alreadyHasStart) {
              activeShift.breaks.push({ start: log, end: null });
            }
          } else if (log.type === LogType.BREAK_END) {
            // Find the last open break and close it
            const lastOpenBreak = [...activeShift.breaks].reverse().find(b => !b.end);
            if (lastOpenBreak) {
              lastOpenBreak.end = log;
            }
          }
        }
      });

      // If active shift is still open at the end
      if (activeShift) {
        const clockInMin = new Date(activeShift.clockIn.timestamp);
        clockInMin.setSeconds(0, 0);
        
        const clockOutMin = activeShift.clockOut ? new Date(activeShift.clockOut.timestamp) : null;
        if (clockOutMin) clockOutMin.setSeconds(0, 0);
        
        let totalBreakMinutes = 0;
        activeShift.breaks.forEach(b => {
          if (b.end) {
            const startMin = new Date(b.start.timestamp);
            startMin.setSeconds(0, 0);
            const endMin = new Date(b.end.timestamp);
            endMin.setSeconds(0, 0);
            totalBreakMinutes += Math.round((endMin.getTime() - startMin.getTime()) / 60000);
          }
        });
        
        let totalWorkedMinutes = 0;
        if (clockOutMin) {
          const totalRawMinutes = Math.round((clockOutMin.getTime() - clockInMin.getTime()) / 60000);
          totalWorkedMinutes = Math.max(0, totalRawMinutes - totalBreakMinutes);
        } else if (activeShift.clockIn.type === LogType.CLOCK_IN) {
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(activeShift.clockIn.timestamp, 'yyyy-MM-dd');
          if (isToday) {
            const nowMin = new Date();
            nowMin.setSeconds(0, 0);
            const totalRawMinutes = Math.round((nowMin.getTime() - clockInMin.getTime()) / 60000);
            totalWorkedMinutes = Math.max(0, totalRawMinutes - totalBreakMinutes);
          }
        }

        shifts.push({
          id: activeShift.clockIn.id || `shift-${activeShift.clockIn.timestamp.getTime()}`,
          employeeId,
          employeeName: activeShift.clockIn.employeeName,
          clockIn: activeShift.clockIn,
          clockOut: activeShift.clockOut,
          breaks: activeShift.breaks,
          totalBreakMinutes,
          totalWorkedMinutes,
          allLogs: activeShift.allLogs
        });
      }
    });

    return shifts.sort((a, b) => b.clockIn.timestamp.getTime() - a.clockIn.timestamp.getTime());
  }, [logs]);

  const filteredShifts = useMemo(() => {
    return summarizedShifts.filter(s => 
      s.employeeName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [summarizedShifts, searchQuery]);

  const filteredPTORequests = useMemo(() => {
    return ptoRequests.filter(req => {
      // Filter by Employee
      if (ptoEmployeeFilter !== 'ALL' && req.employeeId !== ptoEmployeeFilter) {
        return false;
      }
      // Filter by Status
      if (ptoStatusFilter !== 'ALL' && req.status !== ptoStatusFilter) {
        return false;
      }
      // Search query
      if (ptoSearchQuery.trim() !== '') {
        const q = ptoSearchQuery.toLowerCase().trim();
        const nameMatch = req.employeeName?.toLowerCase().includes(q);
        const noteMatch = req.note?.toLowerCase().includes(q);
        const managerNoteMatch = req.managerNote?.toLowerCase().includes(q);
        const dateMatch = req.startDate.includes(q) || req.endDate.includes(q);
        const statusMatch = req.status.toLowerCase().includes(q);
        if (!nameMatch && !noteMatch && !managerNoteMatch && !dateMatch && !statusMatch) {
          return false;
        }
      }
      return true;
    });
  }, [ptoRequests, ptoEmployeeFilter, ptoStatusFilter, ptoSearchQuery]);

  const ptoMetrics = useMemo(() => {
    const total = ptoRequests.length;
    const pending = ptoRequests.filter(r => r.status === 'pending').length;
    const approved = ptoRequests.filter(r => r.status === 'approved');
    const approvedHours = approved.reduce((sum, r) => sum + (r.hoursRequested || 0), 0);
    const rejected = ptoRequests.filter(r => r.status === 'rejected').length;
    return {
      total,
      pending,
      approvedCount: approved.length,
      approvedHours,
      rejected
    };
  }, [ptoRequests]);

  return (
    <div className="flex flex-col flex-1 h-screen bg-zrg-lightblue/30 overflow-hidden font-sans">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-zrg-navy border-r border-white/5 flex flex-col p-8 z-10 text-white">
          <button 
            onClick={onBack}
            className="flex items-center gap-3 text-slate-500 hover:text-white transition-colors mb-12 group uppercase text-[10px] font-black tracking-widest"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Return to Kiosk
          </button>

          <div className="flex items-center gap-4 mb-10">
            <div className="w-10 h-10 bg-zrg-blue rounded-lg flex items-center justify-center shadow-lg shadow-black/20">
              <Building2 className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">ZRG Admin</h2>
              <p className="text-[10px] text-zrg-blue font-bold uppercase tracking-widest">Administrative Hub</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { id: 'status', label: 'Live Status', icon: Users },
              { id: 'reports', label: 'Reporting', icon: FileText },
              { id: 'logs', label: 'Shift Records', icon: History },
              { id: 'pto', label: 'Time Off', icon: Calendar },
              { id: 'personnel', label: 'Personnel', icon: UserPlus },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map(tab => (
              <button
                key={`sidebar-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl font-bold transition-all uppercase text-[11px] tracking-widest",
                  activeTab === tab.id 
                    ? "bg-zrg-blue text-white shadow-xl shadow-black/20" 
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Sync Status</p>
               {supabaseService.isLive() ? (
                 <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-emerald-400">
                   <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                   Firebase Connected
                 </div>
               ) : (
                 <div className="space-y-2 mt-1">
                   <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-amber-500">
                     <span className="relative flex h-2.5 w-2.5">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                     </span>
                     Tablet-Local Mode
                   </div>
                   <p className="text-[9px] text-slate-400 font-medium leading-relaxed normal-case">
                     Firebase cloud limit exceeded. Punches and updates are fully stored offline on this tablet and will sync automatically once limits reset.
                   </p>
                   <button 
                     onClick={() => {
                       supabaseService.forceRetryFirebase();
                       window.location.reload();
                     }}
                     className="text-[9px] hover:underline font-bold text-zrg-blue uppercase tracking-wider block pt-1 cursor-pointer"
                   >
                     Retry Cloud Sync
                   </button>
                 </div>
               )}
            </div>
            <button 
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 bg-zrg-blue text-white p-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-opacity-90 transition-all shadow-lg"
            >
              <Download size={16} />
              Export Records
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-100/50 p-12">
          {activeTab === 'reports' && (
            <ReportView 
              logs={logs} 
              employees={employees} 
              ptoRequests={ptoRequests} 
            />
          )}

          {activeTab === 'status' && (
            <div className="max-w-6xl mx-auto">
              <div className="mb-12">
                <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">Facility Overview</h1>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Real-time personnel tracking</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {employees.map(emp => {
                  const status = liveStatus[emp.id];
                  const isOverdue = status.status === 'On Break' && 
                    status.lastLog && differenceInMinutes(new Date(), status.lastLog.timestamp) > 30;

                  return (
                    <motion.div 
                      layout
                      key={`dash-status-${emp.id}`}
                      className="bg-white p-6 rounded-2xl border border-zrg-lightblue shadow-lg shadow-zrg-lightblue/20 group hover:border-zrg-blue transition-colors"
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-zrg-lightblue rounded-xl flex items-center justify-center text-zrg-blue group-hover:bg-zrg-blue group-hover:text-white transition-colors border border-zrg-lightblue/50">
                          <Users size={22} />
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          status.status === 'Active' ? "bg-zrg-green/10 text-zrg-green" :
                          status.status === 'On Break' ? "bg-zrg-teal/10 text-zrg-teal" :
                          "bg-slate-50 text-slate-400"
                        )}>
                          {status.status}
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-zrg-navy">{emp.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">{emp.role}</p>
                      
                      <div className="pt-4 border-t border-slate-50 space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase">
                          <span className="text-slate-400">Last Event</span>
                          <span className="text-zrg-navy">{status.lastLog ? formatTime(status.lastLog.timestamp) : 'N/A'}</span>
                        </div>
                        {isOverdue && (
                          <div className="p-2 bg-zrg-orange/10 text-zrg-orange rounded-lg flex items-center gap-2 text-[10px] font-black uppercase animate-pulse">
                            <AlertTriangle size={14} /> 
                            Overdue Break Alert
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between gap-6 mb-12">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Shift Records</h1>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Audit log of all personnel activity</p>
                </div>
                <button 
                  onClick={() => setIsManualShiftModalOpen(true)}
                  className="bg-zrg-blue text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-zrg-blue/10 flex items-center gap-2"
                >
                  <Plus size={14} />
                  Add Record
                </button>

              </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input 
                    type="text" 
                    placeholder="FILTER BY NAME..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 w-64 text-[11px] font-bold uppercase tracking-widest focus:border-blue-400 outline-none transition-all shadow-sm"
                  />
                </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-8">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Worked Time</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unpaid Breaks</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredShifts.map((shift) => (
                      <React.Fragment key={shift.id}>
                        <tr 
                          onClick={() => setExpandedShiftId(expandedShiftId === shift.id ? null : shift.id)}
                          className={cn(
                            "hover:bg-zrg-lightblue/10 transition-colors cursor-pointer group",
                            expandedShiftId === shift.id && "bg-zrg-lightblue/5"
                          )}
                        >
                          <td className="px-8 py-4">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-slate-50 rounded-lg text-slate-300 group-hover:text-zrg-blue transition-colors">
                                <ChevronRight 
                                  size={14} 
                                  className={cn("transition-transform", expandedShiftId === shift.id && "rotate-90")} 
                                />
                              </div>
                              <div>
                                <div className="font-bold text-zrg-navy text-sm">{shift.employeeName}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{formatDate(shift.clockIn.timestamp)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="text-slate-600 font-bold text-[11px] tabular-nums flex items-center gap-2">
                              {formatTime(shift.clockIn.timestamp)}
                              <span className="text-slate-300">—</span>
                              {shift.clockOut ? formatTime(shift.clockOut.timestamp) : <span className="text-zrg-orange italic">MISSING CLOCK OUT</span>}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <div className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block",
                              shift.totalBreakMinutes > 0 ? "bg-zrg-teal/10 text-zrg-teal" : "bg-slate-50 text-slate-300"
                            )}>
                              {shift.totalBreakMinutes > 0 ? `${shift.totalBreakMinutes} min` : 'No Breaks'}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-right">
                            {shift.clockOut ? (
                              <div className="text-zrg-blue font-black text-sm tabular-nums">
                                {(shift.totalWorkedMinutes / 60).toFixed(2)}
                                <span className="text-[9px] ml-1">HRS</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Incomplete</span>
                            )}
                          </td>
                        </tr>
                        {expandedShiftId === shift.id && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={4} className="px-12 py-8">
                              <div className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex flex-col">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detailed Shift Activity</h4>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Modify individual events or the entire day</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      setEditingShift(shift);
                                      setIsManualShiftModalOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-zrg-blue text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-zrg-blue/10"
                                  >
                                    <Edit2 size={12} />
                                    Edit Full Day
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  {shift.allLogs.sort((a,b) => {
                                    const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
                                    if (timeDiff !== 0) return timeDiff;
                                    const prioA = logTypePriority[a.type as LogType] || 0;
                                    const prioB = logTypePriority[b.type as LogType] || 0;
                                    return prioA - prioB;
                                  }).map((log, idx) => (
                                    <div 
                                      key={`expanded-log-${log.id || idx}`}
                                      className="bg-white border border-slate-100 p-4 rounded-xl flex items-center justify-between shadow-sm"
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className={cn(
                                          "w-2 h-2 rounded-full",
                                          log.type === LogType.CLOCK_IN ? "bg-zrg-green" :
                                          log.type === LogType.CLOCK_OUT ? "bg-zrg-orange" : "bg-zrg-teal"
                                        )} />
                                        <div>
                                          <div className="text-[10px] font-black uppercase tracking-widest text-zrg-navy">
                                            {log.type.replace('_', ' ')}
                                          </div>
                                          <div className="text-[11px] font-bold text-slate-400 tabular-nums">
                                            {formatTime(log.timestamp)}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {log.note && (
                                          <span className="text-[10px] text-slate-300 italic max-w-xs truncate">"{log.note}"</span>
                                        )}
                                        <div onClick={(e) => { e.stopPropagation(); window.open(log.photoUrl); }} className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 cursor-pointer">
                                          <img src={log.photoUrl} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex gap-2">
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingLog(log); }}
                                            className="p-2 bg-slate-50 text-slate-300 hover:bg-zrg-blue hover:text-white rounded-lg transition-all"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (confirmingDeleteId === log.id) {
                                                handleDeleteLog(log.id!);
                                              } else {
                                                setConfirmingDeleteId(log.id!);
                                                setTimeout(() => setConfirmingDeleteId(null), 3000);
                                              }
                                            }}
                                            className={cn(
                                              "p-2 rounded-lg transition-all",
                                              confirmingDeleteId === log.id 
                                                ? "bg-zrg-orange text-white animate-pulse" 
                                                : "bg-slate-50 text-slate-300 hover:bg-zrg-orange hover:text-white"
                                            )}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pto' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zrg-blue rounded-xl flex items-center justify-center text-white shadow-lg shadow-zrg-blue/20">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">Time Off Records</h1>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-0.5">Filter leave requests by employee and dispatch email updates</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-200/60 p-1 rounded-xl">
                    <button 
                      onClick={() => setPtoViewMode('table')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                        ptoViewMode === 'table' ? "bg-white text-zrg-navy shadow-sm" : "text-slate-500 hover:text-zrg-navy"
                      )}
                    >
                      Table View
                    </button>
                    <button 
                      onClick={() => setPtoViewMode('cards')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                        ptoViewMode === 'cards' ? "bg-white text-zrg-navy shadow-sm" : "text-slate-500 hover:text-zrg-navy"
                      )}
                    >
                      Cards
                    </button>
                  </div>
                  <button 
                    onClick={() => setIsManualPTOModalOpen(true)}
                    className="bg-zrg-blue hover:bg-opacity-90 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-zrg-blue/20 flex items-center gap-2 transition-all"
                  >
                    <Plus size={16} />
                    New Record
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Records</p>
                    <p className="text-2xl font-black text-zrg-navy mt-1 tabular-nums">{ptoMetrics.total}</p>
                  </div>
                  <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 border border-slate-100">
                    <Calendar size={20} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Pending Approval
                    </p>
                    <p className="text-2xl font-black text-amber-600 mt-1 tabular-nums">{ptoMetrics.pending}</p>
                  </div>
                  <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100">
                    <Clock size={20} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-zrg-blue/20 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-zrg-blue uppercase tracking-widest">Approved Hours</p>
                    <p className="text-2xl font-black text-zrg-blue mt-1 tabular-nums">
                      {ptoMetrics.approvedHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">HRS</span>
                    </p>
                  </div>
                  <div className="w-11 h-11 bg-zrg-lightblue/50 rounded-xl flex items-center justify-center text-zrg-blue border border-zrg-blue/10">
                    <FileText size={20} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Approved Requests</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">{ptoMetrics.approvedCount}</p>
                  </div>
                  <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100">
                    <Users size={20} />
                  </div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input 
                      type="text" 
                      placeholder="SEARCH NAME, REASON, DATES..."
                      value={ptoSearchQuery}
                      onChange={(e) => setPtoSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-8 py-3 text-[11px] font-bold uppercase tracking-widest focus:border-zrg-blue outline-none transition-all"
                    />
                    {ptoSearchQuery && (
                      <button onClick={() => setPtoSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filter by Employee Dropdown */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                    <Users size={16} className="text-zrg-blue shrink-0" />
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider hidden sm:inline">Employee:</span>
                    <select
                      value={ptoEmployeeFilter}
                      onChange={(e) => setPtoEmployeeFilter(e.target.value)}
                      className="bg-transparent text-[11px] font-bold uppercase tracking-widest text-zrg-navy outline-none cursor-pointer pr-2"
                    >
                      <option value="ALL">ALL PERSONNEL ({employees.length})</option>
                      {employees.map(emp => (
                        <option key={`pto-emp-opt-${emp.id}`} value={emp.id}>
                          {emp.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter by Status Dropdown */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                    <Filter size={16} className="text-zrg-blue shrink-0" />
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider hidden sm:inline">Status:</span>
                    <select
                      value={ptoStatusFilter}
                      onChange={(e) => setPtoStatusFilter(e.target.value)}
                      className="bg-transparent text-[11px] font-bold uppercase tracking-widest text-zrg-navy outline-none cursor-pointer pr-2"
                    >
                      <option value="ALL">ALL STATUSES</option>
                      <option value="pending">PENDING ONLY</option>
                      <option value="approved">APPROVED ONLY</option>
                      <option value="rejected">DENIED ONLY</option>
                    </select>
                  </div>
                </div>

                {(ptoEmployeeFilter !== 'ALL' || ptoStatusFilter !== 'ALL' || ptoSearchQuery !== '') && (
                  <button
                    onClick={() => {
                      setPtoEmployeeFilter('ALL');
                      setPtoStatusFilter('ALL');
                      setPtoSearchQuery('');
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-zrg-orange hover:bg-zrg-orange/10 px-3 py-2 rounded-xl border border-zrg-orange/20 transition-all flex items-center gap-1.5"
                  >
                    <X size={12} />
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Table or Cards Display */}
              {ptoViewMode === 'table' ? (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Leave Dates</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPTORequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-8 py-12 text-center text-slate-400">
                            <Calendar className="mx-auto mb-3 opacity-30 text-slate-400" size={32} />
                            <p className="font-bold text-sm uppercase tracking-wider text-slate-600">No Time Off Records Found</p>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase">Try adjusting your employee filter or search query</p>
                          </td>
                        </tr>
                      ) : (
                        filteredPTORequests.map((req, index) => {
                          const emp = employees.find(e => e.id === req.employeeId);
                          return (
                            <tr key={`pto-tbl-${req.id || index}`} className="hover:bg-slate-50/80 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-zrg-blue/10 text-zrg-blue font-black flex items-center justify-center text-xs uppercase border border-zrg-blue/20 shrink-0">
                                    {req.employeeName ? req.employeeName.substring(0, 2) : 'EM'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-zrg-navy text-sm">{req.employeeName}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                      {emp?.email || req.employeeEmail || 'dylan@zrgmedical.com'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-6 py-4">
                                <div className="text-slate-700 font-bold text-xs flex items-center gap-1.5">
                                  <span>{req.startDate}</span>
                                  <ChevronRight size={12} className="text-slate-300" />
                                  <span>{req.endDate}</span>
                                </div>
                                {req.note && (
                                  <div className="text-[10px] text-slate-400 italic mt-0.5 max-w-xs truncate" title={req.note}>
                                    Note: "{req.note}"
                                  </div>
                                )}
                                {req.managerNote && (
                                  <div className="text-[10px] text-zrg-blue font-medium italic mt-0.5 max-w-xs truncate" title={req.managerNote}>
                                    Manager: "{req.managerNote}"
                                  </div>
                                )}
                              </td>

                              <td className="px-6 py-4">
                                <div className="text-zrg-blue font-black text-sm tabular-nums">
                                  {req.hoursRequested} <span className="text-[9px] text-slate-400 font-bold">HRS</span>
                                </div>
                              </td>

                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-block border",
                                  req.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-200" :
                                  req.status === 'approved' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                  "bg-rose-50 text-rose-600 border-rose-200"
                                )}>
                                  {req.status}
                                </span>
                              </td>

                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {req.status === 'pending' && (
                                    <>
                                      <button 
                                        onClick={() => openApproveModal(req)}
                                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border border-emerald-200"
                                      >
                                        Approve
                                      </button>
                                      <button 
                                        onClick={() => openDenyModal(req)}
                                        className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors border border-rose-200"
                                      >
                                        Deny
                                      </button>
                                    </>
                                  )}

                                  {/* Resend Email Notice Button */}
                                  <button
                                    onClick={() => handleSendEmailNotice(req)}
                                    title="Resend email notice"
                                    className="px-2.5 py-1.5 bg-slate-50 text-slate-500 hover:bg-zrg-blue hover:text-white rounded-lg transition-colors border border-slate-200 text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                                  >
                                    <span>📧</span> Email
                                  </button>

                                  {/* Delete Record Button */}
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirmingDeleteId === req.id) {
                                        handleDeletePTO(req.id!);
                                      } else {
                                        setConfirmingDeleteId(req.id!);
                                        setTimeout(() => setConfirmingDeleteId(null), 3000);
                                      }
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg transition-all border",
                                      confirmingDeleteId === req.id 
                                        ? "bg-zrg-orange text-white border-zrg-orange animate-pulse" 
                                        : "bg-slate-50 text-slate-300 hover:bg-zrg-orange hover:text-white border-slate-200"
                                    )}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Card Grid View */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredPTORequests.map((req, index) => (
                    <div key={`pto-card-${req.id || index}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-zrg-blue transition-colors border border-slate-100">
                          <Calendar size={20} />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-800">{req.employeeName}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              req.status === 'pending' ? "text-amber-600" :
                              req.status === 'approved' ? "text-zrg-green" : "text-zrg-orange"
                            )}>
                              {req.status}
                            </span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] text-zrg-blue font-black uppercase tracking-widest">{req.hoursRequested} Hours</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl mb-6 border border-slate-100">
                        <div className="text-center">
                          <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Start Date</p>
                          <p className="font-bold text-slate-700 text-sm">{req.startDate}</p>
                        </div>
                        <ChevronRight className="text-slate-300" size={16} />
                        <div className="text-center">
                          <p className="text-[9px] text-slate-400 uppercase font-black mb-1">End Date</p>
                          <p className="font-bold text-slate-700 text-sm">{req.endDate}</p>
                        </div>
                      </div>

                      {req.note && (
                        <div className="p-3 bg-slate-100/50 rounded-xl mb-4 text-[11px] text-slate-500 italic border border-slate-100">
                          <p className="text-[9px] text-slate-400 uppercase font-black not-italic mb-0.5">Employee Note:</p>
                          "{req.note}"
                        </div>
                      )}

                      {req.managerNote && (
                        <div className="p-3 bg-blue-50/50 rounded-xl mb-6 text-[11px] text-blue-600 italic border border-blue-100">
                          <p className="text-[9px] text-blue-400 uppercase font-black not-italic mb-0.5">Manager Decision Note:</p>
                          "{req.managerNote}"
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                        <button
                          onClick={() => handleSendEmailNotice(req)}
                          className="px-3 py-2 bg-slate-50 text-slate-600 hover:bg-zrg-blue hover:text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border border-slate-200 flex items-center gap-1.5"
                        >
                          <span>📧</span> Resend Email
                        </button>

                        <div className="flex items-center gap-2">
                          {req.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => openApproveModal(req)}
                                className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl font-black uppercase text-[9px] tracking-widest transition-colors border border-emerald-200"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => openDenyModal(req)}
                                className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-black uppercase text-[9px] tracking-widest transition-colors border border-rose-200"
                              >
                                Deny
                              </button>
                            </>
                          )}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirmingDeleteId === req.id) {
                                handleDeletePTO(req.id!);
                              } else {
                                setConfirmingDeleteId(req.id!);
                                setTimeout(() => setConfirmingDeleteId(null), 3000);
                              }
                            }}
                            className={cn(
                              "p-2 rounded-xl transition-all border",
                              confirmingDeleteId === req.id 
                                ? "bg-zrg-orange text-white border-zrg-orange animate-pulse" 
                                : "text-slate-300 hover:text-zrg-orange hover:bg-zrg-orange/5 border-slate-100"
                            )}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'personnel' && (
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">Personnel Directory</h1>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Manage employees and PTO balances</p>
                </div>
                <button 
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="bg-zrg-blue hover:bg-opacity-90 text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-zrg-blue/10 transition-all"
                >
                  Register Employee
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-zrg-lightblue overflow-hidden shadow-lg shadow-zrg-lightblue/20">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zrg-lightblue/20 border-b border-zrg-lightblue/50">
                      <th className="px-8 py-5 text-[10px] font-black text-zrg-navy uppercase tracking-widest">Name & Title</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zrg-navy uppercase tracking-widest">Access Role</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zrg-navy uppercase tracking-widest">PIN Code</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zrg-navy uppercase tracking-widest">PTO Balance</th>
                      <th className="px-8 py-5 text-[10px] font-black text-zrg-navy uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {employees.map(emp => (
                      <tr key={`personnel-${emp.id}`} className="hover:bg-zrg-lightblue/10 transition-colors group">
                        <td className="px-8 py-4">
                          <div className="font-bold text-zrg-navy text-sm">{emp.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{emp.title || 'Staff Member'}</div>
                        </td>
                        <td className="px-8 py-4">
                          <button 
                            onClick={() => handleUpdateRole(emp.id, emp.role)}
                            className={cn(
                              "px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border",
                              emp.role === 'manager' 
                                ? "bg-zrg-navy text-white border-zrg-navy" 
                                : "text-slate-400 border-slate-200 hover:border-zrg-blue hover:text-zrg-blue"
                            )}
                          >
                            {emp.role}
                          </button>
                        </td>
                        <td className="px-8 py-4">
                          <code className="bg-zrg-lightblue/50 px-2 py-1 rounded text-[11px] font-mono font-bold text-zrg-blue">
                            {emp.pin}
                          </code>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-black text-sm tabular-nums",
                              (emp.ptoBalance || 0) < 10 ? "text-zrg-orange" : "text-zrg-green"
                            )}>
                              {(emp.ptoBalance || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">HRS</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex justify-end gap-2 text-zrg-navy">
                            <button 
                              onClick={() => handleUpdatePTO(emp.id, emp.name)}
                              className="bg-zrg-blue/10 text-zrg-blue hover:bg-zrg-blue hover:text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              Add Hours
                            </button>
                            <button 
                              onClick={() => setEditingEmployee(emp)}
                              className="bg-slate-100 text-slate-400 hover:bg-zrg-navy hover:text-white p-2 rounded-lg transition-all"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirmingDeleteId === emp.id) {
                                  handleDeleteEmployee(emp.id);
                                } else {
                                  setConfirmingDeleteId(emp.id);
                                  setTimeout(() => setConfirmingDeleteId(null), 3000);
                                }
                              }}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                confirmingDeleteId === emp.id 
                                  ? "bg-zrg-orange text-white animate-pulse" 
                                  : "bg-slate-100 text-slate-400 hover:bg-zrg-orange hover:text-white"
                              )}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-12">
                <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">System Settings</h1>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Configure Kiosk and operational parameters</p>
              </div>

              <div className="bg-white rounded-[2rem] border border-zrg-lightblue overflow-hidden shadow-2xl shadow-zrg-lightblue/10 p-8 md:p-12 space-y-10">
                <div>
                  <h2 className="text-xl font-black text-zrg-navy uppercase tracking-tight mb-2">Kiosk Verification</h2>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Customize how employees register clock events</p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="space-y-1">
                    <div className="font-bold text-zrg-navy text-sm">Photo & Camera Verification</div>
                    <p className="text-xs text-slate-500 max-w-xl text-left">
                      When enabled, employees must capture or upload a verification picture before completing punch actions. Disable this if employees are clocking in from a secure office space or dedicated terminal where cameras are unnecessary.
                    </p>
                  </div>
                  <button
                    onClick={() => handleTogglePhotoVerification(!requirePhotoVerification)}
                    disabled={isSavingSettings}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-zrg-blue focus:ring-offset-2",
                      requirePhotoVerification ? "bg-zrg-blue" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        requirePhotoVerification ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {isSavingSettings && (
                  <div className="flex items-center gap-2 text-zrg-blue text-xs font-bold uppercase tracking-wider animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-zrg-blue" />
                    Updating System Configuration...
                  </div>
                )}
              </div>

              {/* Data Portability & Migration Section */}
              <div className="bg-white rounded-[2rem] border border-zrg-lightblue overflow-hidden shadow-2xl shadow-zrg-lightblue/10 p-8 md:p-12 mt-8 space-y-10">
                <div>
                  <h2 className="text-xl font-black text-zrg-navy uppercase tracking-tight mb-2">Data Portability & Migration</h2>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Migrate time logs or restore backups across browsers and links</p>
                </div>

                <div className="space-y-6">
                  {/* Option 1: Browser-local storage detected */}
                  {hasLocalData && (
                    <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 mt-2 space-y-4">
                      <div className="flex gap-3 items-start">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                        <div>
                          <div className="font-extrabold text-amber-900 text-sm">Offline Browser-Local Data Recovered</div>
                          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                            We detected {localDataCounts.logs} punches and {localDataCounts.employees} employees stored securely in this tablet's local cache.
                            You can migrate them directly to your active Firebase Cloud Database now to merge your offline and online records.
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleMigrateLocalDataToSupabase}
                        disabled={isMigrating}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold uppercase text-[10px] tracking-widest px-5 py-3 rounded-xl transition-all disabled:opacity-50"
                      >
                        {isMigrating ? "Syncing..." : "Migrate Local Punches to Live Firebase Cloud"}
                      </button>
                    </div>
                  )}

                  {/* Option 2: File Import/Export (For cross-device or cross-url transfer) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="font-bold text-zrg-navy text-sm">Export Migration File</div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Downloads a lightweight file containing all database tables stored in your browser's local cache. Perfect for backing up your work or migrating data from one link (e.g. your Development URL) to another.
                        </p>
                      </div>
                      <button
                        onClick={handleExportDataFile}
                        className="w-full bg-slate-800 hover:bg-slate-950 text-white font-extrabold uppercase text-[10px] tracking-widest py-3 rounded-xl transition-all"
                      >
                        Download Backup (.json)
                      </button>
                    </div>

                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="font-bold text-zrg-navy text-sm">Import Migration File</div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Restores or imports your previously downloaded backup file directly into your active database. This writes all matching personnel and punch records safely while protecting existing items from duplication.
                        </p>
                      </div>
                      <label className="w-full">
                        <span className="w-full inline-block text-center bg-zrg-blue hover:bg-zrg-navy text-white font-extrabold uppercase text-[10px] tracking-widest py-3.5 rounded-xl transition-all cursor-pointer">
                          {isMigrating ? "Importing..." : "Choose File to Upload"}
                        </span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportDataFile}
                          disabled={isMigrating}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence mode="wait">
        {editingLog && (
          <EditLogModal
            key="edit-log-modal"
            isOpen={!!editingLog}
            log={editingLog}
            onClose={() => setEditingLog(null)}
            onSave={handleSaveLog}
            onDelete={handleDeleteLog}
          />
        )}
        {editingEmployee && (
          <EditEmployeeModal 
            key="edit-modal"
            isOpen={!!editingEmployee}
            employee={editingEmployee}
            onClose={() => setEditingEmployee(null)}
            onSave={handleSaveEmployee}
            onDelete={handleDeleteEmployee}
          />
        )}
        {isRegisterModalOpen && (
          <RegisterEmployeeModal 
            key="register-modal"
            isOpen={isRegisterModalOpen}
            onClose={() => setIsRegisterModalOpen(false)}
            onRegister={handleRegisterEmployee}
          />
        )}
        {isManualPTOModalOpen && (
          <ManualPTOModal
            key="manual-pto-modal"
            isOpen={isManualPTOModalOpen}
            onClose={() => setIsManualPTOModalOpen(false)}
            employees={employees}
            onSubmit={handleAddManualPTO}
          />
        )}
        {isManualShiftModalOpen && (
          <ManualShiftModal
            key="manual-shift-modal"
            isOpen={isManualShiftModalOpen}
            onClose={() => {
              setIsManualShiftModalOpen(false);
              setEditingShift(null);
            }}
            employees={employees}
            onSubmit={handleManualShiftAdd}
            initialShift={editingShift}
          />
        )}

        {ptoDecisionTarget && (
          <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg",
                    ptoDecisionTarget.action === 'approve' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-rose-500 shadow-rose-500/20"
                  )}>
                    {ptoDecisionTarget.action === 'approve' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-zrg-navy uppercase tracking-tight">
                      {ptoDecisionTarget.action === 'approve' ? 'Approve PTO Request' : 'Deny PTO Request'}
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      Confirm status & notify employee
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setPtoDecisionTarget(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Summary Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-6 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px]">Employee:</span>
                  <span className="font-black text-zrg-navy">{ptoDecisionTarget.request.employeeName}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px]">Dates:</span>
                  <span>{ptoDecisionTarget.request.startDate} to {ptoDecisionTarget.request.endDate}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px]">Requested Hours:</span>
                  <span className="font-black text-zrg-blue">{ptoDecisionTarget.request.hoursRequested} Hours</span>
                </div>
              </div>

              {/* Employee Email Input */}
              <div className="mb-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Employee Email Address (For Notification)
                </label>
                <input 
                  type="email"
                  value={ptoEmployeeEmail}
                  onChange={(e) => setPtoEmployeeEmail(e.target.value)}
                  placeholder="employee@zrgmedical.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-zrg-navy focus:border-zrg-blue outline-none"
                />
              </div>

              {/* Manager Decision Note */}
              <div className="mb-6">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Manager Decision Note / Reason
                </label>
                <textarea 
                  rows={3}
                  value={ptoDecisionNote}
                  onChange={(e) => setPtoDecisionNote(e.target.value)}
                  placeholder="Add an optional note for the employee..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-700 focus:border-zrg-blue outline-none resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setPtoDecisionTarget(null)}
                  className="px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmPTODecision}
                  disabled={isSubmittingDecision}
                  className={cn(
                    "px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest text-white shadow-xl transition-all flex items-center gap-2",
                    ptoDecisionTarget.action === 'approve' 
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" 
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20",
                    isSubmittingDecision && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSubmittingDecision ? (
                    <span>Processing...</span>
                  ) : (
                    <>
                      <span>📧</span>
                      <span>Confirm & Notify Employee</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {toastNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[100] max-w-md bg-zrg-navy text-white p-5 rounded-2xl shadow-2xl border border-white/10 flex flex-col gap-3"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-zrg-teal font-black text-xs uppercase tracking-wider">
                <span>📧 Notification Dispatched</span>
              </div>
              <button onClick={() => setToastNotification(null)} className="text-slate-400 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-300 font-medium leading-relaxed">{toastNotification.message}</p>
            {toastNotification.mailtoUrl && (
              <a 
                href={toastNotification.mailtoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setToastNotification(null)}
                className="inline-flex items-center justify-center gap-2 bg-zrg-blue text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-opacity-90 transition-all shadow-md mt-1"
              >
                <span>📬</span> Open Direct Mail Client
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

