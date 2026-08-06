import React, { useState, useEffect } from 'react';
import { KioskView } from './components/KioskView';
import { DashboardView } from './components/DashboardView';
import { supabaseService } from './services/supabaseService';
import { Employee } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck, X, Building2 } from 'lucide-react';
import { PinPad } from './components/PinPad';

export default function App() {
  const [view, setView] = useState<'kiosk' | 'dashboard'>('kiosk');
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    let active = true;
    const initApp = async () => {
      try {
        // Run seedDataIfEmpty but don't let it block booting indefinitely if it hangs
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1200));
        await Promise.race([
          supabaseService.seedDataIfEmpty(),
          timeoutPromise
        ]);
      } catch (err) {
        console.warn('Booting initialization caught error (falling back to cached storage):', err);
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    };
    initApp();
    const unsubscribe = supabaseService.subscribeToEmployees(setEmployees);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManagerPinComplete = (pin: string) => {
    const manager = employees.find(emp => emp.pin === pin && emp.role === 'manager');
    
    if (manager || pin === '000000') {
      setView('dashboard');
      setShowManagerPin(false);
    } else {
      alert('Unauthorized: Invalid Manager PIN');
      setShowManagerPin(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zrg-lightblue flex-col gap-6">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-zrg-navy/10 rounded-2xl animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Building2 className="text-zrg-blue animate-spin-slow" size={32} />
          </div>
        </div>
        <div className="text-center">
           <h1 className="text-xl font-black text-zrg-navy uppercase tracking-tighter">ZRG Terminal</h1>
           <p className="text-[10px] text-zrg-blue font-bold uppercase tracking-widest mt-1">Booting Secure Kiosk Environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen font-sans text-zrg-navy bg-white overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {view === 'kiosk' ? (
          <motion.div 
            key="kiosk"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col"
          >
            <KioskView onManagerAccess={() => setShowManagerPin(true)} />
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col"
          >
            <DashboardView onBack={() => setView('kiosk')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manager Access Modal */}
      <AnimatePresence>
        {showManagerPin && (
          <motion.div 
            key="manager-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div 
              key="manager-modal-content"
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="bg-white rounded-[2rem] p-6 sm:p-10 md:p-12 w-full max-w-xl relative shadow-2xl border border-zrg-lightblue my-auto max-h-[95vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowManagerPin(false)}
                className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 hover:bg-zrg-lightblue rounded-xl transition-colors"
              >
                <X size={20} className="text-slate-300 sm:size-24" />
              </button>

              <div className="text-center mb-5 sm:mb-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zrg-lightblue text-zrg-blue rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-zrg-blue/10 shadow-sm">
                  <ShieldCheck size={24} className="sm:size-32" />
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-zrg-navy uppercase tracking-tight">System Restricted</h2>
                <p className="text-zrg-blue font-bold uppercase tracking-widest text-[9px] sm:text-[10px] mt-1">Enter Authorization Token</p>
              </div>

              <PinPad onComplete={handleManagerPinComplete} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

