import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { 
  Camera, 
  UserCheck, 
  MapPin, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Contact, AttendanceRecord, ContactType } from '../types';

interface FaceAttendanceProps {
  store: any;
  mode: 'enroll' | 'auth';
  employeeId?: string; // For enrollment
  onComplete?: () => void;
}

const MODEL_URL = 'https://vladmandic.github.io/face-api/model/';

const FaceAttendance: React.FC<FaceAttendanceProps> = ({ store, mode, employeeId, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success' | 'failed'>('idle');
  const [message, setMessage] = useState('Initializing facial recognition...');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isWithinFence, setIsWithinFence] = useState<boolean | null>(null);
  const [livenessScore, setLivenessScore] = useState(0);
  const [lastBlinkTime, setLastBlinkTime] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);

  const activeCompany = (store.companies || []).find((c: any) => c.id === store.activeCompanyIds[0]);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setMessage('Models loaded. Starting camera...');
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Failed to load facial recognition models. Please check your internet connection.');
      }
    };
    loadModels();
  }, []);

  const startVideo = async () => {
    setError(null);
    try {
      // Request front camera (user facing) explicitly for mobile compatibility
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraReady(true);
        setStatus('scanning');
        setMessage('Position your face in the frame');
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera access denied. This often happens in iframes. Please try opening the app in a new tab using the button below, or check your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found on this device. Please ensure a camera is connected and recognized by your system.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is already in use by another application. Please close other apps using the camera and try again.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Could not access camera. Please ensure no other app is using it and that you are on a secure (HTTPS) connection.');
      }
    }
  };

  // Start camera
  useEffect(() => {
    if (!modelsLoaded) return;
    startVideo();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [modelsLoaded]);

  // Get location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(loc);
          
          if (activeCompany?.latitude && activeCompany?.longitude) {
            const dist = getDistance(
              loc.lat, loc.lng, 
              activeCompany.latitude, activeCompany.longitude
            );
            const radius = activeCompany.geoFenceRadius || 500; // Default 500m
            setIsWithinFence(dist <= radius);
          } else {
            // If no company location set, allow but warn
            setIsWithinFence(true);
          }
        },
        (err) => {
          console.error('Error getting location:', err);
          setError('Location access required for attendance.');
        }
      );
    }
  }, [activeCompany]);

  // Haversine distance formula
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const handleDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || status !== 'scanning') return;

    const detections = await faceapi.detectSingleFace(
      videoRef.current, 
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    ).withFaceLandmarks().withFaceDescriptor();

    if (detections) {
      // Draw landmarks for feedback
      const displaySize = { width: videoRef.current.width, height: videoRef.current.height };
      faceapi.matchDimensions(canvasRef.current, displaySize);
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, displaySize.width, displaySize.height);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
      }

      // Liveness: Blink detection
      const landmarks = detections.landmarks;
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      
      const getEyeAspectRatio = (eye: faceapi.Point[]) => {
        const dist = (p1: faceapi.Point, p2: faceapi.Point) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        const v1 = dist(eye[1], eye[5]);
        const v2 = dist(eye[2], eye[4]);
        const h = dist(eye[0], eye[3]);
        return (v1 + v2) / (2 * h);
      };

      const ear = (getEyeAspectRatio(leftEye) + getEyeAspectRatio(rightEye)) / 2;
      
      if (ear < 0.28) { // More forgiving Blink threshold
        if (!isBlinking) {
          setIsBlinking(true);
          setLivenessScore(prev => Math.min(prev + 0.5, 1));
          setLastBlinkTime(Date.now());
        }
      } else {
        setIsBlinking(false);
      }

      // If liveness achieved and location verified
      if (livenessScore >= 1 && (isWithinFence !== false || !activeCompany?.geoFenceRadius)) {
        setStatus('verifying');
        setMessage('Verifying identity...');
        
        if (mode === 'enroll') {
          await enrollFace(detections.descriptor);
        } else {
          await authenticateFace(detections.descriptor);
        }
      } else if (isWithinFence === false) {
        setMessage('Out of range! Please move closer to the office.');
      } else if (livenessScore < 1) {
        setMessage('Please blink to verify you are a real person.');
      }
    } else {
      setMessage('Face not detected. Adjust your position.');
    }
  }, [status, livenessScore, isWithinFence, mode, isBlinking]);

  useEffect(() => {
    let interval: any;
    if (isCameraReady && status === 'scanning') {
      interval = setInterval(handleDetection, 100);
    }
    return () => clearInterval(interval);
  }, [isCameraReady, status, handleDetection]);

  const enrollFace = async (descriptor: Float32Array) => {
    if (!employeeId) return;
    
    try {
      const descriptorArray = Array.from(descriptor);
      store.updateContact(employeeId, { faceDescriptor: descriptorArray });
      setStatus('success');
      setMessage('Face enrolled successfully!');
      setTimeout(() => onComplete?.(), 2000);
    } catch (err) {
      console.error('Enrollment error:', err);
      setStatus('failed');
      setError('Failed to save face enrollment.');
    }
  };

  const authenticateFace = async (descriptor: Float32Array) => {
    try {
      const employees = (store.contacts || []).filter((c: Contact) => c.type === ContactType.EMPLOYEE && c.faceDescriptor);
      
      let bestMatch: { employee: Contact; distance: number } | null = null;
      
      employees.forEach((emp: Contact) => {
        if (!emp.faceDescriptor) return;
        const enrolledDescriptor = new Float32Array(emp.faceDescriptor);
        const distance = faceapi.euclideanDistance(descriptor, enrolledDescriptor);
        
        if (distance < 0.70) { // More forgiving threshold
          if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = { employee: emp, distance };
          }
        }
      });

      if (bestMatch) {
        const emp = (bestMatch as any).employee;
        // Record attendance
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];
        
        // Check if already checked in today
        const existingRecord = store.attendance?.find((a: AttendanceRecord) => a.employeeId === emp.id && a.date === dateStr);
        
        const photo = capturePhoto();

        const user = store.users?.find((u: any) => u.id === emp.assignedUserId);
        const rules = user?.rules;

        if (rules?.requireGeoLocation && isWithinFence !== true) {
             setError("Location verification is strictly required for your profile.");
             setStatus('failed');
             return;
        }

        let lateMinutes = 0;
        if (rules?.shiftStart && !existingRecord) {
             const [shiftH, shiftM] = rules.shiftStart.split(':').map(Number);
             const shiftTime = new Date(now);
             shiftTime.setHours(shiftH, shiftM, 0, 0);
             const diffMs = now.getTime() - shiftTime.getTime();
             if (diffMs > 0) {
                 lateMinutes = Math.floor(diffMs / 60000);
             }
        }
        
        // Let's modify the clock out logic to calculate overtime
        let overtimeHours = 0;
        if (existingRecord && !existingRecord.checkOut && rules?.shiftEnd) {
             const [shiftH, shiftM] = rules.shiftEnd.split(':').map(Number);
             const shiftTime = new Date(now);
             shiftTime.setHours(shiftH, shiftM, 0, 0);
             const diffMs = now.getTime() - shiftTime.getTime();
             if (diffMs > 0) {
                 overtimeHours = parseFloat((diffMs / 3600000).toFixed(2));
             }
        }

        if (existingRecord && !existingRecord.checkOut) {
          // Clock out
          store.addAttendance({
            ...existingRecord,
            checkOut: timeStr,
            overtimeHours: existingRecord.overtimeHours + overtimeHours,
            checkOutPhoto: photo,
            checkOutLocation: location ? { ...location, isWithinFence: isWithinFence || false } : undefined,
            checkOutDevice: navigator.userAgent,
            checkOutLiveness: livenessScore,
          });
          setMessage(`Clock-out successful: ${emp.name}`);
        } else {
          // Clock in
          store.addAttendance({
            employeeId: emp.id,
            date: dateStr,
            checkIn: timeStr,
            status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
            overtimeHours: 0,
            lateMinutes: lateMinutes,
            companyId: activeCompany?.id || '',
            checkInPhoto: photo,
            checkInLocation: location ? { ...location, isWithinFence: isWithinFence || false } : undefined,
            checkInDevice: navigator.userAgent,
            checkInLiveness: livenessScore,
          });
          setMessage(`Clock-in successful: ${emp.name}${lateMinutes > 0 ? ` (Late by ${lateMinutes} mins)` : ''}`);
        }
        
        setStatus('success');
        setTimeout(() => onComplete?.(), 2000);
      } else {
        setStatus('failed');
        setMessage('Identity not recognized. Please try again.');
        setTimeout(() => setStatus('scanning'), 3000);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setStatus('failed');
      setError('Verification failed.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return '';
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    }
    return '';
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-[2.5rem] border border-rose-100 shadow-xl max-w-md mx-auto">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">System Error</h3>
        <p className="text-slate-500 text-sm text-center font-medium mb-8">{error}</p>
        <div className="w-full space-y-3">
          <button 
            onClick={() => startVideo()}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
          >
            Retry Camera Access
          </button>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100"
          >
            Open in New Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100 max-w-2xl mx-auto">
      {/* Header */}
      <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
            {mode === 'enroll' ? 'Face Enrollment' : 'Smart Clock-In'}
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Biometric Authentication Engine</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-[9px] font-black uppercase ${isWithinFence ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            <MapPin size={10} />
            <span>{isWithinFence ? 'In Range' : 'Out of Range'}</span>
          </div>
          <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-[9px] font-black uppercase ${modelsLoaded ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
            <ShieldCheck size={10} />
            <span>{modelsLoaded ? 'Secure' : 'Loading'}</span>
          </div>
        </div>
      </div>

      {/* Camera Stage */}
      <div className="relative aspect-video bg-slate-900 overflow-hidden">
        {!isCameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 space-y-4">
            <Loader2 size={48} className="animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest">Initializing Camera...</p>
          </div>
        )}
        
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className={`w-full h-full object-cover transition-opacity duration-1000 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
          width="640"
          height="480"
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none"
          width="640"
          height="480"
        />

        {/* Overlay UI */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Scanning Frame */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[300px] h-[300px] border-2 border-white/20 rounded-[4rem] relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md px-4 py-1 rounded-full border border-white/20">
                <span className="text-[8px] font-black text-white uppercase tracking-widest">Face Target</span>
              </div>
              
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-3xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-3xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-3xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-3xl" />

              {/* Scanning Line */}
              {status === 'scanning' && (
                <motion.div 
                  initial={{ top: '10%' }}
                  animate={{ top: '90%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-4 right-4 h-0.5 bg-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.8)]"
                />
              )}
            </div>
          </div>

          {/* Status Indicators */}
          <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <motion.div 
                    animate={{ width: `${livenessScore * 100}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
                <span className="text-[8px] font-black text-white uppercase tracking-widest">Liveness</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isWithinFence ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                <span className="text-[8px] font-black text-white uppercase tracking-widest">Geo-Lock Active</span>
              </div>
            </div>
            
            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 flex items-center space-x-3">
              {status === 'scanning' && <Scan size={16} className="text-indigo-400 animate-pulse" />}
              {status === 'verifying' && <RefreshCw size={16} className="text-amber-400 animate-spin" />}
              {status === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
              {status === 'failed' && <XCircle size={16} className="text-rose-400" />}
              <span className="text-[10px] font-black text-white uppercase tracking-widest">{message}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-8 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400">
            <Camera size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification Status</p>
            <p className="text-xs font-bold text-slate-700">
              {status === 'success' ? 'Authenticated' : status === 'failed' ? 'Access Denied' : 'Awaiting Detection'}
            </p>
          </div>
        </div>
        {status === 'failed' && (
          <button 
            onClick={() => setStatus('scanning')}
            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default FaceAttendance;
