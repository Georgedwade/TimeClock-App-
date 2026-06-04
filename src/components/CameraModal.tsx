import React, { useRef, useEffect, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraModalProps {
  isOpen: boolean;
  onCapture: (photo: string) => void;
  onClose: () => void;
  title: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCountdown(null);
    }
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 1280, height: 720 } 
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      
      // Start auto-capture countdown
      setCountdown(2);
    } catch (err) {
      setError("Failed to access camera. Please ensure permissions are granted.");
      console.error(err);
    }
  };

  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown reached zero, capture!
      capture();
    }
  }, [countdown]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        onCapture(dataUrl);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl relative border border-slate-100"
      >
        <div className="p-8 border-b flex justify-between items-center bg-white">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
              <Camera className="text-blue-600" size={20} />
              Identity Check
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Automatic Photo Verification</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        <div className="relative aspect-video bg-slate-100 flex items-center justify-center m-8 rounded-2xl overflow-hidden border border-slate-200">
          <AnimatePresence>
            {countdown !== null && countdown > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-blue-600/20 backdrop-blur-[2px]"
              >
                <div className="bg-white/90 backdrop-blur-md rounded-full w-24 h-24 flex items-center justify-center shadow-2xl border border-white">
                  <span className="text-4xl font-black text-blue-600 tabular-nums">{countdown}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error ? (
            <div className="text-slate-800 text-center p-8">
              <p className="text-lg font-bold mb-4">{error}</p>
              <button 
                onClick={startCamera}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover grayscale-[0.2]"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="px-8 pb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            System Capturing Automatically...
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center px-12">
            Stay still. The terminal will verify your identity and close this window once confirmed.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
