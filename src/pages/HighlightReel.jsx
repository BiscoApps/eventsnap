import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getEvent, getReels, supabase } from '../store.js';

const PHOTO_DURATION = 4000;

const HighlightReel = ({ eventCode, reelId }) => {
  const [event, setEvent] = useState(null);
  const [reel, setReel] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef(null);
  const videoRef = useRef(null);
  const controlTimerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: eventData } = await getEvent(eventCode);
      if (eventData) setEvent(eventData);

      if (reelId) {
        const { data: reels } = await getReels(eventCode);
        const found = (reels || []).find((r) => r.id === reelId);
        if (found) {
          setReel(found);
          if (found.photo_ids && found.photo_ids.length > 0) {
            const { data: photoData } = await supabase
              .from('photos')
              .select('*')
              .in('id', found.photo_ids)
              .eq('moderation_status', 'approved');
            const ordered = found.photo_ids
              .map((id) => (photoData || []).find((p) => p.id === id))
              .filter(Boolean);
            setPhotos(ordered);
          }
        }
      } else {
        const { data: reels } = await getReels(eventCode);
        if (reels && reels.length > 0) {
          const first = reels[0];
          setReel(first);
          if (first.photo_ids && first.photo_ids.length > 0) {
            const { data: photoData } = await supabase
              .from('photos')
              .select('*')
              .in('id', first.photo_ids)
              .eq('moderation_status', 'approved');
            const ordered = first.photo_ids
              .map((id) => (photoData || []).find((p) => p.id === id))
              .filter(Boolean);
            setPhotos(ordered);
          }
        }
      }
      setLoading(false);
    })();
  }, [eventCode, reelId]);

  useEffect(() => {
    if (paused || photos.length === 0) return;
    const current = photos[currentIndex];
    if (!current || current.media_type === 'video') return;
    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setTransitionKey((k) => k + 1);
    }, PHOTO_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [currentIndex, paused, photos]);

  const handleVideoEnded = useCallback(() => {
    if (!paused) {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setTransitionKey((k) => k + 1);
    }
  }, [paused, photos.length]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.play().catch(() => {});
  }, [currentIndex]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlTimerRef.current);
    controlTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    showControlsTemporarily();
    return () => clearTimeout(controlTimerRef.current);
  }, [showControlsTemporarily]);

  useEffect(() => {
    const handleKey = (e) => {
      showControlsTemporarily();
      if (e.key === 'ArrowRight') { setCurrentIndex((p) => (p + 1) % photos.length); setTransitionKey((k) => k + 1); }
      else if (e.key === 'ArrowLeft') { setCurrentIndex((p) => (p - 1 + photos.length) % photos.length); setTransitionKey((k) => k + 1); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photos.length, showControlsTemporarily]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const handleShare = async () => {
    const url = `https://eventsnapapp.live/#/reel/${eventCode}${reelId ? '/' + reelId : ''}`;
    const caption = `Captured by EventSnap — eventsnapapp.live`;
    if (navigator.share) {
      try { await navigator.share({ title: reel?.title || event?.title, text: caption, url }); } catch {}
    } else {
      navigator.clipboard?.writeText(`${caption}\n${url}`).catch(() => {});
    }
  };

  // Exit — opened via window.open in the same webview, so there is no browser chrome
  const handleExit = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = `#/event/${eventCode}`;
  };

  const closeButton = (
    <button
      onClick={handleExit}
      aria-label="Close reel"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        right: 16,
        minWidth: 44,
        minHeight: 44,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 22,
        color: 'white',
        fontSize: '0.85rem',
        fontFamily: "'Jost', sans-serif",
        lineHeight: 1,
        cursor: 'pointer',
        zIndex: 1000,
      }}
    >
      ✕ Close
    </button>
  );

  if (loading) {
    return (
      <div style={{ background: '#000', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        {closeButton}
        <div className="loader" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{
        background: '#000',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: "'Jost', sans-serif",
        textAlign: 'center',
        padding: 'calc(env(safe-area-inset-top, 0px) + 40px) 40px calc(env(safe-area-inset-bottom, 0px) + 40px)',
      }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, marginBottom: 12, color: '#c9a84c' }}>
          Reel unavailable
        </h1>
        <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)', fontWeight: 300, marginBottom: 32 }}>
          This reel could not be loaded.
        </p>
        <button
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.hash = '#/';
          }}
          aria-label="Back"
          style={{
            minWidth: 44,
            minHeight: 44,
            padding: '0 24px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 22,
            color: 'white',
            fontSize: '0.95rem',
            fontFamily: "'Jost', sans-serif",
            lineHeight: 1,
            cursor: 'pointer',
            zIndex: 1000,
          }}
        >
          ← Back
        </button>
      </div>
    );
  }

  const accentColor = event.brand_color || '#c9a84c';

  if (photos.length === 0) {
    return (
      <div style={{ background: '#000', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Jost', sans-serif", textAlign: 'center', padding: 40 }}>
        {closeButton}
        <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, marginBottom: 12, color: accentColor }}>{event.title}</h1>
        <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>No reel found.</p>
      </div>
    );
  }

  const current = photos[currentIndex] || photos[0];
  const isVideo = current?.media_type === 'video';

  return (
    <div
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      onClick={showControlsTemporarily}
      style={{ background: '#000', color: 'white', height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden', cursor: showControls ? 'default' : 'none', fontFamily: "'Jost', sans-serif" }}
    >
      <style>{`
        @keyframes reelFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reelSlide { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes reelZoom { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      {closeButton}

      {/* Media */}
      <div key={transitionKey} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'reelFade 0.8s ease both' }}>
        {isVideo ? (
          <video ref={videoRef} src={current.image_url} autoPlay playsInline onEnded={handleVideoEnded} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <img src={current.image_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        )}
      </div>

      {/* Reel title — top left */}
      <div style={{ position: 'absolute', top: 20, left: 24, zIndex: 10, background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '6px 16px' }}>
        <span style={{ fontSize: '0.85rem', color: accentColor, fontWeight: 500 }}>{reel?.title || 'Highlight Reel'}</span>
      </div>

      {/* Event name — top right */}
      <div style={{ position: 'absolute', top: 76, right: 24, zIndex: 10 }}>
        <h2 className="serif" style={{ fontSize: 'clamp(1rem, 2vw, 1.6rem)', fontWeight: 300, color: accentColor, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{event.title}</h2>
      </div>

      {/* Uploader name */}
      <div style={{ position: 'absolute', bottom: 80, left: 32, zIndex: 10, opacity: showControls ? 1 : 0.6, transition: 'opacity 0.3s' }}>
        <p style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {current.uploader_name || 'Guest'}
        </p>
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.7)', borderRadius: 30, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 16, opacity: showControls ? 1 : 0, transition: 'opacity 0.3s ease', backdropFilter: 'blur(8px)' }}>
        <button onClick={() => { setCurrentIndex((p) => (p - 1 + photos.length) % photos.length); setTransitionKey((k) => k + 1); }} style={controlBtnStyle}>◀</button>
        <button onClick={() => setPaused((p) => !p)} style={controlBtnStyle}>{paused ? '▶' : '⏸'}</button>
        <button onClick={() => { setCurrentIndex((p) => (p + 1) % photos.length); setTransitionKey((k) => k + 1); }} style={controlBtnStyle}>▶</button>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
        <button onClick={handleShare} style={controlBtnStyle} title="Share">⬆</button>
        <button onClick={toggleFullscreen} style={controlBtnStyle}>{isFullscreen ? '⊠' : '⛶'}</button>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', minWidth: 50, textAlign: 'center' }}>{currentIndex + 1} / {photos.length}</span>
      </div>

      {paused && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: showControls ? 0.8 : 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
          <span style={{ fontSize: '2rem' }}>⏸</span>
        </div>
      )}
    </div>
  );
};

const controlBtnStyle = { background: 'none', border: 'none', color: 'white', fontSize: '1rem', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'background 0.2s' };

export default HighlightReel;
