import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config.js';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd} ${mm} '${yy}`;
};

const THEMES = {
  classic: { stampBg: 'rgba(0,0,0,0.55)', stampText: '#ffffff', showDate: false, grain: false },
  film:    { stampBg: '#FFF7EC',          stampText: '#FF5A1F', showDate: true,  grain: true  },
};

const thumbUrl = (url) => {
  if (!url) return url;
  // Only transform Supabase storage public image URLs; leave anything else untouched
  if (!url.includes('/storage/v1/object/public/')) return url;
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (url.includes('?') ? '&' : '?') + 'width=500&quality=70';
};

const THUMB_MAX_EDGE = 400;

const VideoThumbnail = ({ src }) => {
  const [thumb, setThumb] = useState(null);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef(null);

  // Only begin generating once the tile scrolls into view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const onLoadedMetadata = () => {
      if (cancelled) return;
      const d = video.duration;
      const target = Number.isFinite(d) && d > 0 ? Math.min(0.1, d / 2) : 0.1;
      video.currentTime = target > 0 ? target : 0.1;
    };

    const onSeeked = () => {
      if (cancelled) return;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
          setThumb(null);
          return;
        }
        const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(vw, vh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumb(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        setThumb(null);
      }
    };

    const onError = () => {
      if (!cancelled) setThumb(null);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.src = src;

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    };
  }, [src, visible]);

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      {thumb ? (
        <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader" />
        </div>
      )}
      {/* Play icon overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderWidth: '8px 0 8px 14px',
            borderColor: 'transparent transparent transparent white',
            marginLeft: 3,
          }} />
        </div>
      </div>
    </div>
  );
};

const handleSave = async (fileUrl, fileName) => {
  try {
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = fileName;
      a.click();
    }
  } catch (err) {
    console.error('Save failed:', err);
  }
};

const handleShare = async (fileUrl, fileName, eventName) => {
  try {
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: eventName,
        text: `Check out this moment from ${eventName} — Shared via EventSnap · eventsnapapp.live`,
        files: [file],
      });
    } else {
      await navigator.clipboard.writeText(fileUrl);
    }
  } catch (err) {
    console.error('Share failed:', err);
  }
};

const handleReport = async (photoId, eventCode) => {
  if (!window.confirm('Report this photo as inappropriate? It will be hidden while the host reviews it.')) return;
  try {
    const response = await fetch(`${API_BASE}/.netlify/functions/report-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId, eventCode }),
    });
    if (response.ok) {
      alert('Thank you. This photo has been hidden and sent to the host for review.');
      window.location.reload();
    }
  } catch (err) {
    console.error('Report failed:', err);
  }
};

const PAGE_SIZE = 20;

const PhotoGrid = ({ items, eventName, onPhotoClick, large, theme = 'classic' }) => {
  const t = THEMES[theme] || THEMES.classic;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(items.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, items.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, items.length, visibleCount]);

  return (
    <>
    <div style={large ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 } : undefined} className={large ? undefined : 'photo-grid'}>
      {items.slice(0, visibleCount).map((p) => {
        const isVideo = p.media_type === 'video';
        const fileName = p.image_url?.split('/').pop() || 'photo';
        const time = formatTime(p.taken_at);
        const date = formatDate(p.taken_at);

        return (
          <div key={p.id} className="photo-card" onClick={() => onPhotoClick(p)}>
            {isVideo ? (
              <VideoThumbnail src={p.image_url} />
            ) : (
              <img
                src={thumbUrl(p.image_url)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.dataset.fallback) return;
                  e.currentTarget.dataset.fallback = '1';
                  e.currentTarget.src = p.image_url;
                }}
              />
            )}
            {t.grain && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1.5px, transparent 3px)', opacity: 0.4, mixBlendMode: 'overlay' }} />
            )}
            {time && (
              <div style={{ position: 'absolute', top: 6, right: 6, background: t.stampBg, color: t.stampText, padding: '2px 6px', borderRadius: 3, fontSize: '0.68rem', pointerEvents: 'none' }}>
                {t.showDate && date && <div>{date}</div>}
                {time}
              </div>
            )}
            <div className="overlay">
              <p style={{ color: 'white', fontSize: '0.72rem', letterSpacing: '0.05em', marginBottom: 4 }}>
                {p.uploader_name || 'Guest'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleSave(p.image_url, fileName)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '3px 8px', borderRadius: 3, fontSize: '0.65rem', cursor: 'pointer' }}>Save</button>
                <button onClick={() => handleShare(p.image_url, fileName, eventName)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '3px 8px', borderRadius: 3, fontSize: '0.65rem', cursor: 'pointer' }}>Share</button>
                <button onClick={() => handleReport(p.id, p.event_id)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '3px 8px', borderRadius: 3, fontSize: '0.65rem', cursor: 'pointer' }}>🚩 Report</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
    </>
  );
};

const Gallery = ({ photos, eventName, onPhotoClick, theme = 'classic' }) => {
  if (photos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.5 }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🌸</div>
        <p className="serif" style={{ fontSize: '1.3rem', fontWeight: 300 }}>Be the first to share a moment</p>
      </div>
    );
  }

  const proPhotos = photos.filter((p) => p.uploader_name === 'Photographer');
  const guestPhotos = photos.filter((p) => p.uploader_name !== 'Photographer');

  return (
    <div>
      {proPhotos.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-dark)', fontWeight: 500 }}>Photographer's Album</span>
            <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>{proPhotos.length}</span>
          </div>
          <PhotoGrid items={proPhotos} eventName={eventName} onPhotoClick={onPhotoClick} theme={theme} large />
        </div>
      )}

      {guestPhotos.length > 0 && (
        <PhotoGrid items={guestPhotos} eventName={eventName} onPhotoClick={onPhotoClick} theme={theme} />
      )}
    </div>
  );
};

export default Gallery;
