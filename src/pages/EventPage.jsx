import React, { useState, useEffect, useCallback } from 'react';
import { getEvent, getEventBySlug, getPhotos, getReels, supabase } from '../store.js';
import EventHeader from '../components/EventHeader.jsx';
import UploadButton from '../components/UploadButton.jsx';
import Gallery from '../components/Gallery.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NamePrompt from '../components/NamePrompt.jsx';
import FaceTagConsent from '../components/FaceTagConsent.jsx';
import CameraView from '../components/CameraView.jsx';

const isNativeApp = import.meta.env.VITE_NATIVE_APP === 'true';

const EventPage = ({ identifier, upgraded, onNavigate, toast }) => {
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgradeBanner, setUpgradeBanner] = useState(upgraded);
  const [notFound, setNotFound] = useState(false);
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('guestName') || '');
  const [photoCount, setPhotoCount] = useState(0);
  const [faceFilter, setFaceFilter] = useState(null); // null = show all, array = show filtered
  // setFaceFilter(null) is a no-op when faceFilter is already null — React bails out and the
  // face-tagging gate below never re-evaluates. Bumping this forces the re-render.
  const [, bumpConsent] = useState(0);
  const [reels, setReels] = useState([]);
  const [activePanel, setActivePanel] = useState(isNativeApp ? 'camera' : 'gallery');

  // Load event by slug first, then by code
  useEffect(() => {
    if (!identifier) return;

    const load = async () => {
      setLoading(true);
      // Try slug first
      let { data, error } = await getEventBySlug(identifier);
      if (error || !data) {
        // Fall back to code
        ({ data, error } = await getEvent(identifier.toUpperCase()));
      }
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setEvent(data);
      setLoading(false);
    };
    load();
  }, [identifier]);

  // Load photos
  const loadPhotos = useCallback(async () => {
    if (!event) return;
    const { data } = await getPhotos(event.id);
    setPhotos(data);
    setPhotoCount(data.length);
  }, [event]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    if (!event) return;
    getReels(event.id).then(({ data }) => setReels(data || []));
  }, [event]);

  // Realtime counter
  useEffect(() => {
    if (!event) return;

    const channel = supabase
      .channel('photo-counter')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'photos',
        filter: `event_id=eq.${event.id}`,
      }, () => {
        setPhotoCount((prev) => prev + 1);
        loadPhotos();
      })
      .subscribe();

    // Fallback polling every 10s
    const interval = setInterval(loadPhotos, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [event, loadPhotos]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✦</div>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Event not found</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>Check the code or URL and try again.</p>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8860B', fontFamily: "'Courier Prime', monospace", fontSize: '0.85rem', padding: '10px 24px' }}>← Back to home</button>
        </div>
      </div>
    );
  }

  // Check if event has ended or expired
  const isEnded = event.status === 'ended';
  const isExpired = event.expires_at && new Date(event.expires_at) < new Date();
  if (isEnded || isExpired) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✦</div>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>This event has ended</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>Thanks for being part of the memories.</p>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8860B', fontFamily: "'Courier Prime', monospace", fontSize: '0.85rem', padding: '10px 24px' }}>← Back to home</button>
        </div>
      </div>
    );
  }

  // Guest name prompt
  if (!guestName) {
    return (
      <NamePrompt
        eventName={event.title}
        onJoin={(name) => setGuestName(name)}
      />
    );
  }

  // Face tagging consent — shown after name, before gallery
  if (event.face_tagging_enabled && !sessionStorage.getItem('faceTagConsent')) {
    return (
      <FaceTagConsent
        event={event}
        onAccept={(matchIds) => {
          if (matchIds && matchIds.length > 0) {
            setFaceFilter(matchIds);
          }
        }}
        onSkip={() => {
          setFaceFilter(null);
          bumpConsent((n) => n + 1);
        }}
        onRetry={() => {
          setFaceFilter(null);
        }}
      />
    );
  }

  // Determine which photos to display
  const displayPhotos = faceFilter && faceFilter.length > 0
    ? photos.filter((p) => faceFilter.includes(p.id))
    : photos;

  return (
    <div data-theme={event.theme || 'classic'}>
    <div style={{ minHeight: '100vh', background: 'var(--bg, var(--cream))', display: 'flex', flexDirection: 'column' }}>
      <EventHeader event={event} photoCount={photoCount} />
      <div style={{ flex: 1, display: isNativeApp ? 'flex' : 'block', overflow: 'hidden' }}>
        {isNativeApp ? (
          <>
            <div style={{ minWidth: '100%', height: '100%', display: activePanel === 'camera' ? 'block' : 'none' }}>
              <CameraView
                event={event}
                onPhotoAdded={loadPhotos}
                onOpenGallery={() => setActivePanel('gallery')}
              />
            </div>
            <div style={{ minWidth: '100%', height: '100%', overflowY: 'auto', display: activePanel === 'gallery' ? 'block' : 'none' }}>
              <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
                <button
                  onClick={() => setActivePanel('camera')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8860B', fontSize: '0.82rem', fontFamily: "'Courier Prime', monospace", marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ← Camera
                </button>
                <UploadButton event={event} onPhotoAdded={loadPhotos} />
                <Gallery photos={displayPhotos} eventName={event.title} theme={event.theme || 'classic'} onPhotoClick={(p) => setLightboxIndex(displayPhotos.findIndex(photo => photo.id === p.id))} />
                <Lightbox item={lightboxIndex !== null ? displayPhotos[lightboxIndex] : null} photos={displayPhotos} currentIndex={lightboxIndex} onNavigate={setLightboxIndex} eventName={event.title} onClose={() => setLightboxIndex(null)} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: event.theme === 'film' ? '0 24px 40px' : '40px 24px' }}>
            {event.theme === 'film' && (
              <>
                <Gallery photos={displayPhotos} eventName={event.title} theme={event.theme || 'classic'} onPhotoClick={(p) => setLightboxIndex(displayPhotos.findIndex(photo => photo.id === p.id))} />
                <Lightbox item={lightboxIndex !== null ? displayPhotos[lightboxIndex] : null} photos={displayPhotos} currentIndex={lightboxIndex} onNavigate={setLightboxIndex} eventName={event.title} onClose={() => setLightboxIndex(null)} />
                <UploadButton event={event} onPhotoAdded={loadPhotos} />
              </>
            )}
            {upgradeBanner && (
              <div style={{ background: 'var(--accent-tint-soft, rgba(201,168,76,0.1))', border: '1px solid var(--accent-tint-medium, rgba(201,168,76,0.3))', borderRadius: 0, padding: '14px 20px', marginBottom: 20, textAlign: 'center', fontSize: '0.9rem', color: 'var(--charcoal)' }}>
                Upgrade successful! Your event now has Premium features.
                <button onClick={() => setUpgradeBanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 12, color: 'var(--muted)', fontSize: '0.85rem' }}>✕</button>
              </div>
            )}
            {event.theme !== 'film' && <UploadButton event={event} onPhotoAdded={loadPhotos} />}
            {faceFilter && faceFilter.length > 0 && (
              <div style={{ background: '#F8F0D8', border: '2px solid #E8D080', borderRadius: 0, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--charcoal)' }}>
                  {faceFilter.length} photo{faceFilter.length !== 1 ? 's' : ''} and video{faceFilter.length !== 1 ? 's' : ''} featuring you
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setFaceFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontSize: '0.82rem', fontWeight: 500, fontFamily: "'Courier Prime', monospace" }}>See everything</button>
                  <button onClick={() => { sessionStorage.removeItem('faceTagConsent'); sessionStorage.removeItem('faceMatchIds'); setFaceFilter(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.82rem', fontFamily: "'Courier Prime', monospace" }}>Search again</button>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right', marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {event.face_tagging_enabled && (
                <button onClick={() => { sessionStorage.removeItem('faceTagConsent'); sessionStorage.removeItem('faceMatchIds'); setFaceFilter(null); bumpConsent((n) => n + 1); }} style={{ display: 'inline-block', fontSize: '0.75rem', color: 'var(--gold-dark)', background: 'none', border: '1px solid var(--gold)', borderRadius: 0, padding: '6px 14px', fontFamily: "'Courier Prime', monospace", letterSpacing: '0.03em', cursor: 'pointer' }}>
                  🔍 Find my photos
                </button>
              )}
              <a href={`#/host/${event.id}`} style={{ display: 'inline-block', fontSize: '0.75rem', color: 'var(--gold-dark)', textDecoration: 'none', border: '1px solid var(--gold)', borderRadius: 0, padding: '6px 14px', fontFamily: "'Courier Prime', monospace", letterSpacing: '0.03em' }}>
                Are you the host?
              </a>
            </div>
            {reels.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div className="divider" style={{ marginBottom: 16 }}>Reels</div>
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                  {reels.map((r) => (
                    <a key={r.id} href={`#/reel/${event.id}/${r.id}`} style={{ flexShrink: 0, width: 120, background: 'var(--charcoal)', borderRadius: 0, overflow: 'hidden', textDecoration: 'none', display: 'block', position: 'relative' }}>
                      {(r.photo_ids || []).length > 0 && (() => { const firstPhoto = displayPhotos.find((p) => p.id === r.photo_ids[0]); return firstPhoto ? (<img src={firstPhoto.image_url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block', opacity: 0.8 }} />) : (<div style={{ width: '100%', height: 160, background: 'var(--charcoal)' }} />); })()}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))', display: 'flex', alignItems: 'flex-end', padding: '10px 8px' }}>
                        <p style={{ fontSize: '0.75rem', color: 'white', fontWeight: 500, lineHeight: 1.3 }}>{r.title}</p>
                      </div>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 36, height: 36, borderRadius: 0, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: '1rem', marginLeft: 3 }}>▶</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {event.theme !== 'film' && (
              <>
                <div className="divider" style={{ marginBottom: 28 }}>
                  {displayPhotos.length > 0 ? `${displayPhotos.length} Photo${displayPhotos.length !== 1 ? 's' : ''} and Video${displayPhotos.length !== 1 ? 's' : ''} Shared` : 'Gallery'}
                </div>
                <Gallery photos={displayPhotos} eventName={event.title} theme={event.theme || 'classic'} onPhotoClick={(p) => setLightboxIndex(displayPhotos.findIndex(photo => photo.id === p.id))} />
                <Lightbox item={lightboxIndex !== null ? displayPhotos[lightboxIndex] : null} photos={displayPhotos} currentIndex={lightboxIndex} onNavigate={setLightboxIndex} eventName={event.title} onClose={() => setLightboxIndex(null)} />
              </>
            )}
            {!event.photographer_id && (
              <div style={{ textAlign: 'center', padding: '24px 20px 32px', fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.05em' }}>
                Powered by EventSnap · eventsnapapp.live
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default EventPage;
