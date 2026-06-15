import React, { useRef, useEffect, useState } from 'react';
import { Camera, X, RefreshCw, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface CameraModalProps {
  isOpen: boolean;
  onCapture: (photo: string) => void;
  onClose: () => void;
  title: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode('camera');
      setError(null);
      startCamera();
    } else {
      stopCamera();
      setCountdown(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'camera') {
        startCamera();
      } else {
        stopCamera();
        setCountdown(null);
      }
    } else {
      stopCamera();
      setCountdown(null);
    }
  }, [isOpen, mode]);

  const startCamera = async () => {
    try {
      setError(null);
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
    if (mode === 'upload') return;
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

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Please upload an image file (e.g., JPG, PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        onCapture(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-sans">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl relative border border-slate-100 flex flex-col"
      >
        <div className="p-8 border-b flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
              <Camera className="text-zrg-blue" size={20} />
              Identity Check
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Photo Verification</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-300">
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector Tab Container */}
        <div className="flex border border-slate-100 bg-slate-50/50 p-1 mx-8 mt-6 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode('camera');
              setError(null);
            }}
            className={cn(
              "flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2",
              mode === 'camera' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Camera size={14} />
            Live Camera
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('upload');
            }}
            className={cn(
              "flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2",
              mode === 'upload' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <UploadCloud size={14} />
            Upload Photo
          </button>
        </div>

        <div className="relative aspect-video bg-slate-100 flex items-center justify-center m-8 mt-4 rounded-2xl overflow-hidden border border-slate-200">
          {mode === 'upload' ? (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-full h-full flex flex-col items-center justify-center border-2 border-dashed p-6 cursor-pointer transition-all",
                isDragging 
                  ? "border-zrg-blue bg-zrg-lightblue/30" 
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100/60 hover:border-zrg-blue/40"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              <UploadCloud className={cn("mb-2", isDragging ? "text-zrg-blue animate-bounce" : "text-slate-400")} size={36} />
              <p className="text-sm font-bold text-slate-700 text-center">
                Drag & drop your photo or <span className="text-zrg-blue underline">browse files</span>
              </p>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">
                Supports JPG, JPEG, PNG (Max 5MB)
              </p>
            </div>
          ) : (
            <>
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
                <div className="text-slate-850 text-center p-6 flex flex-col items-center justify-center max-w-md">
                  <p className="text-sm font-bold text-slate-700 mb-4">{error}</p>
                  <div className="flex gap-4">
                    <button 
                      onClick={startCamera}
                      className="bg-zrg-blue hover:bg-zrg-blue/90 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all shrink-0 cursor-pointer"
                    >
                      Retry Camera
                    </button>
                    <button 
                      onClick={() => {
                        setMode('upload');
                        setError(null);
                      }}
                      className="bg-slate-100 hover:bg-slate-250 text-slate-700 px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shrink-0 cursor-pointer"
                    >
                      Upload Photo Instead
                    </button>
                  </div>
                </div>
              ) : (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover grayscale-[0.2]"
                />
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="px-8 pb-8 flex flex-col items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            {mode === 'camera' ? 'System Capturing Automatically...' : 'Ready for photo upload...'}
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center px-12 leading-relaxed">
            {mode === 'camera' 
              ? 'Stay still. The terminal will verify your identity and close this window once confirmed.'
              : 'Select or drag your photo above to authenticate. Your identity will be verified and the process completed.'}
          </p>
        </div>
      </motion.div>
    </div>
  );
};
