import React, { useEffect, useRef, useCallback } from 'react';

const formatFullDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${day}, ${time}`;
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

const arrowButtonStyle = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'rgba(0,0,0,0.45)',
  border: 'none',
  color: 'white',
  fontSize: '1.5rem',
  width: 44,
  height: 44,
  borderRadius: '50%',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
};

const Lightbox = ({ item, photos, currentIndex, onNavigate, eventName, onClose }) => {
  const touchStartX = useRef(null);

  const goNext = useCallback(() => {
    if (!photos || photos.length <= 1) return;
    onNavigate((currentIndex + 1) % photos.length);
  }, [photos, currentIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (!photos || photos.length <= 1) return;
    onNavigate((currentIndex - 1 + photos.length) % photos.length);
  }, [photos, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, goNext, goPrev]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 50) return;
    if (deltaX < 0) goNext();
    else goPrev();
  };

  if (!item) return null;

  const isVideo = item.media_type === 'video';
  const fileName = item.image_url?.split('/').pop() || 'file';
  const fullDate = formatFullDate(item.taken_at);
  const showArrows = photos && photos.length > 1;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ maxWidth: '92vw', maxHeight: '92vh', position: 'relative' }}
      >
        {isVideo ? (
          <video
            controls
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ maxWidth: '90vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 4, display: 'block', background: '#000' }}
            src={item.image_url}
          />
        ) : (
          <img
            src={item.image_url}
            alt=""
            draggable={false}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ maxWidth: '90vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 4, display: 'block', userSelect: 'none', WebkitUserSelect: 'none' }}
          />
        )}

        {/* Left arrow */}
        {showArrows && (
          <button
            onClick={goPrev}
            className="lightbox-arrow"
            style={{ ...arrowButtonStyle, left: -56 }}
            aria-label="Previous photo"
          >
            ‹
          </button>
        )}

        {/* Right arrow */}
        {showArrows && (
          <button
            onClick={goNext}
            className="lightbox-arrow"
            style={{ ...arrowButtonStyle, right: -56 }}
            aria-label="Next photo"
          >
            ›
          </button>
        )}

        {/* Info below media */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          {item.uploader_name && (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>by {item.uploader_name}</p>
          )}
          {fullDate && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', marginTop: 4 }}>{fullDate}</p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
            <button
              onClick={() => handleSave(item.image_url, fileName)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                padding: '8px 20px',
                borderRadius: 4,
                fontSize: '0.78rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              Save
            </button>
            <button
              onClick={() => handleShare(item.image_url, fileName, eventName)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                padding: '8px 20px',
                borderRadius: 4,
                fontSize: '0.78rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              Share
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{ position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', opacity: 0.6 }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Lightbox;
