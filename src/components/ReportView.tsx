import React, { useState, useMemo, useEffect } from 'react';
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
  AlertCircle,
  Sparkles,
  Trash2,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TimeLog, Employee, LogType, PTORequest, HolidayRecord } from '../types';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  isWithinInterval, 
  differenceInMinutes, 
  parseISO,
  isSameDay,
  addHours,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { cn, formatDate, formatTime } from '../lib/utils';
import Papa from 'papaparse';
import { AddHolidayModal } from './AddHolidayModal';
import { supabaseService } from '../services/supabaseService';

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
  holidayRecords?: HolidayRecord[];
  onAddHoliday?: () => void;
  onDeleteHoliday?: (id: string) => Promise<void>;
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
  holidayHours: number;
  isHoliday?: boolean;
  holidayName?: string;
  unpaidBreakHours: number;
  notes: string[];
}

export const ReportView: React.FC<ReportViewProps> = ({ 
  logs, 
  employees, 
  ptoRequests,
  holidayRecords: propHolidayRecords,
  onAddHoliday,
  onDeleteHoliday: propOnDeleteHoliday
}) => {
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(endOfDay(new Date()), 'yyyy-MM-dd'));
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>('this_month');
  const [isAddHolidayModalOpen, setIsAddHolidayModalOpen] = useState(false);
  const [confirmingDeleteHolidayId, setConfirmingDeleteHolidayId] = useState<string | null>(null);
  
  // Local fallback subscription for holiday records
  const [localHolidayRecords, setLocalHolidayRecords] = useState<HolidayRecord[]>([]);

  useEffect(() => {
    if (!propHolidayRecords) {
      const unsub = supabaseService.subscribeToHolidayRecords(records => {
        setLocalHolidayRecords(records);
      });
      return () => unsub();
    }
  }, [propHolidayRecords]);

  const allHolidayRecords = propHolidayRecords || localHolidayRecords;

  const dateBounds = useMemo(() => {
    if (!logs || logs.length === 0) return { earliest: new Date(), latest: new Date() };
    let minTime = Infinity;
    let maxTime = -Infinity;
    logs.forEach(l => {
      const t = l.timestamp instanceof Date ? l.timestamp.getTime() : new Date(l.timestamp).getTime();
      if (!isNaN(t)) {
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }
    });
    if (minTime === Infinity) return { earliest: new Date(), latest: new Date() };
    return {
      earliest: new Date(minTime),
      latest: new Date(maxTime)
    };
  }, [logs]);

  const handleApplyPreset = (presetId: string) => {
    setActivePreset(presetId);
    const now = new Date();
    switch (presetId) {
      case 'today':
        setStartDate(format(startOfDay(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfDay(now), 'yyyy-MM-dd'));
        break;
      case 'this_week':
        setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
        setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
        break;
      case 'current_pay_period': {
        const dayOfMonth = now.getDate();
        if (dayOfMonth <= 15) {
          setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
          setEndDate(format(new Date(now.getFullYear(), now.getMonth(), 15), 'yyyy-MM-dd'));
        } else {
          setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 16), 'yyyy-MM-dd'));
          setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        }
        break;
      }
      case 'prev_pay_period': {
        const dayOfMonth = now.getDate();
        if (dayOfMonth <= 15) {
          const prevMonth = subMonths(now, 1);
          setStartDate(format(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 16), 'yyyy-MM-dd'));
          setEndDate(format(endOfMonth(prevMonth), 'yyyy-MM-dd'));
        } else {
          setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
          setEndDate(format(new Date(now.getFullYear(), now.getMonth(), 15), 'yyyy-MM-dd'));
        }
        break;
      }
      case 'this_month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        break;
      case 'last_month': {
        const lastMonth = subMonths(now, 1);
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      }
      case 'last_90':
        setStartDate(format(startOfDay(subDays(now, 90)), 'yyyy-MM-dd'));
        setEndDate(format(endOfDay(now), 'yyyy-MM-dd'));
        break;
      case 'all_time':
        setStartDate(format(startOfDay(dateBounds.earliest), 'yyyy-MM-dd'));
        setEndDate(format(endOfDay(dateBounds.latest), 'yyyy-MM-dd'));
        break;
      default:
        break;
    }
  };

  // Group and pair logs into ShiftRecords
  const shifts: ShiftRecord[] = useMemo(() => {
    const logsByEmployee: Record<string, TimeLog[]> = {};
    logs.forEach(log => {
      if (!logsByEmployee[log.employeeId]) logsByEmployee[log.employeeId] = [];
      logsByEmployee[log.employeeId].push(log);
    });

    const shiftList: ShiftRecord[] = [];

    Object.entries(logsByEmployee).forEach(([employeeId, empLogs]) => {
      const emp = employees.find(e => e.id === employeeId) || {
        name: empLogs[0]?.employeeName || 'Unknown',
        role: 'staff'
      };

      // Sort chronologically ascending
      empLogs.sort((a, b) => {
        const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        if (tA !== tB) return tA - tB;
        return (logTypePriority[a.type] || 0) - (logTypePriority[b.type] || 0);
      });

      let activeShift: {
        clockIn: TimeLog;
        clockOut: TimeLog | null;
        breaks: { start: TimeLog; end: TimeLog | null }[];
        notes: string[];
      } | null = null;

      for (let i = 0; i < empLogs.length; i++) {
        const log = empLogs[i];

        if (log.type === LogType.CLOCK_IN) {
          if (activeShift) {
            const timeSinceLastIn = log.timestamp.getTime() - activeShift.clockIn.timestamp.getTime();
            if (timeSinceLastIn > 5 * 60 * 1000) {
              // Close prior shift
              let totalWorkedMinutes = 0;
              let totalBreakMinutes = 0;

              activeShift.breaks.forEach(b => {
                if (b.start && b.end) {
                  const bMins = differenceInMinutes(b.end.timestamp, b.start.timestamp);
                  if (bMins > 0) totalBreakMinutes += bMins;
                }
              });

              if (activeShift.clockOut) {
                const rawMins = differenceInMinutes(activeShift.clockOut.timestamp, activeShift.clockIn.timestamp);
                totalWorkedMinutes = Math.max(0, rawMins - totalBreakMinutes);
              }

              const unpaidBreakHours = Math.round((totalBreakMinutes / 60) * 100) / 100;
              const totalPaidHours = Math.round((totalWorkedMinutes / 60) * 100) / 100;
              const isHoliday = !!(activeShift.clockIn.isHoliday || activeShift.notes.some(n => n.toUpperCase().includes('[HOLIDAY]')));
              const holidayName = activeShift.clockIn.holidayName || (isHoliday ? 'Holiday Shift' : undefined);

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
                holidayHours: 0,
                isHoliday,
                holidayName,
                unpaidBreakHours,
                notes: activeShift.notes
              });

              activeShift = {
                clockIn: log,
                clockOut: null,
                breaks: [],
                notes: log.note ? [log.note] : []
              };
            } else {
              if (log.note && !activeShift.notes.includes(log.note)) {
                activeShift.notes.push(log.note);
              }
            }
          } else {
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
            if (activeShift.clockOut) {
              const isDup = Math.abs(log.timestamp.getTime() - activeShift.clockOut.timestamp.getTime()) < 5 * 60 * 1000;
              if (!isDup) {
                activeShift.clockOut = log;
              }
            } else {
              activeShift.clockOut = log;
            }
          } else if (log.type === LogType.BREAK_START) {
            const lastBreak = activeShift.breaks[activeShift.breaks.length - 1];
            if (!lastBreak || lastBreak.end !== null) {
              activeShift.breaks.push({ start: log, end: null });
            }
          } else if (log.type === LogType.BREAK_END) {
            const currentBreak = activeShift.breaks.find(b => b.end === null);
            if (currentBreak) {
              currentBreak.end = log;
            }
          }
        }
      }

      if (activeShift) {
        let totalWorkedMinutes = 0;
        let totalBreakMinutes = 0;

        activeShift.breaks.forEach(b => {
          if (b.start && b.end) {
            const bMins = differenceInMinutes(b.end.timestamp, b.start.timestamp);
            if (bMins > 0) totalBreakMinutes += bMins;
          }
        });

        if (activeShift.clockOut) {
          const rawMins = differenceInMinutes(activeShift.clockOut.timestamp, activeShift.clockIn.timestamp);
          totalWorkedMinutes = Math.max(0, rawMins - totalBreakMinutes);
        }

        const unpaidBreakHours = Math.round((totalBreakMinutes / 60) * 100) / 100;
        const totalPaidHours = Math.round((totalWorkedMinutes / 60) * 100) / 100;
        const isHoliday = !!(activeShift.clockIn.isHoliday || activeShift.notes.some(n => n.toUpperCase().includes('[HOLIDAY]')));
        const holidayName = activeShift.clockIn.holidayName || (isHoliday ? 'Holiday Shift' : undefined);

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
          holidayHours: 0,
          isHoliday,
          holidayName,
          unpaidBreakHours,
          notes: activeShift.notes
        });
      }
    });

    // Calculate daily overtime
    const shiftsWithOT: ShiftRecord[] = [];
    const dailyTotals: Record<string, Record<string, number>> = {};

    shiftList.sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());

    shiftList.forEach(s => {
      const dateKey = format(s.clockIn, 'yyyy-MM-dd');
      if (!dailyTotals[s.employeeId]) dailyTotals[s.employeeId] = {};
      
      const currentDailyTotal = dailyTotals[s.employeeId][dateKey] || 0;
      const shiftHours = s.totalPaidHours;
      
      let regularHours = 0;
      let overtimeHours = 0;
      let holidayHours = 0;

      if (s.isHoliday) {
        holidayHours = shiftHours;
      } else {
        if (currentDailyTotal >= 8) {
          overtimeHours = shiftHours;
        } else if (currentDailyTotal + shiftHours > 8) {
          regularHours = 8 - currentDailyTotal;
          overtimeHours = shiftHours - regularHours;
        } else {
          regularHours = shiftHours;
        }
        dailyTotals[s.employeeId][dateKey] = currentDailyTotal + shiftHours;
      }

      regularHours = Math.round(regularHours * 100) / 100;
      overtimeHours = Math.round(overtimeHours * 100) / 100;
      holidayHours = Math.round(holidayHours * 100) / 100;

      shiftsWithOT.push({
        ...s,
        regularHours,
        overtimeHours,
        holidayHours
      });
    });

    return shiftsWithOT;
  }, [logs, employees]);

  // Filter shifts by date range and selected employee
  const filteredShifts = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    return shifts.filter(s => {
      const inRange = isWithinInterval(s.clockIn, { start, end });
      const matchesEmp = selectedEmployee === 'all' || s.employeeId === selectedEmployee;
      return inRange && matchesEmp;
    });
  }, [shifts, startDate, endDate, selectedEmployee]);

  const relevantPTO = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    return ptoRequests.filter(req => {
      if (req.status !== 'approved') return false;
      try {
        const reqDate = parseISO(req.startDate);
        const isInRange = isWithinInterval(reqDate, { start, end });
        const isCorrectEmployee = selectedEmployee === 'all' || req.employeeId === selectedEmployee;
        return isInRange && isCorrectEmployee;
      } catch (e) {
        return false;
      }
    });
  }, [ptoRequests, startDate, endDate, selectedEmployee]);

  // Filter holiday records by date range and selected employee
  const relevantHolidayRecords = useMemo(() => {
    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    return (allHolidayRecords || []).filter(h => {
      try {
        const holDate = parseISO(h.date);
        const inRange = isWithinInterval(holDate, { start, end });
        const matchesEmp = selectedEmployee === 'all' || h.employeeId === selectedEmployee || h.employeeId === 'ALL';
        return inRange && matchesEmp;
      } catch (e) {
        return false;
      }
    });
  }, [allHolidayRecords, startDate, endDate, selectedEmployee]);

  // Totals per employee
  const employeeTotals = useMemo(() => {
    const totals: Record<string, { 
      name: string, 
      id: string,
      role: string,
      paid: number, 
      regular: number, 
      overtime: number, 
      holiday: number,
      break: number, 
      pto: number,
      totalCompensated: number,
      sessions: number
    }> = {};

    employees.forEach(emp => {
      if (selectedEmployee !== 'all' && emp.id !== selectedEmployee) return;
      
      const empShifts = filteredShifts.filter(s => s.employeeId === emp.id);
      const empPTO = relevantPTO.filter(r => r.employeeId === emp.id);
      const empHolidays = relevantHolidayRecords.filter(h => h.employeeId === emp.id || h.employeeId === 'ALL');
      
      if (empShifts.length === 0 && empPTO.length === 0 && empHolidays.length === 0) return;

      const regularShiftHours = empShifts.reduce((acc, s) => acc + s.regularHours, 0);
      const otShiftHours = empShifts.reduce((acc, s) => acc + s.overtimeHours, 0);
      const shiftHolidayHours = empShifts.reduce((acc, s) => acc + s.holidayHours, 0);
      const recordHolidayHours = empHolidays.reduce((acc, h) => acc + h.hours, 0);
      const totalHolidayHours = Math.round((shiftHolidayHours + recordHolidayHours) * 100) / 100;

      const totalPTOHours = Math.round(empPTO.reduce((acc, r) => acc + r.hoursRequested, 0) * 100) / 100;
      const totalBreakHours = Math.round(empShifts.reduce((acc, s) => acc + s.unpaidBreakHours, 0) * 100) / 100;
      const totalWorkedHours = Math.round((regularShiftHours + otShiftHours) * 100) / 100;
      const totalCompensated = Math.round((totalWorkedHours + totalHolidayHours + totalPTOHours) * 100) / 100;

      totals[emp.id] = {
        name: emp.name,
        id: emp.id,
        role: emp.role,
        paid: Math.round(empShifts.reduce((acc, s) => acc + s.totalPaidHours, 0) * 100) / 100,
        regular: Math.round(regularShiftHours * 100) / 100,
        overtime: Math.round(otShiftHours * 100) / 100,
        holiday: totalHolidayHours,
        break: totalBreakHours,
        pto: totalPTOHours,
        totalCompensated,
        sessions: empShifts.length
      };
    });

    return Object.values(totals);
  }, [employees, filteredShifts, relevantPTO, relevantHolidayRecords, selectedEmployee]);

  // Handle saving new holiday hours
  const handleSaveHolidayRecords = async (records: Omit<HolidayRecord, 'id'>[]) => {
    await supabaseService.addBatchHolidayRecords(records);
    const updated = await supabaseService.getHolidayRecords();
    setLocalHolidayRecords(updated);
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      if (propOnDeleteHoliday) {
        await propOnDeleteHoliday(id);
      } else {
        await supabaseService.deleteHolidayRecord(id);
        const updated = await supabaseService.getHolidayRecords();
        setLocalHolidayRecords(updated);
      }
    } catch (err) {
      console.error('Failed to delete holiday record:', err);
    }
  };

  // CSV Export with explicit separate Holiday Hours column
  const handleExportCSV = () => {
    const exportData: any[] = [];

    employeeTotals.forEach(empTotal => {
      const empShifts = filteredShifts.filter(s => s.employeeId === empTotal.id);
      const empPTO = relevantPTO.filter(r => r.employeeId === empTotal.id);
      const empHolidays = relevantHolidayRecords.filter(h => h.employeeId === empTotal.id || h.employeeId === 'ALL');

      // Combine individual work shifts, holiday records, and PTO records chronologically
      const combinedRecords = [
        ...empShifts.map(s => ({
          type: 'shift' as const,
          date: s.clockIn,
          shift: s
        })),
        ...empHolidays.map(h => ({
          type: 'holiday' as const,
          date: parseISO(h.date),
          holiday: h
        })),
        ...empPTO.map(p => ({
          type: 'pto' as const,
          date: parseISO(p.startDate),
          pto: p
        }))
      ].sort((a, b) => a.date.getTime() - b.date.getTime());

      combinedRecords.forEach(item => {
        if (item.type === 'shift') {
          const s = item.shift;
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
            'Over Time Hours': s.overtimeHours.toFixed(2),
            'Holiday Hours': s.holidayHours.toFixed(2),
            'PTO Hours': '0.00',
            'Unpaid Break Hours': s.unpaidBreakHours.toFixed(2),
            'Manager Note': s.notes.join('; ')
          });
        } else if (item.type === 'holiday') {
          const h = item.holiday;
          exportData.push({
            'Employee Name': empTotal.name,
            'Clock in Date': h.date,
            'Clock in Time': 'N/A',
            'Clock out Date': h.date,
            'Clock Out Time': 'N/A',
            'Break Start Time': 'N/A',
            'Break End Time': 'N/A',
            'Break Length': '0 min',
            'Role': empTotal.role.toUpperCase(),
            'Total Paid Hours': h.hours.toFixed(2),
            'Regular Hours': '0.00',
            'Over Time Hours': '0.00',
            'Holiday Hours': h.hours.toFixed(2),
            'PTO Hours': '0.00',
            'Unpaid Break Hours': '0.00',
            'Manager Note': `HOLIDAY: ${h.holidayName}${h.note ? ` - ${h.note}` : ''}`
          });
        } else {
          const p = item.pto;
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
            'Total Paid Hours': p.hoursRequested.toFixed(2),
            'Regular Hours': '0.00',
            'Over Time Hours': '0.00',
            'Holiday Hours': '0.00',
            'PTO Hours': p.hoursRequested.toFixed(2),
            'Unpaid Break Hours': '0.00',
            'Manager Note': `PTO: ${p.managerNote || ''}`
          });
        }
      });

      // Add Total section for employee with separate Holiday Hours column
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
        'Total Paid Hours': empTotal.totalCompensated.toFixed(2),
        'Regular Hours': empTotal.regular.toFixed(2),
        'Over Time Hours': empTotal.overtime.toFixed(2),
        'Holiday Hours': empTotal.holiday.toFixed(2),
        'PTO Hours': empTotal.pto.toFixed(2),
        'Unpaid Break Hours': empTotal.break.toFixed(2),
        'Manager Note': 'Personnel Compensation Total'
      });
      
      // Empty row for spacing
      exportData.push({});
    });

    // Grand Facility Totals Row
    exportData.push({
      'Employee Name': 'FACILITY GRAND TOTALS',
      'Clock in Date': `${startDate} to ${endDate}`,
      'Clock in Time': '-',
      'Clock out Date': '-',
      'Clock Out Time': '-',
      'Break Start Time': '-',
      'Break End Time': '-',
      'Break Length': '-',
      'Role': 'ALL PERSONNEL',
      'Total Paid Hours': employeeTotals.reduce((a, b) => a + b.totalCompensated, 0).toFixed(2),
      'Regular Hours': employeeTotals.reduce((a, b) => a + b.regular, 0).toFixed(2),
      'Over Time Hours': employeeTotals.reduce((a, b) => a + b.overtime, 0).toFixed(2),
      'Holiday Hours': employeeTotals.reduce((a, b) => a + b.holiday, 0).toFixed(2),
      'PTO Hours': employeeTotals.reduce((a, b) => a + b.pto, 0).toFixed(2),
      'Unpaid Break Hours': employeeTotals.reduce((a, b) => a + b.break, 0).toFixed(2),
      'Manager Note': 'Complete Pay Period Export'
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

  const totalFacilityHolidayHours = employeeTotals.reduce((acc, t) => acc + t.holiday, 0);

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-zrg-navy uppercase tracking-tighter">Performance Reports</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mt-1">Timesheet auditing, holiday pay, and payroll calculations</p>
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-600">
            <span className="w-2 h-2 rounded-full bg-zrg-green animate-pulse" />
            Archive: {logs.length.toLocaleString()} punch records loaded ({formatDate(dateBounds.earliest)} – {formatDate(dateBounds.latest)})
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Quick Select:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'current_pay_period', label: 'Current Pay Period' },
              { id: 'prev_pay_period', label: 'Prev Pay Period' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'last_90', label: 'Last 90 Days' },
              { id: 'all_time', label: 'All Records' },
            ].map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border",
                  activePreset === preset.id
                    ? "bg-zrg-navy text-white border-zrg-navy shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-zrg-blue hover:text-zrg-blue"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Start Date</label>
              <input 
                type="date" 
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-zrg-blue transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">End Date</label>
              <input 
                type="date" 
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                }}
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

            {/* Add Holiday Button */}
            <button 
              onClick={() => {
                if (onAddHoliday) {
                  onAddHoliday();
                } else {
                  setIsAddHolidayModalOpen(true);
                }
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-5 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Sparkles size={14} className="text-amber-300" />
              Add Holiday Hours
            </button>

            {/* Generate CSV */}
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-zrg-blue text-white px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-opacity-90 transition-all shadow-md shadow-zrg-blue/10 cursor-pointer"
            >
              <Download size={14} />
              Generate CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary Metric Cards (5 columns including dedicated Holiday Hours card) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-zrg-blue/10 rounded-lg flex items-center justify-center text-zrg-blue">
              <Clock size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Worked</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-navy">
              {employeeTotals.reduce((acc, t) => acc + (t.regular + t.overtime), 0).toFixed(2)}
            </span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-zrg-orange/10 rounded-lg flex items-center justify-center text-zrg-orange">
              <AlertCircle size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overtime (&gt;8h)</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-orange">{employeeTotals.reduce((acc, t) => acc + t.overtime, 0).toFixed(2)}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>

        {/* Dedicated Holiday Hours Card */}
        <div className="bg-gradient-to-br from-indigo-50/90 to-indigo-100/50 p-5 rounded-2xl border border-indigo-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-amber-300 shadow-xs">
              <Sparkles size={16} />
            </div>
            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Holiday Hours</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-indigo-700">{totalFacilityHolidayHours.toFixed(2)}</span>
            <span className="text-[10px] font-black text-indigo-900/60 uppercase">Hours</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
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

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-zrg-green/10 rounded-lg flex items-center justify-center text-zrg-green">
              <FileText size={16} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compensated</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-zrg-green">
              {employeeTotals.reduce((acc, t) => acc + t.totalCompensated, 0).toFixed(2)}
            </span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Hours</span>
          </div>
        </div>
      </div>

      {/* Personnel Compensation Summary Table (with explicit separate Holiday Hours column) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-10">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <h3 className="text-sm font-black text-zrg-navy uppercase tracking-wider">Personnel Payroll & Compensation Summary</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Aggregated work, overtime, designated holiday hours, and leave breakdown
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full flex items-center gap-1.5">
              <Sparkles size={12} className="text-indigo-600" />
              Holiday Hours Column Active
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="py-3.5 px-5">Personnel</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4 text-right">Regular Hrs</th>
                <th className="py-3.5 px-4 text-right">Overtime Hrs</th>
                <th className="py-3.5 px-4 text-right bg-indigo-50/80 text-indigo-900 border-x border-indigo-100 font-black">
                  Holiday Hrs
                </th>
                <th className="py-3.5 px-4 text-right">PTO Hrs</th>
                <th className="py-3.5 px-4 text-right">Unpaid Break</th>
                <th className="py-3.5 px-5 text-right font-black text-zrg-navy">Total Compensated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {employeeTotals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-bold uppercase text-[11px]">
                    No personnel records found for the selected dates.
                  </td>
                </tr>
              ) : (
                employeeTotals.map(t => (
                  <tr key={`summary-row-${t.id}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-5 font-bold text-zrg-navy flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-zrg-navy text-white text-[10px] font-black flex items-center justify-center">
                        {t.name.charAt(0)}
                      </span>
                      {t.name}
                    </td>
                    <td className="py-3.5 px-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{t.role}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-700">{t.regular.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-zrg-orange">{t.overtime.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-indigo-800 bg-indigo-50/40 border-x border-indigo-100">
                      {t.holiday > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full font-black text-[11px]">
                          <Sparkles size={10} className="text-indigo-600" />
                          {t.holiday.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-300">0.00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-zrg-teal">{t.pto.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-400">{t.break.toFixed(2)}</td>
                    <td className="py-3.5 px-5 text-right font-black text-zrg-navy text-sm">
                      {t.totalCompensated.toFixed(2)} <span className="text-[10px] text-slate-400 font-bold">hrs</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {employeeTotals.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-black text-xs text-zrg-navy border-t-2 border-slate-200">
                  <td className="py-3.5 px-5 uppercase tracking-wider" colSpan={2}>
                    Facility Totals ({employeeTotals.length} Personnel)
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {employeeTotals.reduce((a, b) => a + b.regular, 0).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-zrg-orange">
                    {employeeTotals.reduce((a, b) => a + b.overtime, 0).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-indigo-900 bg-indigo-100/70 border-x border-indigo-200 font-black">
                    {totalFacilityHolidayHours.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-zrg-teal">
                    {employeeTotals.reduce((a, b) => a + b.pto, 0).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-500">
                    {employeeTotals.reduce((a, b) => a + b.break, 0).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-5 text-right text-sm text-zrg-navy">
                    {employeeTotals.reduce((a, b) => a + b.totalCompensated, 0).toFixed(2)} hrs
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detailed Individual Personnel Cards */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-zrg-navy uppercase tracking-tight">Individual Detailed Records</h2>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Click any personnel row to expand shift and holiday history
          </span>
        </div>

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
            const empHolidays = relevantHolidayRecords.filter(h => h.employeeId === empTotal.id || h.employeeId === 'ALL');

            // Combine individual work shifts, holiday records, and PTO records chronologically
            const combinedHistory = [
              ...empShifts.map(s => ({
                id: `shift-${s.clockIn.getTime()}`,
                type: 'shift' as const,
                date: s.clockIn,
                shift: s
              })),
              ...empHolidays.map(h => ({
                id: `holiday-${h.id || h.date}`,
                type: 'holiday' as const,
                date: parseISO(h.date),
                holiday: h
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

                  <div className="hidden lg:flex items-center gap-7">
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
                      <p className="font-black text-zrg-navy tabular-nums">{empTotal.totalCompensated.toFixed(2)} hrs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Regular</p>
                      <p className="font-black text-slate-700 tabular-nums">{empTotal.regular.toFixed(2)} hrs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Overtime</p>
                      <p className={cn(
                        "font-black tabular-nums",
                        empTotal.overtime > 0 ? "text-zrg-orange" : "text-slate-400"
                      )}>{empTotal.overtime.toFixed(2)} hrs</p>
                    </div>
                    {/* Explicit Holiday Hours Column in personnel row */}
                    <div className="text-center">
                      <p className="text-[9px] font-black text-indigo-900 uppercase tracking-widest mb-1">Holiday</p>
                      <p className={cn(
                        "font-black tabular-nums",
                        empTotal.holiday > 0 ? "text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-black" : "text-slate-400"
                      )}>{empTotal.holiday.toFixed(2)} hrs</p>
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
                               <div className="flex justify-between items-center bg-indigo-50/60 p-2 rounded-xl border border-indigo-100">
                                 <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                   <Sparkles size={13} className="text-indigo-600" />
                                   Designated Holiday Hours
                                 </span>
                                 <span className="font-black text-indigo-700">{empTotal.holiday.toFixed(2)} hrs</span>
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
                                 <span className="text-xl font-black text-indigo-950">
                                   {empTotal.totalCompensated.toFixed(2)} <span className="text-[10px] uppercase font-bold text-slate-400">hrs</span>
                                 </span>
                               </div>
                             </div>
                           </div>

                           <div className="bg-white p-6 rounded-2xl border border-slate-100 overflow-hidden">
                             <h4 className="text-[11px] font-black text-zrg-navy uppercase tracking-widest mb-6 pb-4 border-b border-slate-50">Shift &amp; Leave History</h4>
                             <div className="max-h-72 overflow-y-auto space-y-3 pr-2">
                               {combinedHistory.length === 0 ? (
                                 <p className="text-xs text-slate-400 text-center py-6">No shift or leave records in this period.</p>
                               ) : (
                                 combinedHistory.map((item) => {
                                   if (item.type === 'shift') {
                                     const shift = item.shift;
                                     return (
                                       <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <p className="text-[11px] font-black text-zrg-navy">{format(shift.clockIn, 'MMM dd, yyyy')}</p>
                                              {shift.isHoliday && (
                                                <span className="bg-indigo-100 text-indigo-800 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                                                  Holiday Shift
                                                </span>
                                              )}
                                            </div>
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
                                   } else if (item.type === 'holiday') {
                                     const hol = item.holiday;
                                     return (
                                       <div key={item.id} className="flex items-center justify-between p-3 bg-indigo-50/70 rounded-xl border border-indigo-100">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-amber-300 flex items-center justify-center shadow-xs">
                                              <Sparkles size={14} />
                                            </div>
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <p className="text-[11px] font-black text-indigo-950">{format(parseISO(hol.date), 'MMM dd, yyyy')}</p>
                                                <span className="bg-indigo-200/60 text-indigo-900 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                                                  Holiday Pay
                                                </span>
                                              </div>
                                              <p className="text-[9px] text-indigo-700 font-bold uppercase tracking-wider">
                                                {hol.holidayName} {hol.note ? `• ${hol.note}` : ''}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <p className="text-[11px] font-black text-indigo-700 tabular-nums">+{hol.hours.toFixed(2)} hrs</p>
                                            {hol.id && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (confirmingDeleteHolidayId === hol.id) {
                                                    handleDeleteHoliday(hol.id!);
                                                    setConfirmingDeleteHolidayId(null);
                                                  } else {
                                                    setConfirmingDeleteHolidayId(hol.id!);
                                                    setTimeout(() => setConfirmingDeleteHolidayId(null), 3000);
                                                  }
                                                }}
                                                title={confirmingDeleteHolidayId === hol.id ? "Click again to confirm delete" : "Delete Holiday Entry"}
                                                className={cn(
                                                  "p-1 rounded transition-all",
                                                  confirmingDeleteHolidayId === hol.id
                                                    ? "bg-rose-500 text-white font-black text-[9px] px-2 py-0.5 animate-pulse"
                                                    : "hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                                                )}
                                              >
                                                {confirmingDeleteHolidayId === hol.id ? 'Confirm?' : <Trash2 size={13} />}
                                              </button>
                                            )}
                                          </div>
                                       </div>
                                     );
                                   } else {
                                     const pto = item.pto;
                                     return (
                                       <div key={item.id} className="flex items-center justify-between p-3 bg-zrg-teal/5 rounded-xl border border-zrg-teal/10">
                                          <div>
                                            <p className="text-[11px] font-black text-zrg-teal">{format(parseISO(pto.startDate), 'MMM dd, yyyy')}</p>
                                            <p className="text-[9px] text-zrg-teal/60 font-bold uppercase tracking-widest">
                                              PTO Record {pto.managerNote ? `• ${pto.managerNote}` : ''}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-[11px] font-black text-zrg-teal">{pto.hoursRequested.toFixed(2)} hrs</p>
                                          </div>
                                       </div>
                                     );
                                   }
                                 })
                               )}
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

      {/* Add Holiday Modal */}
      <AddHolidayModal
        isOpen={isAddHolidayModalOpen}
        onClose={() => setIsAddHolidayModalOpen(false)}
        employees={employees}
        onSave={handleSaveHolidayRecords}
      />
    </div>
  );
};
