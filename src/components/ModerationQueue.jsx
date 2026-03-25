import React, { useState, useEffect } from 'react';
import { getPendingPhotos, approvePhoto, supabase } from '../store.js';
import { API_BASE } from '../config.js';

const VideoThumbnail = ({ src }) => {
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => { video.currentTime = 0.1; };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        setThumb(canvas.toDataURL('image/jpeg'));
      } catch { setThumb(null); }
    };
    video.onerror = () => setThumb(null);
    video.src = src;
    return () => { video.src = ''; };
  }, [src]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {thumb ? (
        <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader" />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '6px 0 6px 10px', borderColor: 'transparent transparent transparent white', marginLeft: 2 }} />
        </div>
      </div>
    </div>
  );
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const ModerationQueue = ({ eventId, onUpdate }) => {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPending = async () => {
    const { data } = await getPendingPhotos(eventId);
    setPending(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadPending();

    const channel = supabase
      .channel('moderation-queue')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'photos',
        filter: `event_id=eq.${eventId}`,
      }, (payload) => {
        if (payload.new.moderation_status === 'pending') {
          setPending((prev) => [...prev, payload.new]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const handleApprove = async (photoId) => {
    await approvePhoto(photoId);
    setPending((prev) => prev.filter((p) => p.id !== photoId));
    onUpdate?.();
  };

  const handleReject = async (photo) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/.netlify/functions/reject-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ photoId: photo.id, eventCode: eventId }),
      });
      if (!res.ok) return;
    } catch { return; }
    setPending((prev) => prev.filter((p) => p.id !== photo.id));
    onUpdate?.();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
        <div className="loader" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h4 style={{ fontSize: '0.88rem', fontWeight: 500, letterSpacing: '0.05em' }}>Pending Approval</h4>
        {pending.length > 0 && (
          <span className="badge" style={{ background: 'rgba(229,62,62,0.1)', color: '#c53030' }}>
            {pending.length} item{pending.length !== 1 ? 's' : ''} awaiting approval
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: '0.88rem' }}>No items awaiting approval</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {pending.map((item) => {
            const isVideo = item.media_type === 'video';
            return (
              <div key={item.id} style={{ background: 'white', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                  {isVideo ? (
                    <VideoThumbnail src={item.image_url} />
                  ) : (
                    <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: 2 }}>{item.uploader_name || 'Guest'}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 10 }}>{formatTime(item.created_at)}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleApprove(item.id)}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        border: 'none',
                        borderRadius: 3,
                        background: 'rgba(72,187,120,0.12)',
                        color: '#276749',
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'Jost, sans-serif',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(item)}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        border: 'none',
                        borderRadius: 3,
                        background: 'rgba(229,62,62,0.08)',
                        color: '#c53030',
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'Jost, sans-serif',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModerationQueue;
