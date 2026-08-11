import React, { useRef, useState } from 'react';
import exifr from 'exifr';
import { uploadFile, addPhoto, getPhotoCount } from '../store.js';
import { API_BASE } from '../config.js';

const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

const UploadButton = ({ event, onPhotoAdded }) => {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const handleFiles = async (files) => {
    if (!event) return;
    setError('');

    // Check photo limit before uploading
    const { count } = await getPhotoCount(event.id);
    if (count >= event.max_photos) {
      if (event.plan === 'premium') {
        setError("This event's gallery is full.");
      } else {
        setLimitReached(true);
      }
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        if (!isVideo && !isImage) continue;

        // Size check
        if (isImage && file.size > MAX_PHOTO_SIZE) {
          setError(`Photo "${file.name}" exceeds the 20MB limit.`);
          continue;
        }
        if (isVideo && file.size > MAX_VIDEO_SIZE) {
          setError(`Video "${file.name}" exceeds the 200MB limit.`);
          continue;
        }

        // Re-check limit for each file
        const { count: currentCount } = await getPhotoCount(event.id);
        if (currentCount >= event.max_photos) {
          if (event.plan === 'premium') {
            setError("This event's gallery is full.");
          } else {
            setLimitReached(true);
          }
          break;
        }

        // Extract taken_at
        let takenAt;
        if (isVideo) {
          takenAt = new Date(file.lastModified);
        } else {
          try {
            const exif = await exifr.parse(file);
            takenAt = exif?.DateTimeOriginal || new Date(file.lastModified);
          } catch {
            takenAt = new Date(file.lastModified);
          }
        }

        // Upload to storage
        const { publicUrl, error: uploadError } = await uploadFile(event.id, file);
        if (uploadError || !publicUrl) {
          setError(`Upload failed for "${file.name}". Please try again.`);
          continue;
        }

        // Get guest name from session
        const rawName = localStorage.getItem('guestName') || 'Guest';
        const guestName = rawName.replace(/<[^>]*>/g, '').trim() || 'Guest';
        const moderationStatus = event.moderation_enabled ? 'pending' : 'approved';

        // Insert record
        const { data: newPhoto, error: dbError } = await addPhoto({
          event_id: event.id,
          file_url: publicUrl,
          guest_name: guestName,
          media_type: isVideo ? 'video' : 'photo',
          taken_at: takenAt instanceof Date ? takenAt.toISOString() : takenAt,
          moderation_status: moderationStatus,
        });

        if (dbError) {
          setError(`Could not save "${file.name}". Please try again.`);
          continue;
        }

        // Fire-and-forget: process faces if face tagging is enabled (non-blocking)
        if (event.face_tagging_enabled && newPhoto && !isVideo) {
          fetch(`${API_BASE}/.netlify/functions/process-photo-faces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoId: newPhoto.id, photoUrl: publicUrl, eventId: event.id }),
          }).catch(() => {}); // intentionally not awaited
        }

        if (onPhotoAdded) onPhotoAdded();
      }
      if (event.moderation_enabled) {
        setSuccessMsg('Your photo has been submitted and is waiting for approval.');
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFilePick = (e) => handleFiles([...e.target.files]);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles([...e.dataTransfer.files]);
  };

  return (
    <div style={{ background: 'white', borderRadius: 6, padding: 32, boxShadow: 'var(--shadow)', marginBottom: 40 }}>
      <h3 className="serif" style={{ fontSize: '1.4rem', fontWeight: 400, marginBottom: 20 }}>Add Your Photos & Videos</h3>

      {error && (
        <div style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#c53030' }}>
          {error}
        </div>
      )}

      {limitReached && (
        <div style={{ background: 'var(--accent-tint-soft, rgba(201,168,76,0.08))', border: '1px solid var(--accent-tint-medium, rgba(201,168,76,0.25))', borderRadius: 4, padding: '14px', marginBottom: 16, textAlign: 'center' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--charcoal)', marginBottom: 8 }}>
            You've reached the free plan limit of 100 photos and videos.<br />
            Upgrade to Premium to continue collecting memories.
          </p>
          <button
            className="btn-gold"
            disabled={upgradeLoading}
            onClick={async () => {
              setUpgradeLoading(true);
              try {
                const response = await fetch(`${API_BASE}/.netlify/functions/create-checkout-session`, {
                  method: 'POST',
                  body: JSON.stringify({ eventCode: event.id, eventName: event.title }),
                });
                const { url } = await response.json();
                window.location.href = url;
              } catch { setUpgradeLoading(false); }
            }}
            style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.75rem' }}
          >
            {upgradeLoading ? 'Preparing checkout...' : 'Upgrade to Premium'}
          </button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(72,187,120,0.08)', border: '1px solid rgba(72,187,120,0.2)', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#276749' }}>
          {successMsg}
        </div>
      )}

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        style={{ padding: '40px 20px', textAlign: 'center', cursor: 'pointer', borderRadius: 8 }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="loader" style={{ width: 28, height: 28 }} />
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Uploading...</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.5 }}>📸</div>
            <p style={{ color: 'var(--charcoal)', fontSize: '0.95rem', marginBottom: 4 }}>Tap to add photos or videos</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>or drag & drop · JPG, PNG, HEIC, MP4, MOV</p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={onFilePick}
        style={{ display: 'none' }}
      />

      <button
        className="btn-gold"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ width: '100%', padding: '14px', borderRadius: 3, marginTop: 16 }}
      >
        {uploading ? 'Uploading...' : '📷  Open Camera / Choose Files'}
      </button>
    </div>
  );
};

export default UploadButton;
