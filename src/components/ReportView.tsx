import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Download, 
  Search, 
  Calendar, 
  Clock, 
  User, 
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TimeLog, Employee, LogType, PTORequest } from '../types';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  isWithinInterval, 
  differenceInMinutes, 
  parseISO,
  isSameDay,
  addHours
} from 'date-fns';
import { cn, formatDate, formatTime } from '../lib/utils';
import Papa from 'papaparse';

const logTypePriority: Record<LogType, number> = {
  [LogType.CLOCK_IN]: 1,
  [LogType.BREAK_START]: 2,
  [LogType.BREAK_END]: 3,
  [LogType.CLOCK_OUT]: 4
};

interface ReportViewProps {
  logs: TimeLog[];
  employees: Employee[];
  ptoRequests: PTORequest[];
}

interface ShiftRecord {
  employeeId: string;
  employeeName: string;
  role: string;
  clockIn: Date;
  clockOut: Date | null;
  breakStart: Date | null;
  breakEnd: Date | null;
  breakLengthMinutes: number;
  totalPaidHours: number;
  regularHours: number;
  overtimeHours: number;
  unpaidBreakHours: number;
  notes: string[];
}

export const ReportView: React.FC<ReportViewProps> = ({ logs, employees, ptoRequests }) => {
  const [startDate, setStartDate] = useState(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Group logs into shifts
  const shifts = useMemo(() => {
    const shiftList: ShiftRecord[] = [];

    // 1. Group logs by employeeId
    const employeeLogs: Record<string, TimeLog[]> = {};
    logs.forEach(log => {
      if (!employeeLogs[log.employeeId]) {
        employeeLogs[log.employeeId] = [];
      }
      employeeLogs[log.employeeId].push(log);
    });

    Object.entries(employeeLogs).forEach(([employeeId, empLogs]) => {
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) return;

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
        notes: string[];
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

              const unpaidBreakHours = Math.round((totalBreakMinutes / 60) * 100) / 100;
              const totalPaidHours = Math.round((totalWorkedMinutes / 60) * 100) / 100;

              shiftList.push({
                employeeId,
                employeeName: emp.name,
                role: emp.role,
                clockIn: activeShift.clockIn.timestamp,
                clockOut: activeShift.clockOut ? activeShift.clockOut.timestamp : null,
                breakStart: activeShift.breaks[0]?.start.timestamp || null,
                breakEnd: activeShift.breaks[0]?.end?.timestamp || null,
                breakLengthMinutes: totalBreakMinutes,
                totalPaidHours,
                regularHours: 0,
                overtimeHours: 0,
                unpaidBreakHours,
                notes: activeShift.notes
              });

              // Start new shift
              activeShift = {
                clockIn: log,
                clockOut: null,
                breaks: [],
                notes: log.note ? [log.note] : []
              };
            } else {
              // It is a duplicate. Add note if present but otherwise ignore
              if (log.note && !activeShift.notes.includes(log.note)) {
                activeShift.notes.push(log.note);
              }
            }
          } else {
            // No active shift, start one
            activeShift = {
              clockIn: log,
              clockOut: null,
              breaks: [],
              notes: log.note ? [log.note] : []
            };
          }
        } else if (activeShift) {
          if (log.note && !activeShift.notes.includes(log.note)) {
            activeShift.notes.push(log.note);
          }
          
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

        const unpaidBreakHours = Math.round((totalBreakMinutes / 60) * 100) / 100;
        const totalPaidHours = Math.round((totalWorkedMinutes / 60) * 100) / 100;

        shiftList.push({
          employeeId,
          employeeName: emp.name,
          role: emp.role,
          clockIn: activeShift.clockIn.timestamp,
          clockOut: activeShift.clockOut ? activeShift.clockOut.timestamp : null,
          breakStart: activeShift.breaks[0]?.start.timestamp || null,
          breakEnd: activeShift.breaks[0]?.end?.timestamp || null,
          breakLengthMinutes: totalBreakMinutes,
          totalPaidHours,
          regularHours: 0,
          overtimeHours: 0,
          unpaidBreakHours,
          notes: activeShift.notes
        });
      }
    });

    // Post-process to calculate daily OT
    const shiftsWithOT: ShiftRecord[] = [];
    const dailyTotals: Record<string, Record<string, number>> = {}; // empId -> dateString -> totalHours

    // Sort shifts chronologically so that the daily accumulation is in historical order!
    shiftList.sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());

    shiftList.forEach(s => {
      const dateKey = format(s.clockIn, 'yyyy-MM-dd');
      if (!dailyTotals[s.employeeId]) dailyTotals[s.employeeId] = {};
      
      const currentDailyTotal = dailyTotals[s.employeeId][dateKey] || 0;
      const shiftHours = s.totalPaidHours;
      
      let regularHours = 0;
      let overtimeHours = 0;

      if (currentDailyTotal >= 8) {
        overtimeHours = shiftHours;
      } else if (currentDailyTotal + shiftHours > 8) {
        regularHours = 8 - currentDailyTotal;
        overtimeHours = shiftHours - regularHours;
      } else {
        regularHours = shiftHours;
      }

      // Round to 2 decimal places to prevent floating point accumulation issues
      regularHours = Math.round(regularHours * 100) / 100;
      overtimeHours = Math.round(overtimeHours * 100) / 100;

      dailyTotals[s.employeeId][dateKey] = currentDailyTotal + shiftHours;

      shiftsWithOT.push({
        ...s,
        regularHours,
        overtimeHours
      });
    });

    return shiftsWithOT;
  }, [logs, employees]);

  // Filter shifts and PTO by date range
  const filteredShifts = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    return shifts.filter(s => {
      const isInRange = isWithinInterval(s.clockIn, { start, end });
      const isCorrectEmployee = selectedEmployee === 'all' || s.employeeId === selectedEmployee;
      return isInRange && isCorrectEmployee;
    });
  }, [shifts, startDate, endDate, selectedEmployee]);

  const relevantPTO = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    return ptoRequests.filter(req => {
      if (req.status !== 'approved') return false;
      const reqDate = parseISO(req.startDate); // simplified, usually start/end range
      const isInRange = isWithinInterval(reqDate, { start, end });
      const isCorrectEmployee = selectedEmployee === 'all' || req.employeeId === selectedEmployee;
      return isInRange && isCorrectEmployee;
    });
  }, [ptoRequests, startDate, endDate, selectedEmployee]);

  // Totals per employee
  const employeeTotals = useMemo(() => {
    const totals: Record<string, { 
      name: string, 
      id: string,
      role: string,
      paid: number, 
      regular: number, 
      overtime: number, 
      break: number, 
      pto: number,
      sessions: number
    }> = {};

    employees.forEach(emp => {
      if (selectedEmployee !== 'all' && emp.id !== selectedEmployee) return;
      
      const empShifts = filteredShifts.filter(s => s.employeeId === emp.id);
      const empPTO = relevantPTO.filter(r => r.employeeId === emp.id);
      
      if (empShifts.length === 0 && empPTO.length === 0) return;

       totals[emp.id] = {
        name: emp.name,
        id: emp.id,
        role: emp.role,
        paid: Math.round(empShifts.reduce((acc, s) => acc + s.totalPaidHours, 0) * 100) / 100,
        regular: Math.round(empShifts.reduce((acc, s) => acc + s.regularHours, 0) * 100) / 100,
        overtime: Math.round(empShifts.reduce((acc, s) => acc + s.overtimeHours, 0) * 100) / 100,
        break: Math.round(empShifts.reduce((acc, s) => acc + s.unpaidBreakHours, 0) * 100) / 100,
        pto: Math.round(empPTO.reduce((acc, r) => acc + r.hoursRequested, 0) * 100) / 100,
        sessions: empShifts.length
      };
    });

    return Object.values(totals);
  }, [employees, filteredShifts, relevantPTO, selectedEmployee]);

  const handleExportCSV = () => {
    const exportData: any[] = [];

    employeeTotals.forEach(empTotal => {
      const empShifts = filteredShifts.filter(s => s.employeeId === empTotal.id);
      const empPTO = relevantPTO.filter(r => r.employeeId === empTotal.id);

      // Combine individual work shifts and PTO records, then sort them chronologically
      const combinedRecords = [
        ...empShifts.map(s => ({
          type: 'shift' as const,
          date: s.clockIn,
          data: s
        })),
        ...empPTO.map(p => ({
          type: 'pto' as const,
          date: parseISO(p.startDate),
          data: p
        }))
      ].sort((a, b) => a.date.getTime() - b.date.getTime());

      combinedRecords.forEach(item => {
        if (item.type === 'shift') {
          const s = item.data;
          exportData.push({
            'Employee Name': s.employeeName,
            'Clock in Date': format(s.clockIn, 'yyyy-MM-dd'),
            'Clock in Time': format(s.clockIn, 'hh:mm:ss a'),
            'Clock out Date': s.clockOut ? format(s.clockOut, 'yyyy-MM-dd') : 'N/A',
            'Clock Out Time': s.clockOut ? format(s.clockOut, 'hh:mm:ss a') : 'N/A',
            'Break Start Time': s.breakStart ? format(s.breakStart, 'hh:mm:ss a') : 'N/A',
            'Break End Time': s.breakEnd ? format(s.breakEnd, 'hh:mm:ss a') : 'N/A',
            'Break Length': `${s.breakLengthMinutes} min`,
            'Role': s.role.toUpperCase(),
            'Total Paid Hours': s.totalPaidHours.toFixed(2),
            'Regular Hours': s.regularHours.toFixed(2),
            'PTO Hours': '0.00',
            'Unpaid Break Hours': s.unpaidBreakHours.toFixed(2),
            'Over Time Hours': s.overtimeHours.toFixed(2),
            'Manager Note': s.notes.join('; ')
          });
        } else {
          const p = item.data;
          exportData.push({
            'Employee Name': p.employeeName,
            'Clock in Date': p.startDate,
            'Clock in Time': '12:00:00 AM',
            'Clock out Date': p.endDate,
            'Clock Out Time': '11:59:59 PM',
            'Break Start Time': 'N/A',
            'Break End Time': 'N/A',
            'Break Length': '0 min',
            'Role': empTotal.role.toUpperCase(),
            'Total Paid Hours': p.hoursRequested,
            'Regular Hours': 0,
            'PTO Hours': p.hoursRequested,
            'Unpaid Break Hours': 0,
            'Over Time Hours': 0,
            'Manager Note': `PTO: ${p.managerNote || ''}`
          });
        }
      });

      // Add Total section for employee
      exportData.push({
        'Employee Name': `TOTALS FOR ${empTotal.name.toUpperCase()}`,
        'Clock in Date': '-',
        'Clock in Time': '-',
        'Clock out Date': '-',
        'Clock Out Time': '-',
        'Break Start Time': '-',
        'Break End Time': '-',
        'Break Length': '-',
        'Role': '-',
        'Total Paid Hours': (empTotal.paid + empTotal.pto).toFixed(2),
        'Regular Hours': (empTotal.regular).toFixed(2),
        'PTO Hours': empTotal.pto.toFixed(2),
        'Unpaid Break Hours': empTotal.break.toFixed(2),
        'Over Time Hours': empTotal.overtime.toFixed(2),
        'Manager Note': 'Aggregate Summary'
      });
      
      // Empty row for spacing
      exportData.push({});
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `MedClock_Report_${startDate}_to_${endDate}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">Performance Reports</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Timesheet auditing and payroll calculations</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-zrg-blue transition-all"
            />
          </div>
          <div className="space-y-1.5 min-w-[140px]">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Employee</label>
            <select 
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-zrg-blue transition-all appearance-none cursor-pointer"
            >
              <option value="all">ALL PERSONNEL</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-zrg-blue text-white px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-opacity-90 transition-all shadow-md shadow-zrg-blue/10"
          >
            <Download size={14} />
            Generate CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-white p-6 rounded-2xl border border-zrg-lightblue shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-zrg-blue/10 rounded-lg flex items-center justify-center text-zrg-blue">
              <Clock size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Worked</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-navy">{employeeTotals.reduce((acc, t) => acc + t.paid, 0).toFixed(2)}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zrg-lightblue shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-zrg-orange/10 rounded-lg flex items-center justify-center text-zrg-orange">
              <AlertCircle size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overtime</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-orange">{employeeTotals.reduce((acc, t) => acc + t.overtime, 0).toFixed(2)}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zrg-lightblue shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-zrg-teal/10 rounded-lg flex items-center justify-center text-zrg-teal">
              <Calendar size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PTO Used</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-teal">{employeeTotals.reduce((acc, t) => acc + t.pto, 0).toFixed(2)}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zrg-lightblue shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-zrg-green/10 rounded-lg flex items-center justify-center text-zrg-green">
              <FileText size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessions</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-green">{filteredShifts.length}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Records</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {employeeTotals.length === 0 ? (
          <div className="bg-white rounded-3xl p-20 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
             <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6">
               <Search size={40} />
             </div>
             <h3 className="text-xl font-bold text-slate-900 mb-2">No Records Found</h3>
             <p className="text-sm text-slate-500 max-w-xs">Adjust your date range or filter to see personnel records.</p>
          </div>
        ) : (
          employeeTotals.map(empTotal => {
            const empShifts = filteredShifts.filter(s => s.employeeId === empTotal.id);
            const empPTO = relevantPTO.filter(r => r.employeeId === empTotal.id);

            // Combine individual work shifts and PTO records, then sort them chronologically
            const combinedHistory = [
              ...empShifts.map(s => ({
                id: `shift-${s.clockIn.getTime()}`,
                type: 'shift' as const,
                date: s.clockIn,
                shift: s
              })),
              ...empPTO.map(p => ({
                id: `pto-${p.id || p.startDate}`,
                type: 'pto' as const,
                date: parseISO(p.startDate),
                pto: p
              }))
            ].sort((a, b) => a.date.getTime() - b.date.getTime());

            return (
              <div key={empTotal.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div 
                  onClick={() => setExpandedEmployee(expandedEmployee === empTotal.id ? null : empTotal.id)}
                  className="p-6 cursor-pointer flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-zrg-navy rounded-xl flex items-center justify-center text-white font-black text-xl">
                      {empTotal.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-zrg-navy text-lg leading-tight">{empTotal.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{empTotal.role}</p>
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center gap-8">
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
                      <p className="font-black text-zrg-navy tabular-nums">{(empTotal.paid + empTotal.pto).toFixed(2)} hrs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Overtime</p>
                      <p className={cn(
                        "font-black tabular-nums",
                        empTotal.overtime > 0 ? "text-zrg-orange" : "text-slate-400"
                      )}>{empTotal.overtime.toFixed(2)} hrs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">PTO</p>
                      <p className="font-black text-zrg-teal tabular-nums">{empTotal.pto.toFixed(2)} hrs</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-zrg-green">Summarized</p>
                    </div>
                    {expandedEmployee === empTotal.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedEmployee === empTotal.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                           <div className="bg-white p-6 rounded-2xl border border-slate-100">
                             <h4 className="text-[11px] font-black text-zrg-navy uppercase tracking-widest mb-6 pb-4 border-b border-slate-50">Hours Breakdown</h4>
                             <div className="space-y-4">
                               <div className="flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-400">Regular Work Hours</span>
                                 <span className="font-black text-zrg-navy">{empTotal.regular.toFixed(2)} hrs</span>
                               </div>
                               <div className="flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-400">Overtime hours (&gt;8h/day)</span>
                                 <span className="font-black text-zrg-orange">{empTotal.overtime.toFixed(2)} hrs</span>
                               </div>
                               <div className="flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-400">Approved PTO Hours</span>
                                 <span className="font-black text-zrg-teal">{empTotal.pto.toFixed(2)} hrs</span>
                               </div>
                               <div className="flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-400">Unpaid Break Time</span>
                                 <span className="font-black text-slate-400">{empTotal.break.toFixed(2)} hrs</span>
                               </div>
                               <div className="pt-4 mt-4 border-t border-slate-50 flex justify-between items-center text-zrg-navy">
                                 <span className="text-xs font-black uppercase tracking-widest">Total Compensated</span>
                                 <span className="text-xl font-black">{(empTotal.paid + empTotal.pto).toFixed(2)} <span className="text-[10px] uppercase font-bold">hrs</span></span>
                               </div>
                             </div>
                           </div>

                           <div className="bg-white p-6 rounded-2xl border border-slate-100 overflow-hidden">
                             <h4 className="text-[11px] font-black text-zrg-navy uppercase tracking-widest mb-6 pb-4 border-b border-slate-50">Shift History</h4>
                             <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
                               {combinedHistory.map((item) => {
                                 if (item.type === 'shift') {
                                   const shift = item.shift;
                                   return (
                                     <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <div>
                                          <p className="text-[11px] font-black text-zrg-navy">{format(shift.clockIn, 'MMM dd, yyyy')}</p>
                                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                            {format(shift.clockIn, 'hh:mm a')} - {shift.clockOut ? format(shift.clockOut, 'hh:mm a') : 'Working...'}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[11px] font-black text-zrg-blue">{shift.totalPaidHours.toFixed(2)} hrs</p>
                                          {shift.overtimeHours > 0 && <p className="text-[8px] font-black text-zrg-orange uppercase">+{shift.overtimeHours.toFixed(2)} OT</p>}
                                        </div>
                                     </div>
                                   );
                                 } else {
                                   const pto = item.pto;
                                   return (
                                     <div key={item.id} className="flex items-center justify-between p-3 bg-zrg-teal/5 rounded-xl border border-zrg-teal/10">
                                        <div>
                                          <p className="text-[11px] font-black text-zrg-teal">{format(parseISO(pto.startDate), 'MMM dd, yyyy')}</p>
                                          <p className="text-[9px] text-zrg-teal/60 font-bold uppercase tracking-widest">PTO Record</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-[11px] font-black text-zrg-teal">{pto.hoursRequested.toFixed(2)} hrs</p>
                                        </div>
                                     </div>
                                   );
                                 }
                               })}
                             </div>
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
