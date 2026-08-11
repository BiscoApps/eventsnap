import React, { useRef, useState, useEffect, useCallback } from 'react';
import { uploadFile, addPhoto, getPhotoCount } from '../store.js';
import { API_BASE } from '../config.js';

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const isIOSSafari = /iP(hone|od|ad)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);

const CameraView = ({ event, onPhotoAdded, onOpenGallery, onGoHome }) => {
const videoRef = useRef();
const streamRef = useRef();
const recorderRef = useRef();
const chunksRef = useRef([]);
const timerRef = useRef();
const pressTimerRef = useRef();
const isHoldingRef = useRef(false);
const isRecordingRef = useRef(false);
const shutterRef = useRef();
const uploadRef = useRef();
const shutterRef2 = useRef();
const touchActiveRef = useRef(false);

const [facingMode, setFacingMode] = useState('environment');
const [flashOn, setFlashOn] = useState(false);
const [recording, setRecording] = useState(false);
const [recordSecs, setRecordSecs] = useState(0);
const [uploading, setUploading] = useState(false);
const [error, setError] = useState('');
const [cameraError, setCameraError] = useState(false);
const [previewUrl, setPreviewUrl] = useState(null);
const [previewFile, setPreviewFile] = useState(null);

const startCamera = useCallback(async () => {
if (streamRef.current) {
streamRef.current.getTracks().forEach((t) => t.stop());
}
try {
const stream = await navigator.mediaDevices.getUserMedia({
video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
audio: true,
});
streamRef.current = stream;
if (videoRef.current) {
videoRef.current.srcObject = stream;
videoRef.current.play().catch(() => {});
}
setCameraError(false);
} catch {
setCameraError(true);
}
}, [facingMode]);

useEffect(() => {
startCamera();
return () => {
if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
if (timerRef.current) clearInterval(timerRef.current);
if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
};
}, [startCamera]);

// Keep uploadRef in sync so touch handlers always have latest version
useEffect(() => {
uploadRef.current = async (file) => {
if (!event) return;
setError('');
const { count } = await getPhotoCount(event.id);
if (count >= event.max_photos) { setError('Gallery is full.'); return; }
setUploading(true);
try {
const { publicUrl, error: uploadError } = await uploadFile(event.id, file);
if (uploadError || !publicUrl) { setError('Upload failed. Please try again.'); return; }
const rawName = localStorage.getItem('guestName') || 'Guest';
const guestName = rawName.replace(/<[^>]*>/g, '').trim() || 'Guest';
const moderationStatus = event.moderation_enabled ? 'pending' : 'approved';
const isVideo = file.type.startsWith('video/');
const { data: newPhoto } = await addPhoto({
event_id: event.id,
file_url: publicUrl,
guest_name: guestName,
media_type: isVideo ? 'video' : 'photo',
taken_at: new Date().toISOString(),
moderation_status: moderationStatus,
});
if (event.face_tagging_enabled && newPhoto && !isVideo) {
fetch(`${API_BASE}/.netlify/functions/process-photo-faces`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ photoId: newPhoto.id, photoUrl: publicUrl, eventId: event.id }),
}).catch(() => {});
}
if (onPhotoAdded) onPhotoAdded();
if (onOpenGallery) onOpenGallery();
} finally {
setUploading(false);
}
};
}, [event, onPhotoAdded, onOpenGallery]);

useEffect(() => {
  shutterRef2.current = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewFile(file);
    }, 'image/jpeg', 0.92);
  };
}, []);

// Attach touch events directly to shutter button via ref — most reliable on iOS
useEffect(() => {
const el = shutterRef.current;
if (!el) return;

const onStart = (e) => {
e.preventDefault();
if (uploading) return;
touchActiveRef.current = true;
if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
isHoldingRef.current = false;
pressTimerRef.current = setTimeout(() => {
if (isIOSSafari) return;
if (isRecordingRef.current) return;
isHoldingRef.current = true;
if (!streamRef.current) return;
const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
const recorder = new MediaRecorder(streamRef.current, { mimeType });
recorderRef.current = recorder;
chunksRef.current = [];
recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
recorder.onstop = async () => {
  clearInterval(timerRef.current);
  setRecordSecs(0);
  isRecordingRef.current = false;
  setRecording(false);
  isHoldingRef.current = false;
  const blob = new Blob(chunksRef.current, { type: mimeType });
  if (blob.size === 0) return;
  if (blob.size > MAX_VIDEO_SIZE) { setError('Video exceeds 200MB limit.'); return; }
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `video_${Date.now()}.${ext}`, { type: mimeType });
  await uploadRef.current(file);
};
recorder.start();
isRecordingRef.current = true;
setRecording(true);
setRecordSecs(0);
let secs = 0;
timerRef.current = setInterval(() => {
  secs++;
  setRecordSecs(secs);
  if (secs >= 15) {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }
}, 1000);
}, 300);
};

const onEnd = (e) => {
if (!touchActiveRef.current) return;
touchActiveRef.current = false;
e.preventDefault();
if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
if (!isHoldingRef.current && !isRecordingRef.current) {
shutterRef2.current?.();
}
};

el.addEventListener('touchstart', onStart, { passive: false });
document.addEventListener('touchend', onEnd, { passive: false });
document.addEventListener('touchcancel', onEnd, { passive: false });
return () => {
el.removeEventListener('touchstart', onStart);
document.removeEventListener('touchend', onEnd);
document.removeEventListener('touchcancel', onEnd);
};
}, [uploading]);

const handleFlip = () => {
if (recording) return;
setFacingMode((prev) => prev === 'environment' ? 'user' : 'environment');
};

const handleFlash = async () => {
if (recording) return;
const newFlash = !flashOn;
setFlashOn(newFlash);
if (streamRef.current) {
const track = streamRef.current.getVideoTracks()[0];
if (track?.applyConstraints) {
try { await track.applyConstraints({ advanced: [{ torch: newFlash }] }); } catch { }
}
}
};

const handleGoHome = () => {
if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
if (timerRef.current) clearInterval(timerRef.current);
if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
if (onGoHome) onGoHome();
};

if (cameraError) {
return (
<div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: 24, textAlign: 'center' }}>
<div style={{ fontSize: '3rem', marginBottom: 16 }}>📷</div>
<p style={{ fontSize: '1rem', marginBottom: 8 }}>Camera not available</p>
<p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>Check your browser permissions or use the gallery to upload from your camera roll.</p>
<button onClick={onOpenGallery} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '12px 28px', borderRadius: 3, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}>
Open Gallery →
</button>
</div>
);
}

return (
<div style={{ width: '100%', height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}>
<style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
<video
ref={videoRef}
autoPlay
playsInline
muted
style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
/>

{recording && (
<div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(229,62,62,0.85)', color: 'white', padding: '4px 14px', borderRadius: 100, fontSize: '0.82rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
<div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
{recordSecs}s / 15s
</div>
)}

{uploading && (
<div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '6px 16px', borderRadius: 100, fontSize: '0.78rem' }}>
Uploading...
</div>
)}

{error && (
<div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(229,62,62,0.85)', color: 'white', padding: '6px 16px', borderRadius: 100, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
{error}
</div>
)}

<button onClick={handleGoHome} aria-label="Back to home" style={{ position: 'absolute', top: 20, left: 16, minWidth: 44, minHeight: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 22, background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', fontSize: '0.7rem', letterSpacing: '0.08em', fontFamily: 'Jost, sans-serif', cursor: 'pointer' }}>
← HOME
</button>

<div style={{ position: 'absolute', top: 20, right: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
<button onClick={handleFlash} style={{ width: 44, height: 44, borderRadius: '50%', background: flashOn ? 'rgba(255,220,0,0.85)' : 'rgba(0,0,0,0.45)', border: 'none', cursor: recording ? 'default' : 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: recording ? 0.4 : 1 }}>
⚡
</button>
<button onClick={handleFlip} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: 'none', cursor: recording ? 'default' : 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', opacity: recording ? 0.4 : 1 }}>
🔄
</button>
</div>

<div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
<div style={{ width: 56 }} />

<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
  {recording && (
    <button
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); }}
      onMouseUp={(e) => { e.preventDefault(); e.stopPropagation(); if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); }}
      style={{
        background: 'rgba(229,62,62,0.92)',
        border: 'none',
        borderRadius: 100,
        padding: '10px 28px',
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: 'Jost, sans-serif',
        letterSpacing: '0.1em',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        boxShadow: '0 4px 20px rgba(229,62,62,0.45)',
        animation: 'slideUp 0.2s ease',
      }}
    >
      ■ STOP RECORDING
    </button>
  )}
  <button
    ref={shutterRef}
    onMouseDown={(e) => {
      e.preventDefault();
      if (uploading || recording) return;
      isHoldingRef.current = false;
      pressTimerRef.current = setTimeout(() => { isHoldingRef.current = true; }, 300);
    }}
    onMouseUp={(e) => {
      e.preventDefault();
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (!isHoldingRef.current) {
        shutterRef2.current?.();
      }
    }}
    onMouseLeave={() => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    }}
    style={{
      width: recording ? 80 : 72,
      height: recording ? 80 : 72,
      borderRadius: '50%',
      background: recording ? 'rgba(229,62,62,0.9)' : 'white',
      border: recording ? '4px solid rgba(229,62,62,0.5)' : '4px solid rgba(255,255,255,0.6)',
      cursor: uploading ? 'default' : 'pointer',
      opacity: uploading ? 0.6 : 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.15s ease',
      boxShadow: recording ? '0 0 20px rgba(229,62,62,0.5)' : '0 2px 12px rgba(0,0,0,0.4)',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    }}
    disabled={uploading}
  >
    {recording && <div style={{ width: 24, height: 24, borderRadius: 4, background: 'white' }} />}
  </button>
  <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em', fontFamily: 'Jost, sans-serif' }}>
    {recording ? 'RECORDING...' : isIOSSafari ? 'VIDEO: USE GALLERY UPLOAD' : 'TAP · HOLD TO RECORD'}
  </span>
</div>

<button onClick={onOpenGallery} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'white' }}>
<div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🖼️</div>
<span style={{ fontSize: '0.62rem', letterSpacing: '0.05em', opacity: 0.7 }}>GALLERY</span>
</button>
</div>

{previewUrl && (
<div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
  <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  <div style={{ position: 'absolute', bottom: 40, display: 'flex', gap: 20 }}>
    <button
      onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewFile(null); }}
      style={{ padding: '12px 28px', borderRadius: 100, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'Jost, sans-serif', cursor: 'pointer' }}
    >
      Retake
    </button>
    <button
      onClick={async () => {
        if (!previewFile) return;
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewFile(null);
        await uploadRef.current(previewFile);
      }}
      disabled={uploading}
      style={{ padding: '12px 28px', borderRadius: 100, background: 'white', border: 'none', color: '#000', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'Jost, sans-serif', cursor: 'pointer' }}
    >
      Share to Gallery
    </button>
  </div>
</div>
)}

</div>
);
};

export default CameraView;
