import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getEvent, getPhotos, supabase } from '../store.js';
import QRCode from '../components/QRCode.jsx';

const PHOTO_DURATION = 5000; // 5 seconds for photos
const CONTROL_HIDE_DELAY = 3000;

const Slideshow = ({ eventCode }) => {
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQR, setShowQR] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transition, setTransition] = useState('fade'); // fade | slide | zoom
  const [brandColor, setBrandColor] = useState(null);
  const [transitionKey, setTransitionKey] = useState(0);

  const timerRef = useRef(null);
  const videoRef = useRef(null);
  const controlTimerRef = useRef(null);
  const containerRef = useRef(null);

  // Load event
  useEffect(() => {
    (async () => {
      const { data } = await getEvent(eventCode);
      if (data) {
        setEvent(data);
        setBrandColor(data.brand_color || null);
        setTransition(data.slideshow_transition || 'fade');
      }
    })();
  }, [eventCode]);

  // Load photos
  const loadPhotos = useCallback(async () => {
    const { data } = await getPhotos(eventCode);
    const all = data || [];
    if (event && event.slideshow_photo_ids && event.slideshow_photo_ids.length > 0) {
      const idSet = new Set(event.slideshow_photo_ids);
      setPhotos(all.filter((p) => idSet.has(p.id)));
    } else {
      setPhotos(all);
    }
  }, [eventCode, event]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // Realtime subscription for new approved photos
  useEffect(() => {
    const channel = supabase
      .channel(`slideshow-${eventCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'photos',
        filter: `event_id=eq.${eventCode}`,
      }, () => {
        loadPhotos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventCode, loadPhotos]);

  // Auto-advance timer
  useEffect(() => {
    if (paused || photos.length === 0) return;

    const current = photos[currentIndex];
    if (!current) return;

    const isVideo = current.media_type === 'video';

    // For videos, wait for video end event
    if (isVideo) return;

    // For photos, advance after PHOTO_DURATION
    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setTransitionKey((k) => k + 1);
    }, PHOTO_DURATION);

    return () => clearTimeout(timerRef.current);
  }, [currentIndex, paused, photos]);

  // Video ended handler
  const handleVideoEnded = useCallback(() => {
    if (!paused) {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
      setTransitionKey((k) => k + 1);
    }
  }, [paused, photos.length]);

  // Auto-play video when it becomes current
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentIndex]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e) => {
      showControlsTemporarily();
      switch (e.key) {
        case 'ArrowRight':
          setCurrentIndex((prev) => (prev + 1) % photos.length);
          setTransitionKey((k) => k + 1);
          break;
        case 'ArrowLeft':
          setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
          setTransitionKey((k) => k + 1);
          break;
        case ' ':
          e.preventDefault();
          setPaused((p) => !p);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photos.length]);

  // Control bar auto-hide
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlTimerRef.current);
    controlTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, CONTROL_HIDE_DELAY);
  }, []);

  useEffect(() => {
    showControlsTemporarily();
    return () => clearTimeout(controlTimerRef.current);
  }, [showControlsTemporarily]);

  const handleMouseMove = () => {
    showControlsTemporarily();
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Navigation
  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    setTransitionKey((k) => k + 1);
  };
  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    setTransitionKey((k) => k + 1);
  };

  // Exit — opened via window.open in the same webview, so there is no browser chrome
  const handleExit = () => {
    window.location.hash = '#/';
  };

  const closeButton = (
    <button
      onClick={handleExit}
      aria-label="Close slideshow"
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

  if (!event) {
    return (
      <div style={{ background: '#000', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        {closeButton}
        <div className="loader" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    );
  }

  const isPremium = event.plan === 'premium';
  const accentColor = (isPremium && brandColor) || '#c9a84c';
  const joinUrl = `https://eventsnapapp.live/event/${event.event_slug || event.id}`;

  // Transition styles
  const getTransitionStyle = () => {
    const base = {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
    if (transition === 'fade') {
      return { ...base, animation: 'slideshowFade 0.8s ease both' };
    }
    if (transition === 'slide') {
      return { ...base, animation: 'slideshowSlide 0.6s ease both' };
    }
    if (transition === 'zoom') {
      return { ...base, animation: 'slideshowZoom 0.7s ease both' };
    }
    return { ...base, animation: 'slideshowFade 0.8s ease both' };
  };

  // ─── Empty State ────────────────────────────────────────────────────
  if (photos.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          background: '#000',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: "'Jost', sans-serif",
          textAlign: 'center',
          padding: 40,
        }}
      >
        <style>{slideshowStyles}</style>
        {closeButton}
        <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 300, marginBottom: 12, color: accentColor }}>
          {event.title}
        </h1>
        {event.subtitle && (
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)', marginBottom: 32, fontWeight: 300 }}>{event.subtitle}</p>
        )}
        <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)', marginBottom: 32, fontWeight: 300 }}>
          Scan the QR code to share your photos and videos
        </p>
        <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <QRCode value={joinUrl} size={220} />
        </div>
        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em' }}>
          {event.id}
        </p>
        {/* Live counter */}
        <div style={{ position: 'fixed', top: 76, right: 24, background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#48bb78', animation: 'pulse 2s ease infinite' }} />
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)' }}>{photos.length} photos</span>
        </div>
      </div>
    );
  }

  // ─── Main Slideshow ─────────────────────────────────────────────────
  const current = photos[currentIndex] || photos[0];
  const isVideo = current?.media_type === 'video';

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={showControlsTemporarily}
      style={{
        background: '#000',
        color: 'white',
        height: '100vh',
        width: '100vw',
        position: 'relative',
        overflow: 'hidden',
        cursor: showControls ? 'default' : 'none',
        fontFamily: "'Jost', sans-serif",
      }}
    >
      <style>{slideshowStyles}</style>
      {closeButton}

      {/* Media display */}
      <div key={transitionKey} style={getTransitionStyle()}>
        {isVideo ? (
          <video
            ref={videoRef}
            src={current.image_url}
            autoPlay
            muted={false}
            playsInline
            onEnded={handleVideoEnded}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <img
            src={current.image_url}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Guest name + time overlay */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 32,
        zIndex: 10,
        opacity: showControls ? 1 : 0.6,
        transition: 'opacity 0.3s',
      }}>
        <p style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {current.uploader_name || 'Guest'}
          {current.taken_at && (
            <span style={{ marginLeft: 10, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              {new Date(current.taken_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
            </span>
          )}
        </p>
      </div>

      {/* Event name overlay — Premium */}
      {isPremium && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: 24,
          zIndex: 10,
        }}>
          <h2 className="serif" style={{
            fontSize: 'clamp(1.2rem, 2.5vw, 2rem)',
            fontWeight: 300,
            color: accentColor,
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}>
            {event.title}
          </h2>
        </div>
      )}

      {/* Live counter overlay — top right */}
      <div style={{
        position: 'absolute',
        top: 76,
        right: 24,
        zIndex: 10,
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#48bb78', animation: 'pulse 2s ease infinite' }} />
        <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)' }}>{photos.length} photos</span>
      </div>

      {/* QR code overlay — bottom right */}
      {showQR && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          right: 24,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{ background: 'white', borderRadius: 6, padding: 6 }}>
            <QRCode value={joinUrl} size={80} />
          </div>
          <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 100 }}>
            Scan to join
          </p>
        </div>
      )}

      {/* Control bar — bottom center */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        background: 'rgba(0,0,0,0.7)',
        borderRadius: 30,
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s ease',
        backdropFilter: 'blur(8px)',
      }}>
        <button onClick={goPrev} style={controlBtnStyle} title="Previous (←)">
          ◀
        </button>
        <button onClick={() => setPaused((p) => !p)} style={controlBtnStyle} title="Play/Pause (Space)">
          {paused ? '▶' : '⏸'}
        </button>
        <button onClick={goNext} style={controlBtnStyle} title="Next (→)">
          ▶
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
        <button onClick={() => setShowQR((q) => !q)} style={controlBtnStyle} title="Toggle QR">
          QR
        </button>
        <button onClick={toggleFullscreen} style={controlBtnStyle} title="Fullscreen (F)">
          {isFullscreen ? '⊠' : '⛶'}
        </button>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', minWidth: 50, textAlign: 'center' }}>
          {currentIndex + 1} / {photos.length}
        </span>
      </div>

      {/* Paused indicator */}
      {paused && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '50%',
          width: 80,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showControls ? 0.8 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '2rem' }}>⏸</span>
        </div>
      )}

      {/* Branding — hidden for Pro photographer events */}
      {!event.photographer_id && (
        <div style={{
          position: 'absolute', bottom: 6, left: 24, zIndex: 5,
          fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em',
        }}>
          Powered by EventSnap
        </div>
      )}
    </div>
  );
};

const controlBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'white',
  fontSize: '1rem',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 4,
  transition: 'background 0.2s',
};

const slideshowStyles = `
  @keyframes slideshowFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideshowSlide {
    from { opacity: 0; transform: translateX(60px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideshowZoom {
    from { opacity: 0; transform: scale(1.08); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

export default Slideshow;
