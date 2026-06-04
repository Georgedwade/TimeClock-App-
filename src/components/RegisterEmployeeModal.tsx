import React, { useState } from 'react';
import { X, UserPlus, Shield, User } from 'lucide-react';
import { motion } from 'motion/react';
import { Employee } from '../types';

interface RegisterEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (employee: Omit<Employee, 'id'>) => Promise<void>;
}

export const RegisterEmployeeModal: React.FC<RegisterEmployeeModalProps> = ({ isOpen, onClose, onRegister }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pin: '',
    role: 'staff' as 'staff' | 'manager',
    title: '',
    ptoBalance: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Please provide a display name.');
      return;
    }
    if (!formData.pin || formData.pin.length !== 6) {
      setError('Please provide a 6-digit PIN.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const registrationData: Omit<Employee, 'id'> = {
        name: formData.name.trim(),
        pin: formData.pin,
        role: formData.role,
        title: formData.title.trim() || undefined,
        ptoBalance: formData.ptoBalance || 0
      };

      if (formData.email && formData.email.trim() !== '') {
        registrationData.email = formData.email.trim();
      }

      await onRegister(registrationData);
      onClose();
      setFormData({
        name: '',
        email: '',
        pin: '',
        role: 'staff',
        title: '',
        ptoBalance: 0
      });
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Failed to register. ';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          errMsg += parsed.error || err.message;
        } catch {
          errMsg += err.message;
        }
      } else {
        errMsg += String(err);
      }
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-zrg-blue/10 rounded-xl flex items-center justify-center text-zrg-blue">
               <UserPlus size={20} />
             </div>
             <div>
               <h2 className="text-xl font-black uppercase tracking-tight">Register Employee</h2>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Add new staff to the directory</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-xs font-bold leading-relaxed mb-1">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Display Name</label>
              <input 
                autoFocus
                required
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
                placeholder="Employee Full Name"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Email Address</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
                placeholder="employee@zrg.com"
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Job Title</label>
              <input 
                type="text" 
                value={formData.title} 
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all"
                placeholder="e.g. Biomedical Technician"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">PIN Code (6 Digits)</label>
                <input 
                  required
                  type="text" 
                  maxLength={6}
                  value={formData.pin} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, pin: val });
                  }}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-zrg-blue transition-all tabular-nums"
                  placeholder="000000"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Access Role</label>
                <div className="flex bg-slate-50 rounded-xl p-1 border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'staff' })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                      formData.role === 'staff' ? "bg-white text-zrg-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <User size={12} />
                    Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'manager' })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                      formData.role === 'manager' ? "bg-zrg-navy text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Shield size={12} />
                    Manager
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-zrg-blue text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-zrg-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Registering...' : 'Complete Registration'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
