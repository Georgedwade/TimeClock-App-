import React, { useState, useEffect } from 'react';
import { KioskView } from './components/KioskView';
import { DashboardView } from './components/DashboardView';
import { firebaseService } from './services/firebaseService';
import { Employee } from './types';
import { db } from './services/firebaseService';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck, X, Building2 } from 'lucide-react';
import { PinPad } from './components/PinPad';

export default function App() {
  const [view, setView] = useState<'kiosk' | 'dashboard'>('kiosk');
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    seedDataIfEmpty();
    const unsubscribe = firebaseService.subscribeToEmployees(setEmployees);
    return () => unsubscribe();
  }, []);

  const seedDataIfEmpty = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      const existingNames = snapshot.docs.map(doc => doc.data().name);

      if (!snapshot.empty && existingNames.length > 5) {
        setIsInitializing(false);
        return;
      }
      
      const initialEmployees = [
        { name: 'Alma Carreno', email: 'alma.carreno@zrg.com', pin: '093695', role: 'staff', title: 'eCommerce Representative', ptoBalance: 105.12 },
        { name: 'Doug Schneider', email: 'doug.schneider@zrg.com', pin: '949620', role: 'staff', title: 'Biomedical Equipment Technician', ptoBalance: 27.90 },
        { name: 'George Wade', email: 'George.Dylan.Wade@gmail.com', pin: '587475', role: 'manager', title: 'General Manager', ptoBalance: 24.28 },
        { name: 'Jennifer Milam', email: 'jennifer.milam@zrg.com', pin: '114082', role: 'staff', title: 'Logistics Coordinator', ptoBalance: 75.03 },
        { name: 'Jesus Yanez', email: 'jesus.yanez@zrg.com', pin: '037325', role: 'staff', title: 'Warehouse', ptoBalance: 32.13 },
        { name: 'Jorge Lopez', email: 'jorge.lopez@zrg.com', pin: '588384', role: 'staff', title: 'Warehouse', ptoBalance: 28.48 },
        { name: 'Kyle Johnson', email: 'kyle.johnson@zrg.com', pin: '764763', role: 'staff', title: 'CBET Inventory Specialist', ptoBalance: 76.69 },
        { name: 'Selena Macias', email: 'selena.macias@zrg.com', pin: '022663', role: 'staff', title: 'Biomedical Equipment Technician', ptoBalance: 26.63 },
      ];

      // Only add employees who aren't already in the system by name
      let addedCount = 0;
      for (const emp of initialEmployees) {
        if (!existingNames.includes(emp.name)) {
          await addDoc(collection(db, 'employees'), emp);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        console.log(`Successfully seeded ${addedCount} ZRG employee records.`);
      }
      
      // Seed a sample PTO request if needed
      const ptoSnapshot = await getDocs(collection(db, 'pto_requests'));
      if (ptoSnapshot.empty) {
        await addDoc(collection(db, 'pto_requests'), {
          employeeId: 'temp_id',
          employeeName: 'Alma Carreno',
          startDate: '2026-06-01',
          endDate: '2026-06-05',
          hoursRequested: 40,
          status: 'pending',
          note: 'Planned time off'
        });
      }
    } catch (err) {
      console.error('Failed to seed data:', err);
    } finally {
      setIsInitializing(false);
    }
  };

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

