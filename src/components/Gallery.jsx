import React, { useState, useEffect } from 'react';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const VideoThumbnail = ({ src }) => {
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setThumb(canvas.toDataURL('image/jpeg'));
      } catch {
        setThumb(null);
      }
    };

    video.onerror = () => setThumb(null);
    video.src = src;

    return () => {
      video.src = '';
    };
  }, [src]);

  return (
    <>
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
    </>
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

const PhotoGrid = ({ items, eventName, onPhotoClick, large }) => (
  <div style={large ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 } : undefined} className={large ? undefined : 'photo-grid'}>
    {items.map((p) => {
      const isVideo = p.media_type === 'video';
      const fileName = p.image_url?.split('/').pop() || 'photo';
      const time = formatTime(p.taken_at);

      return (
        <div key={p.id} className="photo-card" onClick={() => onPhotoClick(p)}>
          {isVideo ? (
            <VideoThumbnail src={p.image_url} />
          ) : (
            <img src={p.image_url} alt="" loading="lazy" />
          )}
          {time && (
            <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', color: 'white', padding: '2px 6px', borderRadius: 3, fontSize: '0.68rem', pointerEvents: 'none' }}>
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
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const Gallery = ({ photos, eventName, onPhotoClick }) => {
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
          <PhotoGrid items={proPhotos} eventName={eventName} onPhotoClick={onPhotoClick} large />
        </div>
      )}

      {guestPhotos.length > 0 && (
        <PhotoGrid items={guestPhotos} eventName={eventName} onPhotoClick={onPhotoClick} />
      )}
    </div>
  );
};

export default Gallery;
