import React, { useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE } from '../config.js';

const FaceTagConsent = ({ event, onAccept, onSkip, onRetry }) => {
  const [step, setStep] = useState('consent');
  const [stream, setStream] = useState(null);
  const [matchingPhotoIds, setMatchingPhotoIds] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [error, setError] = useState('');
  const videoElRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const openCamera = useCallback(async () => {
    setStep('camera');
    setError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setStream(mediaStream);
      if (videoElRef.current) videoElRef.current.srcObject = mediaStream;
    } catch (err) {
      setError('Could not access camera. Please allow camera access and try again.');
      setStep('consent');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoElRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    setStep('matching');
    matchFaces(base64);
  }, [stream]);

  const matchFaces = async (base64) => {
    try {
      const guestName = sessionStorage.getItem('guestName') || 'Guest';
      const response = await fetch(`${API_BASE}/.netlify/functions/match-faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, selfieBase64: base64, guestName }),
      });
      const { matchingPhotoIds: ids } = await response.json();
      setMatchingPhotoIds(ids || []);
      setMatchCount(ids?.length || 0);
      setStep('results');
      sessionStorage.setItem('faceTagConsent', 'accepted');
      sessionStorage.setItem('faceMatchIds', JSON.stringify(ids || []));
      onAccept(ids || []);
    } catch (err) {
      setError('Face matching failed. You can still browse the full gallery.');
      sessionStorage.setItem('faceTagConsent', 'skipped');
      setStep('results');
      onAccept([]);
    }
  };

  const handleSkip = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    sessionStorage.setItem('faceTagConsent', 'skipped');
    onSkip();
  };

  const handleRetry = () => {
    setError('');
    setMatchingPhotoIds(null);
    setMatchCount(0);
    sessionStorage.removeItem('faceTagConsent');
    sessionStorage.removeItem('faceMatchIds');
    setStep('consent');
    if (onRetry) onRetry();
  };

  if (step === 'consent') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.5s ease' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📸</div>
            <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Find your photos</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 300, lineHeight: 1.7 }}>
              Take a quick selfie and we'll find every photo and video that includes you.
            </p>
          </div>
          {error && (
            <div style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#c53030', textAlign: 'center' }}>
              {error}
            </div>
          )}
          <div style={{ background: 'white', borderRadius: 6, padding: 32, boxShadow: 'var(--shadow)' }}>
            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              Results may include people who look similar to you. Your selfie is only used to match photos at this event.
            </div>
            <button className="btn-gold" onClick={openCamera} style={{ width: '100%', padding: 14, borderRadius: 3, marginBottom: 12 }}>
              Take a selfie
            </button>
            <button className="btn-outline" onClick={handleSkip} style={{ width: '100%', padding: 14, borderRadius: 3 }}>
              Skip — browse all photos
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'camera') {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <p style={{ color: 'white', textAlign: 'center', fontSize: '0.92rem', marginBottom: 16, fontFamily: "'Jost', sans-serif" }}>
            Position your face in the frame
          </p>
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <video ref={videoElRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: 200, height: 200, borderRadius: '50%', border: '3px solid rgba(201,168,76,0.6)' }} />
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-gold" onClick={capturePhoto} style={{ flex: 1, padding: 14, borderRadius: 3 }}>
              Take Photo
            </button>
            <button className="btn-outline" onClick={handleSkip} style={{ padding: '14px 20px', borderRadius: 3, color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)' }}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'matching') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="loader" style={{ width: 40, height: 40, borderWidth: 3, marginBottom: 20 }} />
        <p style={{ fontSize: '1rem', color: 'var(--charcoal)', fontWeight: 300 }}>Finding your photos...</p>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 8 }}>This may take a moment</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {error ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', color: '#c53030', marginBottom: 16 }}>{error}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-gold" onClick={handleRetry} style={{ padding: '12px 24px', borderRadius: 3 }}>Try again</button>
            <button className="btn-outline" onClick={handleSkip} style={{ padding: '12px 24px', borderRadius: 3 }}>Browse gallery</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✨</div>
          <p style={{ fontSize: '1.1rem', color: 'var(--charcoal)', fontWeight: 300, marginBottom: 20 }}>
            {matchCount} photo{matchCount !== 1 ? 's' : ''} and video{matchCount !== 1 ? 's' : ''} featuring you
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* handleSkip stores consent and calls onSkip, which is what releases the gate in EventPage */}
            <button className="btn-outline" onClick={handleSkip} style={{ padding: '10px 24px', borderRadius: 3, minHeight: 44 }}>
              Continue to gallery
            </button>
            <button className="btn-outline" onClick={handleRetry} style={{ padding: '10px 24px', borderRadius: 3, minHeight: 44 }}>
              Search again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceTagConsent;
