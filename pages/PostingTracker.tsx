import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction, type PostingRecord } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import JSZip from 'jszip';
import {
  Camera, Save, Download, X, RotateCcw, MapPin, Package,
  History, Search, Video, FileJson, FolderOpen, ChevronDown,
} from 'lucide-react';

const STATUSES = ['received', 'in_transit', 'delivered', 'posted', 'exception'] as const;

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  posted: 'Posted',
  exception: 'Exception',
};

const STATUS_COLORS: Record<string, string> = {
  received: 'text-accent-green',
  in_transit: 'text-accent-yellow',
  delivered: 'text-accent-sky',
  posted: 'text-accent-sky',
  exception: 'text-accent-red',
};

const STATUS_BG: Record<string, string> = {
  received: 'bg-accent-green/20',
  in_transit: 'bg-accent-yellow/20',
  delivered: 'bg-accent-sky/10',
  posted: 'bg-accent-sky/20',
  exception: 'bg-accent-red/20',
};

export default function PostingTracker() {
  const { user } = useAuth();
  const addNotification = useAppStore((s) => s.addNotification);

  const operatorName = user?.displayName || user?.username || 'Unknown';

  // Form state
  const [postingId, setPostingId] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [status, setStatus] = useState<PostingRecord['status']>('received');
  const [carrier, setCarrier] = useState('Ozon');
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState('');
  const [city, setCity] = useState('');
  const [geo, setGeo] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [videoData, setVideoData] = useState('');

  // Records & filters
  const [records, setRecords] = useState<PostingRecord[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFolder, setFilterFolder] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Camera state
  const [cameraOn, setCameraOn] = useState(false);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const videoChunksRef = useRef<Blob[]>([]);

  const loadRecords = useCallback(async () => {
    const items = await db.postingRecords.reverse().toArray();
    setRecords(items);
    const ids = Array.from(new Set(items.slice(0, 20).map((r) => r.postingId).filter(Boolean)));
    setRecentIds(ids);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      addNotification({
        title: 'Camera Error',
        message: 'Unable to access camera. Check permissions.',
        type: 'error',
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setCameraOn(false);
    setRecording(false);
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 46, w, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`ID: ${postingId || 'N/A'}`, 8, h - 30);
    ctx.font = '11px monospace';
    ctx.fillText(`${new Date().toLocaleString()} | ${city || geo || 'No Location'}`, 8, h - 16);
    ctx.fillText(`Op: ${operatorName}`, 8, h - 4);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    drawOverlay(ctx, w, h);
    setPhotoData(canvas.toDataURL('image/jpeg', 0.85));
    addNotification({
      title: 'Photo Captured',
      message: 'Image saved with watermark overlay.',
      type: 'success',
    });
  };

  const startRecording = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      if (!video || !ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      drawOverlay(ctx, w, h);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    const canvasStream = canvas.captureStream(30);
    const audioTracks = streamRef.current?.getAudioTracks() || [];
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mime = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    const recorder = new MediaRecorder(combined, { mimeType: mime });
    videoChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: mime });
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoData(reader.result as string);
      };
      reader.readAsDataURL(blob);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      addNotification({
        title: 'Video Saved',
        message: 'Clip recorded with baked-in overlay.',
        type: 'success',
      });
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      addNotification({
        title: 'Geolocation',
        message: 'Not supported by this browser.',
        type: 'warning',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lng = pos.coords.longitude.toFixed(4);
        setGeo(`${lat}, ${lng}`);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const cityName =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            'Unknown';
          setCity(cityName);
          addNotification({
            title: 'Location Found',
            message: `${cityName} (${lat}, ${lng})`,
            type: 'success',
          });
        } catch {
          setCity('');
          addNotification({
            title: 'Location Coordinates',
            message: `${lat}, ${lng}`,
            type: 'info',
          });
        }
      },
      (err) => {
        addNotification({
          title: 'Location Error',
          message: err.message || 'Could not retrieve location.',
          type: 'warning',
        });
      }
    );
  };

  const saveRecord = async () => {
    if (!postingId.trim()) {
      addNotification({
        title: 'Validation',
        message: 'Posting ID is required.',
        type: 'warning',
      });
      return;
    }
    const record: PostingRecord = {
      postingId: postingId.trim(),
      trackingId: trackingId.trim() || undefined,
      status,
      carrier: carrier.trim() || 'Ozon',
      photoData: photoData || undefined,
      videoData: videoData || undefined,
      geolocation: geo || undefined,
      city: city || undefined,
      note: note.trim() || undefined,
      operator: operatorName,
      createdAt: new Date().toISOString(),
      folder: folder.trim() || undefined,
    };
    await db.postingRecords.add(record);
    await logAction('POSTING_RECORD', `Recorded ${postingId} as ${status}`, operatorName);
    addNotification({
      title: 'Saved',
      message: `Posting ${postingId} recorded successfully.`,
      type: 'success',
    });
    setRecentIds((prev) => Array.from(new Set([postingId, ...prev])).slice(0, 10));
    resetForm();
    loadRecords();
  };

  const resetForm = () => {
    setPostingId('');
    setTrackingId('');
    setStatus('received');
    setCarrier('Ozon');
    setFolder('');
    setNote('');
    setPhotoData('');
    setVideoData('');
    setGeo('');
    setCity('');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filteredRecords, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `posting-records-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportZip = async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(filteredRecords, null, 2));
    filteredRecords.forEach((rec, idx) => {
      if (rec.photoData) {
        const base64 = rec.photoData.split(',')[1];
        if (base64) zip.file(`photo_${idx}_${rec.postingId}.jpg`, base64, { base64: true });
      }
      if (rec.videoData) {
        const base64 = rec.videoData.split(',')[1];
        if (base64) {
          const ext = rec.videoData.includes('webm') ? 'webm' : 'mp4';
          zip.file(`video_${idx}_${rec.postingId}.${ext}`, base64, { base64: true });
        }
      }
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `posting-export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRecords = records.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterFolder && r.folder !== filterFolder) return false;
    if (filterDateFrom && r.createdAt && r.createdAt < new Date(filterDateFrom).toISOString()) return false;
    if (filterDateTo && r.createdAt && r.createdAt > new Date(filterDateTo + 'T23:59:59').toISOString()) return false;
    const hay = `${r.postingId} ${r.trackingId || ''} ${r.operator} ${r.note || ''}`.toLowerCase();
    if (searchQuery && !hay.includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const folders = Array.from(new Set(records.map((r) => r.folder).filter(Boolean) as string[]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Posting Tracker</h1>
        <p className="text-sm text-text-secondary mt-1">
          Record posting receipts with photo, video, and location proof
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-accent-sky" />
              <h2 className="text-sm font-semibold text-text-primary">New Record</h2>
            </div>

            {/* Posting & Tracking */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Posting / Tracking ID
                </label>
                <div className="flex gap-2">
                  <input
                    value={postingId}
                    onChange={(e) => setPostingId(e.target.value.toUpperCase())}
                    className="flex-1 bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono"
                    placeholder="PST-001"
                  />
                  <button
                    onClick={() => setPostingId('')}
                    className="p-2 text-text-secondary hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {recentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {recentIds.slice(0, 5).map((id) => (
                      <button
                        key={id}
                        onClick={() => setPostingId(id)}
                        className="text-[10px] bg-white/[0.03] text-text-secondary px-2 py-1 rounded border border-white/[0.06] hover:text-accent-sky hover:border-accent-sky/30 transition-colors"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Tracking ID (optional)
                </label>
                <input
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono"
                  placeholder="TRK-XXXX"
                />
              </div>
            </div>

            {/* Status, Carrier, Folder, Location */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Status
                </label>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PostingRecord['status'])}
                    className="w-full appearance-none bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Carrier
                </label>
                <input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                  placeholder="Ozon"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Folder / Group
                </label>
                <input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                  placeholder="June 2024"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                  Location
                </label>
                <button
                  onClick={getLocation}
                  className={`w-full flex items-center justify-center gap-1 py-2 text-xs rounded-md border transition-colors ${
                    geo
                      ? 'bg-accent-green/20 border-accent-green/30 text-accent-green'
                      : 'bg-white/[0.03] border-white/[0.08] text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="truncate">{city || geo || 'Get Location'}</span>
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                Notes
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-sky transition-colors resize-none"
                placeholder="Operator notes..."
              />
            </div>

            {/* Camera / Photo / Video */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-4 h-4 text-accent-sky" />
                <span className="text-xs font-semibold text-text-primary">Photo / Video Evidence</span>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => {
                      setMode('photo');
                      if (cameraOn) stopCamera();
                    }}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      mode === 'photo'
                        ? 'bg-accent-sky/20 border-accent-sky/30 text-accent-sky'
                        : 'bg-white/[0.03] border-white/[0.06] text-text-secondary'
                    }`}
                  >
                    Photo
                  </button>
                  <button
                    onClick={() => {
                      setMode('video');
                      if (cameraOn) stopCamera();
                    }}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      mode === 'video'
                        ? 'bg-accent-sky/20 border-accent-sky/30 text-accent-sky'
                        : 'bg-white/[0.03] border-white/[0.06] text-text-secondary'
                    }`}
                  >
                    Video
                  </button>
                </div>
              </div>

              <div className="relative bg-black/40 rounded-md overflow-hidden border border-white/[0.08] aspect-[4/3]">
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${!cameraOn ? 'hidden' : ''}`}
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {!cameraOn && !photoData && !videoData && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Camera className="w-8 h-8 text-text-secondary mb-2" />
                    <button
                      onClick={startCamera}
                      className="text-xs bg-accent-sky/20 text-accent-sky px-3 py-1.5 rounded border border-accent-sky/30 hover:bg-accent-sky/30 transition-colors"
                    >
                      Open Camera
                    </button>
                  </div>
                )}

                {!cameraOn && photoData && (
                  <img src={photoData} alt="Captured" className="w-full h-full object-cover" />
                )}
                {!cameraOn && videoData && !photoData && (
                  <video src={videoData} className="w-full h-full object-cover" controls />
                )}

                {/* Live overlay */}
                {cameraOn && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 text-[10px] text-white font-mono leading-tight">
                      <div>ID: {postingId || 'N/A'}</div>
                      <div>
                        {new Date().toLocaleString()} | {city || geo || 'No Location'}
                      </div>
                      <div>Op: {operatorName}</div>
                    </div>
                    <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-3">
                      {mode === 'photo' ? (
                        <button
                          onClick={capturePhoto}
                          className="w-12 h-12 rounded-full bg-accent-sky border-4 border-white/20 flex items-center justify-center hover:scale-105 transition-transform"
                        >
                          <Camera className="w-5 h-5 text-void" />
                        </button>
                      ) : (
                        <button
                          onClick={recording ? stopRecording : startRecording}
                          className={`w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all ${
                            recording
                              ? 'bg-accent-red border-white/20'
                              : 'bg-accent-sky border-white/20'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 ${
                              recording ? 'bg-white rounded-sm' : 'bg-white rounded-full'
                            }`}
                          />
                        </button>
                      )}
                      <button
                        onClick={stopCamera}
                        className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {recording && (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-accent-red/80 px-2 py-1 rounded text-[10px] text-white font-bold animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-white" />
                        REC
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={saveRecord}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 px-5 py-2.5 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Record
              </motion.button>
              <button
                onClick={resetForm}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] text-text-secondary font-semibold text-xs rounded-md border border-white/[0.08] hover:text-text-primary transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
              {photoData && (
                <button
                  onClick={() => setPhotoData('')}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-accent-red hover:bg-accent-red/10 rounded border border-accent-red/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Photo
                </button>
              )}
              {videoData && (
                <button
                  onClick={() => setVideoData('')}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-accent-red hover:bg-accent-red/10 rounded border border-accent-red/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Video
                </button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Sidebar: filters + history */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">Search & Filters</h3>
            </div>
            <div className="space-y-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky transition-colors"
                placeholder="Search ID, operator, notes..."
              />
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full appearance-none bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                >
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={filterFolder}
                  onChange={(e) => setFilterFolder(e.target.value)}
                  className="w-full appearance-none bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                >
                  <option value="">All Folders</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <FolderOpen className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={exportJson}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-white/[0.03] text-text-secondary rounded border border-white/[0.08] hover:text-text-primary transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  JSON
                </button>
                <button
                  onClick={exportZip}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-white/[0.03] text-text-secondary rounded border border-white/[0.08] hover:text-text-primary transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  ZIP
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-panel rounded-lg p-4 max-h-[600px] overflow-y-auto"
          >
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">
                History ({filteredRecords.length})
              </h3>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {filteredRecords.map((rec) => (
                  <motion.div
                    key={rec.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md"
                  >
                    <div className="flex items-start gap-2">
                      {rec.photoData ? (
                        <img
                          src={rec.photoData}
                          alt=""
                          className="w-12 h-12 rounded object-cover bg-black/20 flex-shrink-0"
                        />
                      ) : rec.videoData ? (
                        <div className="w-12 h-12 rounded bg-black/20 flex items-center justify-center flex-shrink-0">
                          <Video className="w-5 h-5 text-accent-sky" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-text-secondary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-medium text-text-primary truncate">
                            {rec.postingId}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${STATUS_BG[rec.status]} ${STATUS_COLORS[rec.status]} border-white/10`}
                          >
                            {STATUS_LABELS[rec.status]}
                          </span>
                        </div>
                        {rec.folder && (
                          <span className="text-[9px] text-accent-sky bg-accent-sky/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            {rec.folder}
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-secondary">
                          <span>{rec.operator}</span>
                          <span>•</span>
                          <span>{new Date(rec.createdAt).toLocaleString()}</span>
                        </div>
                        {rec.city && (
                          <div className="text-[10px] text-accent-green flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {rec.city}
                          </div>
                        )}
                        {rec.note && (
                          <p className="text-[10px] text-text-secondary mt-1 truncate">{rec.note}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {filteredRecords.length === 0 && (
                <p className="text-xs text-text-secondary text-center py-4">
                  No records found
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
