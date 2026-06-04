import React, { useState, useEffect, useMemo } from 'react';
import { PinPad } from './PinPad';
import { CameraModal } from './CameraModal';
import { PTORequestModal } from './PTORequestModal';
import { firebaseService } from '../services/firebaseService';
import { Employee, LogType, TimeLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Coffee, LogOut, CheckCircle2, AlertCircle, ShieldEllipsis, Building2, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { differenceInMinutes, format } from 'date-fns';

interface KioskViewProps {
  onManagerAccess: () => void;
}

const getPunchLabel = (type: LogType) => {
  switch (type) {
    case LogType.CLOCK_IN:
      return 'Clock In';
    case LogType.BREAK_START:
      return 'Break Start';
    case LogType.BREAK_END:
      return 'Break End';
    case LogType.CLOCK_OUT:
      return 'Clock Out';
    default:
      return type;
  }
};

const getPunchStyleByLogType = (type: LogType) => {
  switch (type) {
    case LogType.CLOCK_IN:
      return {
        bg: 'bg-zrg-green/10',
        text: 'text-zrg-green',
        border: 'border-zrg-green/20'
      };
    case LogType.BREAK_START:
      return {
        bg: 'bg-zrg-teal/10',
        text: 'text-zrg-teal',
        border: 'border-zrg-teal/20'
      };
    case LogType.BREAK_END:
      return {
        bg: 'bg-zrg-blue/10',
        text: 'text-zrg-blue',
        border: 'border-zrg-blue/20'
      };
    case LogType.CLOCK_OUT:
      return {
        bg: 'bg-zrg-orange/10',
        text: 'text-zrg-orange',
        border: 'border-zrg-orange/20'
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-200'
      };
  }
};

export const KioskView: React.FC<KioskViewProps> = ({ onManagerAccess }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedAction, setSelectedAction] = useState<LogType | 'PTO_REQUEST' | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPTOModal, setShowPTOModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadEmployees();
    const unsubLogs = firebaseService.subscribeToLogs(setLogs);
    const unsubEmps = firebaseService.subscribeToEmployees(setEmployees);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      unsubLogs();
      unsubEmps();
      clearInterval(timer);
    };
  }, []);

  const loadEmployees = async () => {
    const list = await firebaseService.getEmployees();
    setEmployees(list);
  };

  const handlePinComplete = (pin: string) => {
    const found = employees.find(e => e.pin === pin);
    if (found) {
      setSelectedEmployee(found);
    } else {
      setFeedback({ type: 'error', message: 'Invalid PIN. Please try again.' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleActionSelect = (action: LogType | 'PTO_REQUEST') => {
    setSelectedAction(action);
    if (action === 'PTO_REQUEST') {
      setShowPTOModal(true);
    } else {
      setShowCamera(true);
    }
  };

  const handlePTORequestSuccess = (message: string) => {
    setFeedback({ type: 'success', message });
    setTimeout(() => {
      setSelectedEmployee(null);
      setSelectedAction(null);
      setFeedback(null);
    }, 4000);
  };

  const handleCapture = async (photoUrl: string) => {
    if (!selectedEmployee || !selectedAction || selectedAction === 'PTO_REQUEST') return;

    setIsLoading(true);
    setShowCamera(false);
    
    try {
      await firebaseService.addLog({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        type: selectedAction as LogType,
        timestamp: new Date(),
        photoUrl,
      });

      setFeedback({ 
        type: 'success', 
        message: `${selectedEmployee.name} logged ${selectedAction.replace('_', ' ')} successfully.` 
      });
      
      setTimeout(() => {
        setSelectedEmployee(null);
        setSelectedAction(null);
        setFeedback(null);
      }, 3000);

    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to save log. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const liveStatus = useMemo(() => {
    const logTypePriority: Record<LogType, number> = {
      [LogType.CLOCK_IN]: 1,
      [LogType.BREAK_START]: 2,
      [LogType.BREAK_END]: 3,
      [LogType.CLOCK_OUT]: 4
    };

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

  const currentShift = useMemo(() => {
    if (!selectedEmployee) return null;

    const empLogs = logs
      .filter(l => l.employeeId === selectedEmployee.id)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const lastClockInIdx = empLogs.reduce((lastIdx, log, idx) => {
      return log.type === LogType.CLOCK_IN ? idx : lastIdx;
    }, -1);

    if (lastClockInIdx === -1) {
      return null;
    }

    const lastClockIn = empLogs[lastClockInIdx];
    const subsequentLogs = empLogs.slice(lastClockInIdx + 1);
    const clockOut = subsequentLogs.find(l => l.type === LogType.CLOCK_OUT);

    if (clockOut) {
      return null;
    }

    const shiftBreaks: { start: TimeLog; end: TimeLog | null }[] = [];
    let currentBreak: { start: TimeLog; end: TimeLog | null } | null = null;

    subsequentLogs.forEach(log => {
      if (log.type === LogType.BREAK_START) {
        currentBreak = { start: log, end: null };
      } else if (log.type === LogType.BREAK_END && currentBreak) {
        currentBreak.end = log;
        shiftBreaks.push(currentBreak);
        currentBreak = null;
      }
    });

    if (currentBreak) {
      shiftBreaks.push(currentBreak);
    }

    const isOnBreak = currentBreak !== null;

    let totalBreakMs = 0;
    shiftBreaks.forEach(b => {
      const end = b.end ? b.end.timestamp : currentTime;
      totalBreakMs += Math.max(0, end.getTime() - b.start.timestamp.getTime());
    });

    const totalElapsedMs = Math.max(0, currentTime.getTime() - lastClockIn.timestamp.getTime());
    const netWorkedMs = Math.max(0, totalElapsedMs - totalBreakMs);

    const netWorkedMinutes = Math.floor(netWorkedMs / 60000);
    const workedHours = Math.floor(netWorkedMinutes / 60);
    const workedMinutes = netWorkedMinutes % 60;

    const breakMinutes = Math.floor(totalBreakMs / 60000);
    const breakHours = Math.floor(breakMinutes / 60);
    const breakMins = breakMinutes % 60;

    return {
      clockInTime: lastClockIn.timestamp,
      isOnBreak,
      breaks: shiftBreaks,
      workedHours,
      workedMinutes,
      breakHours,
      breakMins,
      totalBreakMinutes: breakMinutes
    };
  }, [selectedEmployee, logs, currentTime]);

  const recentShiftPunches = useMemo(() => {
    if (!selectedEmployee) return [];

    const empLogs = logs
      .filter(l => l.employeeId === selectedEmployee.id)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const lastClockInIdx = empLogs.reduce((lastIdx, log, idx) => {
      return log.type === LogType.CLOCK_IN ? idx : lastIdx;
    }, -1);

    if (lastClockInIdx === -1) {
      return [];
    }

    return empLogs.slice(lastClockInIdx);
  }, [selectedEmployee, logs]);

  const actions = [
    { type: LogType.CLOCK_IN, label: 'CLOCK IN', sub: 'Shift Start', color: 'bg-zrg-green' },
    { type: LogType.BREAK_START, label: 'START BREAK', sub: 'Paid/Unpaid', color: 'bg-zrg-teal' },
    { type: LogType.BREAK_END, label: 'END BREAK', sub: 'Resume Work', color: 'bg-zrg-blue' },
    { type: LogType.CLOCK_OUT, label: 'CLOCK OUT', sub: 'Shift End', color: 'bg-zrg-orange' },
    { type: 'PTO_REQUEST', label: 'PTO REQUEST', sub: 'Request Time Off', color: 'bg-zrg-navy' },
  ];

  return (
    <div className="flex flex-col flex-1 h-screen overflow-hidden bg-zrg-lightblue text-zrg-navy font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-2.5 sm:py-4 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-zrg-blue rounded-lg flex items-center justify-center">
            <Building2 className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-zrg-navy uppercase">ZRG Medical</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Time Clock Kiosk v2.4</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl sm:text-3xl font-light text-zrg-navy tabular-nums">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </div>
          <div className="text-[11px] sm:text-sm text-zrg-blue font-bold uppercase tracking-tight">
            {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Section: Kiosk View */}
        <section className="w-2/3 p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center border-r border-slate-100 bg-white relative overflow-y-auto">
          <AnimatePresence mode="wait">
            {!selectedEmployee ? (
              <motion.div 
                key="pin-entry"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-md my-auto py-2"
              >
                <div className="text-center mb-4 sm:mb-6 lg:mb-8">
                  <h2 className="text-xl sm:text-2xl font-bold text-zrg-navy uppercase tracking-tight">Welcome, Employee</h2>
                  <p className="text-xs sm:text-sm text-slate-400 font-medium">Enter your 6-digit PIN to proceed</p>
                </div>
                <PinPad onComplete={handlePinComplete} isLoading={isLoading} />
              </motion.div>
            ) : feedback ? (
              <motion.div 
                key="feedback"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="text-center p-12 bg-white border border-zrg-lightblue rounded-3xl max-w-md w-full shadow-lg shadow-zrg-lightblue/50"
              >
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm",
                  feedback.type === 'success' ? "bg-zrg-lightblue text-zrg-blue" : "bg-zrg-orange/10 text-zrg-orange"
                )}>
                  {feedback.type === 'success' ? <CheckCircle2 size={40} /> : <AlertCircle size={40} />}
                </div>
                <h3 className="text-2xl font-bold text-zrg-navy mb-2">{feedback.message}</h3>
                <p className="text-slate-400 font-medium">Resetting kiosk in a few seconds...</p>
              </motion.div>
            ) : (
              <motion.div 
                key="actions"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg animate-fade-in"
              >
                <div className="text-center mb-6 sm:mb-8">
                  <h2 className="text-2xl sm:text-3xl font-black text-zrg-navy uppercase tracking-tight">Hello, {selectedEmployee.name.split(' ')[0]}</h2>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Select an action</p>
                </div>

                {recentShiftPunches.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 mb-6 text-left shadow-sm">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 text-zrg-navy">
                        <Clock size={16} className="text-zrg-blue" />
                        <span className="text-[11px] uppercase font-black tracking-widest">Shift Punch Log</span>
                      </div>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                        currentShift 
                          ? (currentShift.isOnBreak ? "bg-zrg-teal/10 text-zrg-teal" : "bg-zrg-green/10 text-zrg-green animate-pulse") 
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {currentShift ? (currentShift.isOnBreak ? "On Break" : "Working / Active") : "Clocked Out"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {recentShiftPunches.map((punch, idx) => {
                        const styles = getPunchStyleByLogType(punch.type);
                        return (
                          <div key={idx} className={cn("flex justify-between items-center px-3 py-2 rounded-xl border text-xs", styles.bg, styles.border)}>
                            <span className={cn("font-bold uppercase text-[10px] tracking-wide", styles.text)}>
                              {getPunchLabel(punch.type)}
                            </span>
                            <span className="font-bold text-slate-700 tabular-nums">
                              {format(punch.timestamp, 'hh:mm:ss a')}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {currentShift && (
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Compensated Time</span>
                          <span className="font-black text-zrg-blue text-sm tabular-nums">
                            {currentShift.workedHours > 0 ? `${currentShift.workedHours}h ` : ''}{currentShift.workedMinutes}m
                          </span>
                        </div>
                        {currentShift.totalBreakMinutes > 0 && (
                          <div className="text-right">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Total Break Duration</span>
                            <span className="font-bold text-slate-600 text-sm tabular-nums">
                              {currentShift.breakHours > 0 ? `${currentShift.breakHours}h ` : ''}{currentShift.breakMins}m
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Always show status and PTO */}
                <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 sm:p-5 mb-6 text-left flex justify-between items-center shadow-inner">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1">Current Status</span>
                    <span className={cn(
                      "font-black text-sm",
                      currentShift 
                        ? (currentShift.isOnBreak ? "text-zrg-teal" : "text-zrg-green") 
                        : "text-slate-500"
                    )}>
                      {currentShift ? (currentShift.isOnBreak ? "On Break" : "Clocked In / Active") : "Not Clocked In"}
                    </span>
                  </div>
                  {selectedEmployee.ptoBalance !== undefined && (
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1">PTO Balance</span>
                      <span className="font-black text-zrg-teal text-sm">{selectedEmployee.ptoBalance.toFixed(2)} hrs</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {actions.map((action) => (
                    <motion.button
                      key={action.type}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleActionSelect(action.type as any)}
                      className={cn(
                        "p-8 rounded-2xl text-white flex flex-col items-center justify-center shadow-lg transition-all relative overflow-hidden",
                        action.color,
                        action.type === 'PTO_REQUEST' && "col-span-2"
                      )}
                    >
                      {action.type === 'PTO_REQUEST' && <Calendar className="absolute opacity-10 -right-4 -bottom-4 rotate-12" size={80} />}
                      <div className="flex items-center gap-2">
                        {action.type === 'PTO_REQUEST' && <Calendar size={20} />}
                        <span className="text-xl font-bold tracking-tight">{action.label}</span>
                      </div>
                      <span className="text-[10px] opacity-80 uppercase font-black tracking-widest mt-1">{action.sub}</span>
                    </motion.button>
                  ))}
                </div>
                
                <button 
                  onClick={() => setSelectedEmployee(null)}
                  className="mt-10 w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-xs hover:text-slate-600 transition-colors"
                >
                  Cancel and Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Right Section: Status Sidebar */}
        <section className="w-1/3 p-6 flex flex-col space-y-6 overflow-hidden bg-white">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-zrg-navy uppercase tracking-tight text-sm">Live Status</h3>
            <button 
              onClick={onManagerAccess}
              className="text-[10px] bg-zrg-lightblue hover:bg-zrg-blue/10 px-3 py-1.5 rounded font-bold text-zrg-blue uppercase transition-colors"
            >
              Admin Access
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {employees.map(emp => {
              const status = liveStatus[emp.id];
              const isOverdueBreak = status.status === 'On Break' && 
                status.lastLog && differenceInMinutes(new Date(), status.lastLog.timestamp) > 30;

              return (
                <div key={`kiosk-status-${emp.id}`} className={cn(
                  "bg-white p-4 rounded-xl border transition-all duration-300",
                  status.status === 'Clocked Out' ? "opacity-60 border-slate-100" : "border-zrg-lightblue bg-zrg-lightblue/20"
                )}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-bold text-zrg-navy line-clamp-1">{emp.name}</div>
                      <div className={cn(
                        "text-[10px] font-bold uppercase mt-1 flex items-center gap-1.5",
                        status.status === 'Active' ? "text-zrg-green" :
                        status.status === 'On Break' ? (isOverdueBreak ? "text-zrg-orange" : "text-zrg-teal") :
                        "text-slate-400"
                      )}>
                        {status.status}
                        {status.lastLog && (
                          <span className="opacity-60">({differenceInMinutes(new Date(), status.lastLog.timestamp)}m)</span>
                        )}
                        {isOverdueBreak && <span className="animate-pulse">— OVERDUE</span>}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white border border-zrg-lightblue flex items-center justify-center shrink-0 shadow-sm">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        status.status === 'Active' ? "bg-zrg-green shadow-[0_0_8px_rgba(31,177,76,0.4)]" :
                        status.status === 'On Break' ? "bg-zrg-teal" :
                        "bg-slate-200"
                      )} />
                    </div>
                  </div>
                  {isOverdueBreak && status.lastLog?.note && (
                    <div className="mt-3 p-2 bg-zrg-orange/5 rounded border border-zrg-orange/10 text-[10px] text-zrg-orange italic">
                      Note: {status.lastLog.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Hub */}
          <div className="bg-zrg-navy rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-zrg-blue/5 rounded-full -translate-y-16 translate-x-16" />
            <div className="text-[10px] font-black uppercase tracking-widest text-zrg-blue mb-4 relative z-10">Administrative Hub</div>
            <div className="grid grid-cols-2 gap-3 relative z-10">
              <button onClick={onManagerAccess} className="bg-white/5 hover:bg-white/10 p-3 rounded-xl flex flex-col items-center transition-colors border border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-tight">Records</span>
              </button>
              <button onClick={onManagerAccess} className="bg-white/5 hover:bg-white/10 p-3 rounded-xl flex flex-col items-center transition-colors border border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-tight">Export</span>
              </button>
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center text-[10px] relative z-10">
              <span className="text-slate-400 font-bold uppercase">Pay Period</span>
              <span className="font-bold text-zrg-teal">MAY 01 - MAY 15</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-zrg-navy py-3 px-8 flex justify-between items-center text-[10px] text-slate-500 font-black uppercase tracking-widest shrink-0 border-t border-white/5">
        <div>ZRG Security: <span className="text-zrg-green">Active</span></div>
        <div>Network: <span className="text-zrg-blue">Encrypted</span></div>
        <div className="text-zrg-blue/60">Terminal ID: ZRG-TAB-042</div>
      </footer>

      <CameraModal 
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCapture}
        title={selectedAction?.replace('_', ' ').toUpperCase() || ''}
      />

      <PTORequestModal 
        isOpen={showPTOModal}
        employee={selectedEmployee}
        onClose={() => {
          setShowPTOModal(false);
          setSelectedAction(null);
        }}
        onSuccess={handlePTORequestSuccess}
      />
    </div>
  );
};

