import React, { useState, useEffect, useCallback } from 'react';
import { Landing, CreateEvent } from './pages/HomePage.jsx';
import EventPage from './pages/EventPage.jsx';
import HostDashboard from './pages/HostDashboard.jsx';
import SignInPage from './pages/SignInPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import PhotographerUpload from './pages/PhotographerUpload.jsx';
import Slideshow from './pages/Slideshow.jsx';
import HighlightReel from './pages/HighlightReel.jsx';
import PhotographerSignup from './pages/PhotographerSignup.jsx';
import PhotographerLogin from './pages/PhotographerLogin.jsx';
import PhotographerDashboard from './pages/PhotographerDashboard.jsx';
import { getEvent, getPhotos, supabase } from './store.js';
import { useAuth } from './contexts/AuthContext';
import QRCode from './components/QRCode.jsx';
import Gallery from './components/Gallery.jsx';
import Lightbox from './components/Lightbox.jsx';
import Home from './pages/Home.jsx';

const FONT_STYLE = `
  /* TODO(iOS Capacitor): Space Grotesk must be bundled offline for the native build; the @import below is a web-only fallback. */
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Jost:wght@300;400;500&family=Space+Grotesk:wght@500;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #faf7f2;
    --warm-white: #fff9f2;
    --gold: #c9a84c;
    --gold-light: #e8d08a;
    --gold-dark: #8b6914;
    --charcoal: #2c2c2c;
    --muted: #7a7065;
    --border: #e8e0d0;
    --card: #ffffff;
    --shadow: 0 4px 40px rgba(0,0,0,0.08);
    --shadow-hover: 0 8px 60px rgba(0,0,0,0.14);
  }

  body { background: var(--cream); font-family: 'Jost', sans-serif; color: var(--charcoal); }

  .serif { font-family: 'Cormorant Garamond', Georgia, serif; }

  [data-theme="film"] {
    --bg: #14110E;
    --header-bg: #14110E;
    --accent: #FF8A1E;
    --text: #F2E8DB;
    --text-soft: rgba(242,232,219,0.7);
    --text-faint: rgba(242,232,219,0.45);
    --badge-bg: rgba(255,138,30,0.15);
    --badge-text: #FF8A1E;
    --gold: var(--accent);
    --gold-dark: #FF8A1E;
    --gold-light: #FFB35C;
    --accent-tint-faint: rgba(255,138,30,0.05);
    --accent-tint-soft: rgba(255,138,30,0.1);
    --accent-tint-medium: rgba(255,138,30,0.15);
    --accent-ring: rgba(255,138,30,0.2);
    --muted: rgba(242,232,219,0.55);
    --border: rgba(242,232,219,0.15);
  }
  [data-theme="film"] .serif { font-family: 'Jost', sans-serif; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }

  .fade-up { animation: fadeUp 0.6s ease forwards; }
  .fade-up-2 { animation: fadeUp 0.6s 0.1s ease both; }
  .fade-up-3 { animation: fadeUp 0.6s 0.2s ease both; }
  .fade-up-4 { animation: fadeUp 0.6s 0.3s ease both; }

  .btn-gold {
    background: linear-gradient(135deg, var(--gold-dark), var(--gold), var(--gold-light), var(--gold));
    background-size: 300% 100%;
    color: white;
    border: none;
    cursor: pointer;
    font-family: 'Jost', sans-serif;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 0.72rem;
    transition: all 0.3s ease;
  }
  .btn-gold:hover {
    background-position: right center;
    box-shadow: 0 6px 24px rgba(201,168,76,0.4);
    transform: translateY(-1px);
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--gold);
    color: var(--gold-dark);
    cursor: pointer;
    font-family: 'Jost', sans-serif;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.72rem;
    transition: all 0.3s ease;
  }
  .btn-outline:hover {
    background: var(--gold);
    color: white;
  }

  input, textarea, select {
    font-family: 'Jost', sans-serif;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  input:focus, textarea:focus {
    border-color: var(--gold) !important;
    box-shadow: 0 0 0 3px var(--accent-ring, rgba(201,168,76,0.12));
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--muted);
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .photo-card {
    aspect-ratio: 1;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  .photo-card:hover {
    transform: scale(1.03);
    box-shadow: var(--shadow-hover);
    z-index: 2;
  }
  .photo-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .photo-card .overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.5));
    padding: 12px 10px 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .photo-card:hover .overlay { opacity: 1; }

  @media (hover: none) {
    .photo-card .overlay { opacity: 1; }
  }

  .drop-zone {
    border: 2px dashed var(--gold-light);
    border-radius: 8px;
    transition: all 0.2s ease;
    background: var(--accent-tint-faint, rgba(201,168,76,0.03));
  }
  .drop-zone.drag-over {
    border-color: var(--gold);
    background: var(--accent-tint-soft, rgba(201,168,76,0.08));
    transform: scale(1.01);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    font-weight: 500;
  }
  .badge-gold { background: var(--accent-tint-medium, rgba(201,168,76,0.12)); color: var(--gold-dark); }
  .badge-green { background: rgba(72,187,120,0.12); color: #276749; }

  .toast {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    background: var(--charcoal);
    color: white;
    padding: 14px 28px;
    border-radius: 100px;
    font-size: 0.82rem;
    letter-spacing: 0.04em;
    transition: transform 0.3s ease;
    z-index: 9999;
    white-space: nowrap;
  }
  .toast.show { transform: translateX(-50%) translateY(0); }

  .modal-bg {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: scaleIn 0.2s ease;
  }

  .lightbox-arrow {
    opacity: 0.7;
    transition: opacity 0.2s;
  }
  .lightbox-arrow:hover {
    opacity: 1;
  }
  @media (max-width: 600px) {
    .lightbox-arrow {
      display: none !important;
    }
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(250,247,242,0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
  }

  .loader {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(201,168,76,0.3);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;

// ─── Toast ────────────────────────────────────────────────────────────────────
const useToast = () => {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2600);
  }, []);
  return { msg, show };
};

const ToastEl = ({ msg }) => (
  <div className={`toast ${msg ? 'show' : ''}`}>{msg || ''}</div>
);

// ─── Hash Router ──────────────────────────────────────────────────────────────
const parseHash = () => {
  const full = window.location.hash.replace('#', '') || '/';
  const hash = full.split('?')[0];
  const query = full.split('?')[1] || '';
  const params = new URLSearchParams(query);
  if (hash.startsWith('/event/')) {
    return { screen: 'event', identifier: hash.replace('/event/', ''), upgraded: params.get('upgraded') === 'true' };
  }
  if (hash === '/create') return { screen: 'create' };
  if (hash === '/join') return { screen: 'join' };
  if (hash.startsWith('/dashboard/')) {
    return { screen: 'dashboard', eventId: hash.replace('/dashboard/', '') };
  }
  if (hash.startsWith('/host/')) {
    return { screen: 'host', eventCode: hash.replace('/host/', ''), upgraded: params.get('upgraded') === 'true' };
  }
  if (hash.startsWith('/slideshow/')) {
    return { screen: 'slideshow', eventCode: hash.replace('/slideshow/', '') };
  }
  if (hash.startsWith('/reel/')) {
    const reelPath = hash.replace('/reel/', '');
    const [reelEventCode, reelId] = reelPath.split('/');
    return { screen: 'reel', eventCode: reelEventCode, reelId: reelId || null };
  }
  if (hash.startsWith('/upload/') && hash.endsWith('/pro')) {
    const eventCode = hash.replace('/upload/', '').replace('/pro', '');
    return { screen: 'photographer', eventCode };
  }
  if (hash === '/signin') return { screen: 'signin' };
  if (hash === '/signup') return { screen: 'signup' };
  if (hash === '/pro/signup') return { screen: 'proSignup' };
  if (hash === '/pro/login') return { screen: 'proLogin' };
  if (hash.startsWith('/pro/dashboard')) return { screen: 'proDashboard' };
  return { screen: 'home' };
};

// ─── Join Screen ──────────────────────────────────────────────────────────────
const JoinScreen = ({ onNavigate, toast }) => {
  const [inputCode, setInputCode] = useState('');

  const handleJoin = () => {
    const code = inputCode.trim();
    if (!code) return;
    onNavigate('event', { identifier: code });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✦</div>
          <h2 className="serif" style={{ fontSize: '2.4rem', fontWeight: 300, marginBottom: 8 }}>Join Event</h2>
          <p style={{ color: 'var(--muted)', fontWeight: 300, fontSize: '0.9rem' }}>Enter the event code from your invitation or QR scan</p>
        </div>
        <div style={{ background: 'white', borderRadius: 6, padding: 36, boxShadow: 'var(--shadow)' }}>
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="EVENT CODE"
            maxLength={8}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '16px', fontSize: '1.6rem', textAlign: 'center', letterSpacing: '0.25em', fontFamily: 'Cormorant Garamond, serif', marginBottom: 20, background: 'var(--cream)' }}
          />
          <button className="btn-gold" onClick={handleJoin} style={{ width: '100%', padding: '14px', borderRadius: 3 }}>
            Enter Gallery
          </button>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem' }}>← Back to home</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Dashboard (host view) ────────────────────────────────────────────────────
const Dashboard = ({ eventId, onNavigate, toast }) => {
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [tab, setTab] = useState('qr');

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data } = await getEvent(eventId);
      if (data) setEvent(data);
      const { data: p } = await getPhotos(eventId);
      setPhotos(p || []);
    })();
  }, [eventId]);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(eventId).catch(() => {});
    toast.show('Event code copied!');
  };

  if (!event) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="loader" /></div>;

  const qrUrl = event.event_slug
    ? `https://eventsnapapp.live/event/${event.event_slug}`
    : `https://eventsnapapp.live/event/${event.id}`;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      <div style={{ background: 'var(--charcoal)', padding: '48px 32px 40px', color: 'white' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', letterSpacing: '0.08em', marginBottom: 24 }}>← All Events</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold-light)', marginBottom: 12 }}>✦ Host Dashboard</span>
              <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 300, lineHeight: 1.2 }}>{event.title}</h1>
              {event.subtitle && <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontWeight: 300 }}>{event.subtitle}</p>}
              <p style={{ color: 'rgba(255,255,255,0.3)', marginTop: 8, fontSize: '0.85rem' }}>{formatDate(event.date)}{event.host && ` · Hosted by ${event.host}`}</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" onClick={() => onNavigate('event', { identifier: event.event_slug || event.id })} style={{ padding: '10px 20px', borderRadius: 3, color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)' }}>
                Guest View →
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24 }}>
            {[['📸', photos.length, 'Photos & Videos'], ['👥', 'Live', 'Gallery Status']].map(([icon, val, label]) => (
              <div key={label}>
                <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--gold-light)' }}>{val}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginTop: 2 }}>{label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 40 }}>
          {['qr', 'photos'].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Jost, sans-serif', color: tab === t ? 'var(--gold-dark)' : 'var(--muted)', borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.2s' }}>
              {t === 'qr' ? 'QR Code & Share' : `Gallery (${photos.length})`}
            </button>
          ))}
        </div>

        {tab === 'qr' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, animation: 'fadeUp 0.4s ease' }}>
            <div style={{ background: 'white', borderRadius: 6, padding: 40, boxShadow: 'var(--shadow)', textAlign: 'center' }}>
              <h3 className="serif" style={{ fontSize: '1.4rem', fontWeight: 400, marginBottom: 6 }}>Guest QR Code</h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: 28, fontWeight: 300 }}>Print or display at your event</p>
              <div style={{ display: 'inline-block', padding: 16, background: '#faf7f2', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 24 }}>
                <QRCode value={qrUrl} size={180} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>EVENT CODE</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--cream)', borderRadius: 4, padding: '12px 20px', marginBottom: 20 }}>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2rem', letterSpacing: '0.25em', fontWeight: 400 }}>{event.id}</span>
                <button onClick={handleCopyCode} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: '0.75rem', letterSpacing: '0.08em' }}>COPY</button>
              </div>
              {event.event_slug && (
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 16 }}>
                  eventsnapapp.live/event/{event.event_slug}
                </p>
              )}
              <button className="btn-gold" onClick={() => window.print?.()} style={{ width: '100%', padding: '12px', borderRadius: 3, fontSize: '0.75rem' }}>
                Print QR Code
              </button>
            </div>

            <div>
              <div style={{ background: 'white', borderRadius: 6, padding: 32, boxShadow: 'var(--shadow)', marginBottom: 20 }}>
                <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Share Options</h3>
                {[
                  { icon: '📱', label: 'Text / WhatsApp', desc: 'Send the code directly to guests' },
                  { icon: '📧', label: 'Email Invitation', desc: 'Include the QR in your digital invite' },
                  { icon: '🖨️', label: 'Print & Display', desc: 'Place cards, posters, table stands' },
                  { icon: '📲', label: 'Digital Display', desc: 'Show on a TV or screen at the venue' },
                ].map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.4rem', width: 36, textAlign: 'center' }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.02))', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: 24 }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                  💡 <strong>Pro tip:</strong> Create a printed table card with the QR code and a short note like <em>"Scan to share your photos!"</em> — guests love participating.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'photos' && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            {photos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: '4rem', marginBottom: 20, opacity: 0.3 }}>📸</div>
                <h3 className="serif" style={{ fontSize: '1.8rem', fontWeight: 300, marginBottom: 8, color: 'var(--muted)' }}>No photos yet</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Share your QR code with guests to start collecting photos</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{photos.length} photo{photos.length !== 1 ? 's' : ''} and video{photos.length !== 1 ? 's' : ''}</span>
                </div>
                <Gallery photos={photos} eventName={event.title} onPhotoClick={setLightbox} />
              </>
            )}
          </div>
        )}
      </div>

      <Lightbox item={lightbox} eventName={event.title} onClose={() => setLightbox(null)} />
    </div>
  );
};

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(parseHash);
  const toast = useToast();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      const dest = sessionStorage.getItem('postAuthRedirect');
      if (dest && dest !== '' && dest !== '#/') {
        sessionStorage.removeItem('postAuthRedirect');
        window.location.hash = dest.replace('#', '');
      }
    }
  }, [user]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (screen, params = {}) => {
    if (screen === 'home') window.location.hash = '/';
    else if (screen === 'create') window.location.hash = '/create';
    else if (screen === 'join') window.location.hash = '/join';
    else if (screen === 'event') window.location.hash = `/event/${params.identifier}`;
    else if (screen === 'dashboard') window.location.hash = `/dashboard/${params.eventId}`;
    else if (screen === 'host') window.location.hash = `/host/${params.eventCode}`;
    else if (screen === 'slideshow') window.location.hash = `/slideshow/${params.eventCode}`;
    else if (screen === 'reel') window.location.hash = `/reel/${params.eventCode}${params.reelId ? '/' + params.reelId : ''}`;
    else if (screen === 'photographer') window.location.hash = `/upload/${params.eventCode}/pro`;
    else if (screen === 'signin') window.location.hash = '/signin';
    else if (screen === 'signup') window.location.hash = '/signup';
    else if (screen === 'proSignup') window.location.hash = '/pro/signup';
    else if (screen === 'proLogin') window.location.hash = '/pro/login';
    else if (screen === 'proDashboard') window.location.hash = '/pro/dashboard';
  };

  const showNav = route.screen !== 'event' && route.screen !== 'host' && route.screen !== 'photographer' && route.screen !== 'slideshow' && route.screen !== 'reel' && route.screen !== 'proSignup' && route.screen !== 'proLogin' && route.screen !== 'proDashboard';

  return (
    <>
      <style>{FONT_STYLE}</style>

      {showNav && (
        <div className="nav">
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => navigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--gold)', fontSize: '1rem' }}>✦</span>
              <span className="serif" style={{ fontSize: '1.2rem', fontWeight: 400, letterSpacing: '0.04em' }}>EventSnap</span>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-outline" onClick={() => navigate('join')} style={{ padding: '7px 16px', borderRadius: 3, fontSize: '0.72rem' }}>Join Event</button>
              <button className="btn-gold" onClick={() => navigate('create')} style={{ padding: '7px 16px', borderRadius: 3, fontSize: '0.72rem' }}>Create Event</button>
              {user && (
                <button
                  className="btn-outline"
                  onClick={async () => { await signOut(); }}
                  style={{ padding: '7px 16px', borderRadius: 3, fontSize: '0.72rem' }}
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {route.screen === 'home' && <Home onNavigate={navigate} />}
      {route.screen === 'create' && (user ? <CreateEvent onNavigate={navigate} toast={toast} /> : <SignInPage onNavigate={navigate} />)}
      {route.screen === 'signin' && <SignInPage onNavigate={navigate} />}
      {route.screen === 'signup' && <SignUpPage onNavigate={navigate} />}
      {route.screen === 'dashboard' && <Dashboard eventId={route.eventId} onNavigate={navigate} toast={toast} />}
      {route.screen === 'event' && <EventPage identifier={route.identifier} upgraded={route.upgraded} onNavigate={navigate} toast={toast} />}
      {route.screen === 'host' && (user ? <HostDashboard eventCode={route.eventCode} upgraded={route.upgraded} onNavigate={navigate} toast={toast} /> : <SignInPage onNavigate={navigate} />)}
      {route.screen === 'slideshow' && <Slideshow eventCode={route.eventCode} />}
      {route.screen === 'reel' && <HighlightReel eventCode={route.eventCode} reelId={route.reelId} />}
      {route.screen === 'photographer' && <PhotographerUpload eventCode={route.eventCode} toast={toast} />}
      {route.screen === 'proSignup' && <PhotographerSignup onNavigate={navigate} />}
      {route.screen === 'proLogin' && <PhotographerLogin onNavigate={navigate} />}
      {route.screen === 'proDashboard' && <PhotographerDashboard onNavigate={navigate} toast={toast} />}
      {route.screen === 'join' && <JoinScreen onNavigate={navigate} toast={toast} />}

      <ToastEl msg={toast.msg} />
    </>
  );
}
