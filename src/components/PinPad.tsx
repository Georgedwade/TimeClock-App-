import React, { useState } from 'react';
import { Delete, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface PinPadProps {
  onComplete: (pin: string) => void;
  isLoading?: boolean;
}

export const PinPad: React.FC<PinPadProps> = ({ onComplete, isLoading }) => {
  const [pin, setPin] = useState('');

  const handlePress = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 6) {
        onComplete(newPin);
        setPin(''); 
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto">
      {/* PIN Display Area */}
      <div className="flex justify-center space-x-2 sm:space-x-3 mb-4 sm:mb-6 md:mb-8">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-9 h-12 sm:w-12 sm:h-16 border-2 rounded-xl flex items-center justify-center text-xl sm:text-3xl font-bold transition-all duration-200",
              pin.length > i 
                ? "border-zrg-blue/10 bg-zrg-lightblue text-zrg-blue scale-105" 
                : "border-slate-100 bg-white"
            )}
          >
            {pin.length > i ? '•' : ''}
          </div>
        ))}
      </div>

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <motion.button
            whileTap={{ scale: 0.95 }}
            key={num}
            onClick={() => handlePress(num.toString())}
            disabled={isLoading}
            className="h-11 sm:h-16 md:h-20 bg-white hover:bg-zrg-lightblue disabled:opacity-50 text-xl sm:text-2xl font-bold rounded-xl sm:rounded-2xl border border-zrg-lightblue text-zrg-navy transition-colors shadow-sm"
          >
            {num}
          </motion.button>
        ))}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleDelete}
          disabled={isLoading || pin.length === 0}
          className="h-11 sm:h-16 md:h-20 bg-zrg-orange/5 text-zrg-orange text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-2xl border border-zrg-orange/10 hover:bg-zrg-orange/10 transition-colors"
        >
          Clear
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handlePress('0')}
          disabled={isLoading}
          className="h-11 sm:h-16 md:h-20 bg-white hover:bg-zrg-lightblue disabled:opacity-50 text-xl sm:text-2xl font-bold rounded-xl sm:rounded-2xl border border-zrg-lightblue text-zrg-navy transition-colors shadow-sm"
        >
          0
        </motion.button>
        <button
          disabled={isLoading || pin.length < 1}
          className="h-11 sm:h-16 md:h-20 bg-zrg-blue text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl sm:rounded-2xl shadow-lg shadow-zrg-blue/20 opacity-50 cursor-not-allowed"
        >
          Enter
        </button>
      </div>
    </div>
  );
};

