import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getEvent, getPhotos, updateEvent, uploadFile, getAllPhotosCount, getUniqueGuestCount, getUploadsPerDay, getTopUploaders, getLastUploadTime, getReels, supabase } from '../store.js';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ModerationQueue from '../components/ModerationQueue.jsx';
import { API_BASE } from '../config.js';
import Gallery from '../components/Gallery.jsx';
import Lightbox from '../components/Lightbox.jsx';
import QRCode from '../components/QRCode.jsx';
import JSZip from 'jszip';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${formatDate(d)} at ${dt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}`;
};

const ALLOWED_THEMES = ['classic', 'film'];
const PREMIUM_THEMES = []; // none premium yet; wired for future use
const validateTheme = (v) => ALLOWED_THEMES.includes(v) ? v : 'classic';

const ReelPhotoGrid = React.memo(({ photos, reelPhotoIds, onToggle }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
    {photos.map((p) => {
      const selected = reelPhotoIds.includes(p.id);
      return (
        <div
          key={p.id}
          onClick={() => onToggle(p.id, selected)}
          style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', border: selected ? '2px solid var(--gold)' : '2px solid transparent' }}
        >
          <img src={p.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {selected && (
            <div style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'white' }}>✓</div>
          )}
        </div>
      );
    })}
  </div>
), (prev, next) => prev.reelPhotoIds === next.reelPhotoIds && prev.photos === next.photos);

// ─── Upgrade Prompt (reusable) ────────────────────────────────────────────────
const UpgradePrompt = ({ eventCode, eventTitle, label, tier }) => {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/.netlify/functions/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCode: eventCode, tier: tier || 'premium' }),
      });
      const { url } = await response.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: 20, textAlign: 'center' }}>
      <p style={{ fontSize: '0.88rem', color: 'var(--charcoal)', marginBottom: 12 }}>
        {label || 'This is a Premium feature.'}
      </p>
      <button className="btn-gold" onClick={handleUpgrade} disabled={loading} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.75rem' }}>
        {loading ? 'Preparing checkout...' : (tier === 'premium_max' ? 'Upgrade to Premium Max — £59' : 'Upgrade to Premium')}
      </button>
    </div>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ event }) => {
  const isExpired = event.expires_at && new Date(event.expires_at) < new Date();
  const isEnded = event.status === 'ended';
  let label, bg, color;
  if (isEnded) { label = 'Ended'; bg = 'rgba(229,62,62,0.1)'; color = '#c53030'; }
  else if (isExpired) { label = 'Expired'; bg = 'rgba(160,160,160,0.15)'; color = '#666'; }
  else { label = 'Active'; bg = 'rgba(72,187,120,0.12)'; color = '#276749'; }
  return <span className="badge" style={{ background: bg, color }}>{label}</span>;
};

const PlanBadge = ({ plan }) => {
  const isPremium = plan === 'premium' || plan === 'premium_max';
  return (
    <span className="badge" style={{ background: isPremium ? 'rgba(201,168,76,0.12)' : 'rgba(160,160,160,0.1)', color: isPremium ? 'var(--gold-dark)' : '#666' }}>
      {plan === 'premium_max' ? 'Premium Max' : isPremium ? 'Premium' : 'Free'}
    </span>
  );
};

// ─── Host Dashboard ───────────────────────────────────────────────────────────
const HostDashboard = ({ eventCode, upgraded, onNavigate, toast }) => {
  const { user, signOut } = useAuth();
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [copyLabel, setCopyLabel] = useState('Copy Join Link');
  const [nudgeCopyLabel, setNudgeCopyLabel] = useState('Copy Message');
  const [upgradeBanner, setUpgradeBanner] = useState(upgraded);
  const coverRef = useRef();

  // Premium analytics state
  const [uploadsPerDay, setUploadsPerDay] = useState([]);
  const [topUploaders, setTopUploaders] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);

  // Highlight reel state
  const [reels, setReels] = useState([]);
  const [reelLoading, setReelLoading] = useState(false);
  const [activeReelId, setActiveReelId] = useState(null);
  const [reelTitle, setReelTitle] = useState('');
  const [reelPhotoIds, setReelPhotoIds] = useState([]);
  const [showReelBuilder, setShowReelBuilder] = useState(false);
  const [reelSaving, setReelSaving] = useState(false);
  const [pendingSlideshowIds, setPendingSlideshowIds] = useState(null);
  const [faceDeleteLoading, setFaceDeleteLoading] = useState(false);
  const [reindexLoading, setReindexLoading] = useState(false);
  const [reindexMsg, setReindexMsg] = useState('');
  const [faceDeleteMsg, setFaceDeleteMsg] = useState('');
  const [posterDesign, setPosterDesign] = useState('design1');
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const loadEvent = useCallback(async () => {
    const { data } = await getEvent(eventCode);
    if (data) setEvent(data);
    return data;
  }, [eventCode]);

  const verifyAccess = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setAccessDenied(true); return; }
    try {
      const res = await fetch(`${API_BASE}/.netlify/functions/verify-host-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCode, accessToken: session.access_token }),
      });
      const { isOwner } = await res.json();
      if (!isOwner) setAccessDenied(true);
    } catch {
      setAccessDenied(true);
    }
  }, [eventCode]);

  const loadPhotos = useCallback(async () => {
    const { data } = await getPhotos(eventCode);
    setPhotos(data || []);
  }, [eventCode]);

  const loadStats = useCallback(async () => {
    const { count } = await getAllPhotosCount(eventCode);
    setTotalCount(count);
    const { count: guests } = await getUniqueGuestCount(eventCode);
    setGuestCount(guests);
  }, [eventCode]);

  const loadAnalytics = useCallback(async () => {
    const { data: dailyData } = await getUploadsPerDay(eventCode);
    setUploadsPerDay(dailyData || []);
    const { data: uploaderData } = await getTopUploaders(eventCode);
    setTopUploaders(uploaderData || []);
    const { data: lastTime } = await getLastUploadTime(eventCode);
    setLastUpload(lastTime);
  }, [eventCode]);

  const loadReels = useCallback(async () => {
    const { data } = await getReels(eventCode);
    setReels(data || []);
  }, [eventCode]);

  const handleReelToggle = useCallback((id, selected) => {
    if (!selected && reelPhotoIds.length >= 5) {
      toast.show('Maximum 5 items per reel');
      return;
    }
    setReelPhotoIds((prev) => selected ? prev.filter((pid) => pid !== id) : [...prev, id]);
  }, [reelPhotoIds, toast]);

  useEffect(() => {
    loadEvent();
    loadPhotos();
    loadStats();
    loadReels();
    verifyAccess();
  }, [loadEvent, loadPhotos, loadStats, loadReels, verifyAccess]);

  // Load analytics when event is loaded and premium
  useEffect(() => {
    if (event?.plan === 'premium') loadAnalytics();
  }, [event?.plan, loadAnalytics]);

  // Check for upgrade success param
  useEffect(() => {
    if (upgraded) {
      setUpgradeBanner(true);
      setTimeout(() => setUpgradeBanner(false), 5000);
      loadEvent();
    }
  }, [upgraded, loadEvent]);

  if (!event) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="loader" /></div>;
  }

  // Auth check — signed in user must be the host of this event
  // Exception: old events with no host_email are accessible to any signed-in user (transition state)
  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔒</div>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Access denied</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 24, fontWeight: 300 }}>
            You are not the host of this event.
          </p>
          <button className="btn-outline" onClick={() => onNavigate('home')} style={{ padding: '10px 24px', borderRadius: 3 }}>
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  const proAuth = JSON.parse(localStorage.getItem('proAuth') || 'null');
  const isPremiumMax = event.plan === 'premium_max';
  const isPremium = event.plan === 'premium' || event.plan === 'premium_max';
  const isEnded = event.status === 'ended';
  const isExpired = event.expires_at && new Date(event.expires_at) < new Date();
  const isDisabled = isEnded || isExpired;
  const joinUrl = `https://eventsnapapp.live/#/event/${event.event_slug || event.id}`;
  const proUploadUrl = `https://eventsnapapp.live/#/upload/${event.id}/pro`;
  const qrUrl = event.event_slug
    ? `https://eventsnapapp.live/event/${event.event_slug}`
    : `https://eventsnapapp.live/event/${event.id}`;

  // ─── Actions ──────────────────────────────────────────────────────────
  const handleEndEvent = async () => {
    const confirmed = window.confirm(
      'Are you sure? This will permanently close the event. Guests will no longer be able to upload or join.'
    );
    if (confirmed) {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_BASE}/.netlify/functions/update-event-setting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCode, field: 'status', value: 'ended', accessToken: session?.access_token }),
      });
      await loadEvent();
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/.netlify/functions/reject-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, eventCode, accessToken: session?.access_token }),
      });
      if (res.ok) {
        await loadPhotos();
        await loadStats();
        toast.show('Photo deleted.');
      } else {
        toast.show('Failed to delete photo.');
      }
    } catch {
      toast.show('Failed to delete photo.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(joinUrl).catch(() => {});
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy Join Link'), 2000);
  };

  const handleViewGallery = () => {
    window.open(`/#/event/${event.event_slug || event.id}`, '_blank');
  };

  const handleOpenSlideshow = () => {
    window.open(`/#/slideshow/${event.id}`, '_blank');
  };

  const handleModerationToggle = async () => {
    try {
      const res = await fetch(`${API_BASE}/.netlify/functions/update-event-setting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCode, field: 'moderation_enabled', value: !event.moderation_enabled, accessToken: (await supabase.auth.getSession()).data.session?.access_token }),
      });
      if (!res.ok) { toast.show('Failed to update moderation setting'); return; }
    } catch { toast.show('Failed to update moderation setting'); return; }
    toast.show(event.moderation_enabled ? 'Moderation turned off' : 'Moderation turned on');
    await loadEvent();
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { publicUrl, error } = await uploadFile('covers', file);
    if (error || !publicUrl) { toast.show('Cover photo upload failed.'); return; }
    await fetch(`${API_BASE}/.netlify/functions/update-event-setting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventCode, field: 'cover_photo_url', value: publicUrl, accessToken: (await supabase.auth.getSession()).data.session?.access_token }),
    });
    await loadEvent();
    toast.show('Cover photo updated!');
  };

  const handleDownloadZip = async () => {
    if (!isPremium) return;
    toast.show('Preparing ZIP...');
    try {
      const { data: allPhotos, error } = await supabase
        .from('photos')
        .select('image_url')
        .eq('event_id', eventCode);
      if (error || !allPhotos || allPhotos.length === 0) {
        toast.show('No photos found to download.');
        return;
      }
      toast.show(`Downloading ${allPhotos.length} photos...`);
      const zip = new JSZip();
      await Promise.all(
        allPhotos.map(async (photo, i) => {
          try {
            const res = await fetch(photo.image_url);
            const blob = await res.blob();
            const ext = photo.image_url.split('.').pop().split('?')[0] || 'jpg';
            zip.file(`photo-${i + 1}.${ext}`, blob);
          } catch {
            // skip failed downloads
          }
        })
      );
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_photos.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.show('ZIP ready!');
    } catch {
      toast.show('ZIP download failed.');
    }
  };

  const handlePrintPoster = () => {
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=2c2c2c&margin=12`;
    const fonts = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@300;400;700&display=swap');`;
    const reset = `* { margin: 0; padding: 0; box-sizing: border-box; }`;
    const printMedia = `@media print { -webkit-print-color-adjust: exact; color-adjust: exact; margin: 0; }`;
    const baseBody = `display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Jost', sans-serif;`;
    const basePoster = `width: 210mm; min-height: 297mm; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;`;
    const eventDate = event.date ? new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const eventId = event.id;

    let html = '';
    if (posterDesign === 'design1') {
      html = `<!DOCTYPE html><html><head><title>QR Poster — ${event.title}</title><style>
        ${fonts} ${reset}
        body { ${baseBody} background: #faf7f2; }
        .poster { ${basePoster} padding: 40mm 30mm; gap: 20px; }
        .gold-line { width: 60px; height: 1px; background: #c9a84c; }
        .brand { font-family: 'Jost', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 3px; color: #c9a84c; }
        h1 { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 52px; font-weight: 300; color: #1a1a1a; }
        .date { font-family: 'Jost', sans-serif; font-weight: 300; font-size: 16px; color: #888; }
        .qr-card { background: #ffffff; box-shadow: 0 2px 16px rgba(0,0,0,0.08); border-radius: 12px; padding: 20px; display: inline-block; }
        .qr-card img { display: block; border-radius: 4px; }
        .caption { font-family: 'Jost', sans-serif; font-style: italic; font-size: 14px; color: #666; max-width: 320px; line-height: 1.5; }
        .code-label { font-family: 'Jost', sans-serif; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
        .code-value { font-family: 'Jost', sans-serif; font-size: 16px; font-weight: 700; color: #1a1a1a; }
        .footer { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 13px; color: #c9a84c; }
        ${printMedia}
      </style></head><body>
        <div class="poster">
          <div class="gold-line"></div>
          <div class="brand">EventSnap</div>
          <h1>${event.title}</h1>
          <div class="date">${eventDate}</div>
          <div class="gold-line"></div>
          <div class="qr-card"><img src="${qrSrc}" width="280" height="280" /></div>
          <div class="caption">Scan the QR code and upload your favourite moments to our shared gallery</div>
          <div><span class="code-label">Event Code: </span><span class="code-value">${eventId}</span></div>
          <div class="footer">Captured by EventSnap</div>
        </div>
        <script>setTimeout(() => window.print(), 500);</script>
      </body></html>`;
    } else if (posterDesign === 'design2') {
      html = `<!DOCTYPE html><html><head><title>QR Poster — ${event.title}</title><style>
        ${fonts} ${reset}
        body { ${baseBody} background: #fffdf9; }
        .poster { ${basePoster} padding: 40mm 30mm; gap: 16px; }
        .top-caption { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 42px; color: #b07080; margin-bottom: 8px; }
        .divider { width: 120px; height: 1px; background: #d4a0b0; }
        h1 { font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 700; font-size: 54px; color: #2a1a1a; }
        .date { font-family: 'Jost', sans-serif; font-weight: 300; font-size: 16px; color: #c9a0a8; }
        .qr-card { background: #ffffff; border: 1px solid #e8c0cc; border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px rgba(176,112,128,0.15); display: inline-block; }
        .qr-card img { display: block; }
        .caption { font-family: 'Jost', sans-serif; font-style: italic; font-size: 13px; color: #b07080; max-width: 280px; line-height: 1.5; }
        .code-label { font-family: 'Jost', sans-serif; font-size: 12px; color: #aaaaaa; }
        .code-value { font-family: 'Jost', sans-serif; font-weight: 700; color: #2a1a1a; }
        .bottom-caption { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 24px; color: #b07080; }
        .footer { font-family: 'Jost', sans-serif; font-size: 11px; color: #cccccc; letter-spacing: 2px; }
        ${printMedia}
      </style></head><body>
        <div class="poster">
          <div class="top-caption">Share Our Love</div>
          <div class="divider"></div>
          <h1>${event.title}</h1>
          <div class="date">${eventDate}</div>
          <div class="divider"></div>
          <div class="qr-card"><img src="${qrSrc}" width="280" height="280" /></div>
          <div class="caption">Point your camera at the code, scan, and add your photos to our album</div>
          <div><span class="code-label">Event Code: </span><span class="code-value">${eventId}</span></div>
          <div class="bottom-caption">Capturing Loving Memories</div>
          <div class="footer">Captured by EventSnap</div>
        </div>
        <script>setTimeout(() => window.print(), 500);</script>
      </body></html>`;
    } else {
      html = `<!DOCTYPE html><html><head><title>QR Poster — ${event.title}</title><style>
        ${fonts} ${reset}
        body { ${baseBody} background: #ffffff; }
        .poster { ${basePoster} padding: 40mm 30mm; gap: 18px; }
        .emoji { font-size: 36px; }
        .share { font-family: 'Jost', sans-serif; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 4px; color: #1a1a1a; }
        h1 { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 54px; font-weight: 300; color: #1a1a1a; }
        .qr-wrap { border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; background: #ffffff; display: inline-block; }
        .qr-wrap img { display: block; }
        .caption { font-family: 'Jost', sans-serif; font-size: 13px; color: #777777; max-width: 320px; line-height: 1.5; }
        .meta { font-family: 'Jost', sans-serif; font-size: 12px; color: #aaaaaa; }
        .footer { font-family: 'Jost', sans-serif; font-size: 11px; color: #aaaaaa; letter-spacing: 2px; }
        ${printMedia}
      </style></head><body>
        <div class="poster">
          <div class="emoji">📷</div>
          <div class="share">SHARE YOUR</div>
          <div class="share">MEMORIES</div>
          <h1>${event.title}</h1>
          <div class="qr-wrap"><img src="${qrSrc}" width="280" height="280" /></div>
          <div class="caption">Scan with your phone camera and help us capture every memory from today</div>
          <div class="meta">${eventId}</div>
          <div class="meta">${eventDate}</div>
          <div class="footer">Captured by EventSnap</div>
        </div>
        <script>setTimeout(() => window.print(), 500);</script>
      </body></html>`;
    }

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  // ─── Nudge ────────────────────────────────────────────────────────────
  const nudgeMessage = `Don't forget to upload your photos and videos from ${event.title}! Join here: ${joinUrl}`;

  const getMilestoneNudge = () => {
    if (totalCount >= 50) return { milestone: 50, msg: `You've hit 50 uploads! Send a nudge to keep the momentum going.` };
    if (totalCount >= 25) return { milestone: 25, msg: `You've hit 25 uploads! Send a nudge to keep the momentum going.` };
    if (totalCount >= 10) return { milestone: 10, msg: `You've hit 10 uploads! Send a nudge to keep the momentum going.` };
    return null;
  };

  const handleNudgeCopy = (msg) => {
    navigator.clipboard?.writeText(msg || nudgeMessage).catch(() => {});
    setNudgeCopyLabel('Copied!');
    setTimeout(() => setNudgeCopyLabel('Copy Message'), 2000);
  };

  const handleNudgeWhatsApp = (msg) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg || nudgeMessage)}`, '_blank');
  };

  const milestone = isPremium ? getMilestoneNudge() : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      {upgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setUpgradeModal(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 10, padding: '40px 36px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', animation: 'scaleIn 0.2s ease' }}>
            <div style={{ fontSize: '2.8rem', marginBottom: 16 }}>{upgradeModal.emoji}</div>
            <h3 className="serif" style={{ fontSize: '1.5rem', fontWeight: 300, marginBottom: 10, color: 'var(--charcoal)', lineHeight: 1.3 }}>{upgradeModal.title}</h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--muted)', marginBottom: 28, lineHeight: 1.7, fontWeight: 300 }}>{upgradeModal.subtitle}</p>
            <button
              className="btn-gold"
              onClick={async () => {
                setUpgradeModal(null);
                const response = await fetch(`${API_BASE}/.netlify/functions/create-checkout-session`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ eventCode: event.id, tier: 'premium' }),
                });
                const { url } = await response.json();
                window.location.href = url;
              }}
              style={{ width: '100%', padding: '14px', borderRadius: 3, marginBottom: 12, fontSize: '0.8rem' }}
            >
              Unlock with Premium — £29
            </button>
            <button onClick={() => setUpgradeModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.82rem', fontFamily: 'Jost, sans-serif' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
      {/* Upgrade success banner */}
      {upgradeBanner && (
        <div style={{ background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: 'white', padding: '14px 24px', textAlign: 'center', fontSize: '0.92rem', fontWeight: 500 }}>
          🎉 Your event is now Premium!
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'var(--charcoal)', padding: '48px 32px 40px', color: 'white' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', letterSpacing: '0.08em' }}>← All Events</button>
            <button onClick={async () => { await signOut(); onNavigate('home'); }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '0.08em', padding: '5px 12px', fontFamily: "'Jost', sans-serif", transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'} onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>Sign Out</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold-light)', marginBottom: 12 }}>✦ Host Dashboard</span>
              <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 300, lineHeight: 1.2 }}>{event.title}</h1>
              {event.subtitle && <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 6, fontWeight: 300 }}>{event.subtitle}</p>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>

        {/* Upgrade button for free events */}
        {!isPremium && (
          <div style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.02))', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 6, padding: '20px 28px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--charcoal)', marginBottom: 2 }}>Premium — £29</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 300 }}>ZIP downloads, analytics, photographer access, 2000 photos, and more</p>
              </div>
              <UpgradePrompt eventCode={event.id} eventTitle={event.title} label="Upgrade to Premium — £29" tier="premium" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(201,168,76,0.15)' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--charcoal)', marginBottom: 2 }}>Premium Max — £59</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 300 }}>5000 photos/videos, all Premium features, priority support</p>
              </div>
              <UpgradePrompt eventCode={event.id} eventTitle={event.title} label="Upgrade to Premium Max — £59" tier="premium_max" />
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(201,168,76,0.15)', textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Photographer? Get unlimited events with Pro — £19/month{' '}
                <button onClick={() => onNavigate('proSignup')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontWeight: 500, fontFamily: 'Jost, sans-serif', fontSize: '0.8rem' }}>
                  Sign up
                </button>
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>

          {/* ─── Panel 1: Event Overview ───────────────────────────── */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Event Overview</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <StatusBadge event={event} />
              <PlanBadge plan={event.plan} />
            </div>
            <div style={{ fontSize: '0.85rem', lineHeight: 2.2 }}>
              <div><span style={{ color: 'var(--muted)' }}>Event Code:</span> <strong style={{ letterSpacing: '0.1em' }}>{event.id}</strong></div>
              {event.event_slug && <div><span style={{ color: 'var(--muted)' }}>Custom URL:</span> eventsnapapp.live/event/{event.event_slug}</div>}
              <div><span style={{ color: 'var(--muted)' }}>Created:</span> {formatDate(event.created_at)}</div>
              {event.expires_at && <div><span style={{ color: 'var(--muted)' }}>Expires:</span> {formatDate(event.expires_at)}</div>}
              <div><span style={{ color: 'var(--muted)' }}>Photos & Videos:</span> <strong>{totalCount}</strong></div>
              <div><span style={{ color: 'var(--muted)' }}>Unique Guests:</span> <strong>{guestCount}</strong></div>
            </div>
          </div>

          {/* ─── Panel 2: Quick Actions ────────────────────────────── */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isEnded ? (
                <button disabled style={{ padding: '11px 16px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--cream)', color: 'var(--muted)', fontSize: '0.82rem', fontFamily: 'Jost, sans-serif', cursor: 'not-allowed' }}>
                  Event Ended
                </button>
              ) : (
                <button onClick={handleEndEvent} style={{ padding: '11px 16px', borderRadius: 3, border: '1px solid rgba(229,62,62,0.3)', background: 'rgba(229,62,62,0.06)', color: '#c53030', fontSize: '0.82rem', fontFamily: 'Jost, sans-serif', cursor: 'pointer', fontWeight: 500 }}>
                  End Event
                </button>
              )}
              <button className="btn-outline" onClick={handleCopyLink} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                {copyLabel}
              </button>
              <button className="btn-outline" onClick={handleViewGallery} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                View Gallery
              </button>

              {/* ZIP Download — gated */}
              {isPremium ? (
                <button className="btn-outline" onClick={handleDownloadZip} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                  Download All as ZIP
                </button>
              ) : (
                <button className="btn-outline" onClick={() => setUpgradeModal({ emoji: '📦', title: 'Download all your photos', subtitle: 'Get every photo and video in one ZIP file, ready to save or share.' })} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                  Download All as ZIP
                </button>
              )}

              <button className="btn-outline" onClick={handleOpenSlideshow} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                Open Slideshow
              </button>
            </div>
          </div>

          {/* ─── Panel 3: Moderation ───────────────────────────────── */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Photo Moderation</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button
                onClick={handleModerationToggle}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: event.moderation_enabled ? 'var(--gold)' : 'var(--border)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  position: 'absolute', top: 3,
                  left: event.moderation_enabled ? 25 : 3,
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--charcoal)' }}>
                {event.moderation_enabled ? 'Moderation ON' : 'Moderation OFF'}
              </span>
            </div>
            {event.moderation_enabled ? (
              <ModerationQueue eventId={event.id} onUpdate={() => { loadPhotos(); loadStats(); }} />
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 300 }}>
                All photos and videos are published instantly
              </p>
            )}
          </div>

          {/* ─── Panel 4: Cover Photo ──────────────────────────────── */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Cover Photo</h3>
            {event.cover_photo_url && (
              <div style={{ marginBottom: 16, borderRadius: 4, overflow: 'hidden' }}>
                <img src={event.cover_photo_url} alt="Cover" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              </div>
            )}
            <input ref={coverRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
            <button className="btn-outline" onClick={() => coverRef.current?.click()} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem', width: '100%' }}>
              {event.cover_photo_url ? 'Change Cover Photo' : 'Upload Cover Photo'}
            </button>
          </div>
        </div>

        {/* ─── QR Poster — Premium ───────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 16 }}>QR Poster</h3>
          {isPremium ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Choose a design and generate a printable A4 poster with your event QR code
              </p>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { key: 'design1', name: 'Elegant & Warm' },
                  { key: 'design2', name: 'Clean & Modern' },
                  { key: 'design3', name: 'Minimal Table Card' },
                ].map((d) => (
                  <div
                    key={d.key}
                    onClick={() => setPosterDesign(d.key)}
                    style={{
                      flex: '1 1 120px',
                      padding: '14px 12px',
                      borderRadius: 6,
                      border: posterDesign === d.key ? '2px solid #c9a84c' : '1px solid var(--border)',
                      background: posterDesign === d.key ? 'rgba(201,168,76,0.06)' : 'var(--cream)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'border 0.15s, background 0.15s',
                    }}
                  >
                    <p style={{ fontSize: '0.82rem', fontWeight: posterDesign === d.key ? 600 : 400, color: posterDesign === d.key ? '#c9a84c' : 'var(--charcoal)' }}>
                      {d.name}
                    </p>
                  </div>
                ))}
              </div>
              <button className="btn-gold" onClick={handlePrintPoster} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}>
                Generate & Print Poster
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Choose a design and generate a printable A4 poster with your event QR code
              </p>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { key: 'design1', name: 'Elegant & Warm' },
                  { key: 'design2', name: 'Clean & Modern' },
                  { key: 'design3', name: 'Minimal Table Card' },
                ].map((d) => (
                  <div
                    key={d.key}
                    onClick={() => setPosterDesign(d.key)}
                    style={{
                      flex: '1 1 120px', padding: '14px 12px', borderRadius: 6,
                      border: posterDesign === d.key ? '2px solid #c9a84c' : '1px solid var(--border)',
                      background: posterDesign === d.key ? 'rgba(201,168,76,0.06)' : 'var(--cream)',
                      cursor: 'pointer', textAlign: 'center', transition: 'border 0.15s, background 0.15s',
                    }}
                  >
                    <p style={{ fontSize: '0.82rem', fontWeight: posterDesign === d.key ? 600 : 400, color: posterDesign === d.key ? '#c9a84c' : 'var(--charcoal)' }}>
                      {d.name}
                    </p>
                  </div>
                ))}
              </div>
              <button className="btn-gold" onClick={() => setUpgradeModal({ emoji: '🖨️', title: 'Print your event poster', subtitle: 'Generate a beautiful A4 QR poster to display at your venue — guests scan and upload instantly.' })} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}>
                Generate & Print Poster
              </button>
            </>
          )}
        </div>

        {/* ─── Photographer Access — Premium ─────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 16 }}>Photographer Access</h3>
          {isPremium ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12, fontWeight: 300 }}>
                Share this link with your photographer for bulk uploads (up to 50 files at once, auto-approved)
              </p>
              <div style={{ background: 'var(--cream)', borderRadius: 4, padding: '10px 14px', fontSize: '0.82rem', wordBreak: 'break-all', marginBottom: 12, color: 'var(--charcoal)' }}>
                {proUploadUrl}
              </div>
              <button className="btn-outline" onClick={() => { navigator.clipboard?.writeText(proUploadUrl); toast.show('Photographer link copied!'); }} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                Copy Photographer Link
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12, fontWeight: 300 }}>
                Share this link with your photographer for bulk uploads (up to 50 files at once, auto-approved)
              </p>
              <div style={{ background: 'var(--cream)', borderRadius: 4, padding: '10px 14px', fontSize: '0.82rem', wordBreak: 'break-all', marginBottom: 12, color: 'var(--muted)', filter: 'blur(4px)', userSelect: 'none' }}>
                https://eventsnapapp.live/#/upload/••••••••/pro
              </div>
              <button className="btn-outline" onClick={() => setUpgradeModal({ emoji: '📷', title: 'Give your photographer direct access', subtitle: 'Share a private upload link so your photographer can bulk upload up to 50 files at once, all auto-approved.' })} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                Copy Photographer Link
              </button>
            </>
          )}
        </div>

        {/* ─── Analytics ─────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Analytics</h3>

          {/* Basic stats — always shown */}
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--gold-dark)' }}>{totalCount}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>PHOTOS & VIDEOS</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--gold-dark)' }}>{guestCount}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>UNIQUE GUESTS</div>
            </div>
          </div>

          {/* Premium analytics */}
          {isPremium ? (
            <>
              {/* Last upload */}
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 20 }}>
                Last upload: <strong style={{ color: 'var(--charcoal)' }}>{lastUpload ? formatDateTime(lastUpload) : 'None yet'}</strong>
              </div>

              {/* Uploads per day chart */}
              {uploadsPerDay.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 12, color: 'var(--charcoal)' }}>Uploads Per Day</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={uploadsPerDay}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#c9a84c" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top uploaders */}
              {topUploaders.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 12, color: 'var(--charcoal)' }}>Top Uploaders</h4>
                  {topUploaders.slice(0, 10).map((u, i) => (
                    <div key={u.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--charcoal)' }}>{i + 1}. {u.name}</span>
                      <span style={{ color: 'var(--muted)' }}>{u.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap', filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--gold-dark)' }}>••</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>UPLOADS PER DAY</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--gold-dark)' }}>••</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>TOP UPLOADERS</div>
                </div>
              </div>
              <button className="btn-gold" onClick={() => setUpgradeModal({ emoji: '📊', title: 'Unlock your event analytics', subtitle: 'See uploads per day, top contributors, last upload time, and more.' })} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}>
                View Full Analytics
              </button>
            </>
          )}
        </div>

        {/* ─── Gallery Theme ─────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 8 }}>Gallery Theme</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 20 }}>Choose how the guest gallery looks.</p>
          {[
            { family: 'LUXE', themes: ['classic'] },
            { family: 'LIVE', themes: ['film'] },
          ].map((group) => (
            <div key={group.family} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                {group.family}
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {group.themes.map((th) => {
                  const current = validateTheme(event.theme);
                  const selected = current === th;
                  const isPremiumTheme = PREMIUM_THEMES.includes(th);
                  const locked = isPremiumTheme && !isPremium;
                  return (
                    <button
                      key={th}
                      disabled={locked}
                      onClick={async () => {
                        if (locked) return;
                        const next = validateTheme(th);
                        await updateEvent(eventCode, { theme: next });
                        await loadEvent();
                      }}
                      style={{
                        padding: '8px 18px',
                        borderRadius: 3,
                        fontSize: '0.78rem',
                        fontFamily: 'Jost, sans-serif',
                        cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.55 : 1,
                        border: selected ? '1px solid var(--gold)' : '1px solid var(--border)',
                        background: selected ? 'rgba(201,168,76,0.1)' : 'white',
                        color: selected ? 'var(--gold-dark)' : 'var(--charcoal)',
                        textTransform: 'capitalize',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {th}
                      {locked && (
                        <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>Premium</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Slideshow Settings — Premium ─────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 16 }}>Slideshow Settings</h3>
          {isPremium ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Brand Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="color"
                    value={event.brand_color || '#c9a84c'}
                    onChange={async (e) => {
                      await updateEvent(eventCode, { brand_color: e.target.value });
                      await loadEvent();
                    }}
                    style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: 2 }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--charcoal)' }}>{event.brand_color || '#c9a84c'}</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Transition Style</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['fade', 'slide', 'zoom'].map((t) => (
                    <button
                      key={t}
                      onClick={async () => {
                        await updateEvent(eventCode, { slideshow_transition: t });
                        await loadEvent();
                      }}
                      style={{
                        padding: '8px 18px',
                        borderRadius: 3,
                        fontSize: '0.78rem',
                        fontFamily: 'Jost, sans-serif',
                        cursor: 'pointer',
                        border: event.slideshow_transition === t || (!event.slideshow_transition && t === 'fade')
                          ? '1px solid var(--gold)'
                          : '1px solid var(--border)',
                        background: event.slideshow_transition === t || (!event.slideshow_transition && t === 'fade')
                          ? 'rgba(201,168,76,0.1)'
                          : 'white',
                        color: event.slideshow_transition === t || (!event.slideshow_transition && t === 'fade')
                          ? 'var(--gold-dark)'
                          : 'var(--charcoal)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select Photos for Slideshow */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Select Photos for Slideshow</label>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 12 }}>
                  {(() => {
                    const ids = pendingSlideshowIds !== null ? pendingSlideshowIds : (event.slideshow_photo_ids || []);
                    return ids.length > 0 ? `${ids.length} photo${ids.length !== 1 ? 's' : ''} selected — unsaved` : 'No selection — all photos will be shown';
                  })()}
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => setPendingSlideshowIds(photos.map((p) => p.id))}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: '0.72rem', fontFamily: 'Jost, sans-serif', cursor: 'pointer', border: '1px solid var(--border)', background: 'white', color: 'var(--charcoal)' }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setPendingSlideshowIds([])}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: '0.72rem', fontFamily: 'Jost, sans-serif', cursor: 'pointer', border: '1px solid var(--border)', background: 'white', color: 'var(--charcoal)' }}
                  >
                    Clear All
                  </button>
                  <button
                    onClick={async () => {
                      const toSave = pendingSlideshowIds !== null ? pendingSlideshowIds : (event.slideshow_photo_ids || []);
                      await fetch(`${API_BASE}/.netlify/functions/update-event-setting`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ eventCode, field: 'slideshow_photo_ids', value: toSave, accessToken: (await supabase.auth.getSession()).data.session?.access_token }),
                      });
                      await loadEvent();
                      setPendingSlideshowIds(null);
                      toast.show('Slideshow selection saved');
                    }}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: '0.72rem', fontFamily: 'Jost, sans-serif', cursor: 'pointer', border: '1px solid var(--gold)', background: 'rgba(201,168,76,0.1)', color: 'var(--gold-dark)', fontWeight: 500 }}
                  >
                    Save Selection
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
                  {photos.map((p) => {
                    const selected = (pendingSlideshowIds !== null ? pendingSlideshowIds : (event.slideshow_photo_ids || [])).includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          const current = pendingSlideshowIds !== null ? pendingSlideshowIds : (event.slideshow_photo_ids || []);
                          const updated = selected ? current.filter((id) => id !== p.id) : [...current, p.id];
                          setPendingSlideshowIds(updated);
                        }}
                        style={{
                          position: 'relative',
                          width: '100%',
                          paddingBottom: '100%',
                          borderRadius: 4,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: selected ? '2px solid var(--gold)' : '2px solid transparent',
                        }}
                      >
                        <img
                          src={p.image_url}
                          alt=""
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {selected && (
                          <div style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: 'var(--gold)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            color: 'white',
                          }}>
                            ✓
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button className="btn-outline" onClick={handleOpenSlideshow} style={{ padding: '11px 16px', borderRadius: 3, fontSize: '0.78rem' }}>
                Open Slideshow
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['Fade', 'Slide', 'Zoom'].map((t) => (
                  <div key={t} style={{ padding: '8px 18px', borderRadius: 3, fontSize: '0.78rem', border: t === 'Fade' ? '1px solid var(--gold)' : '1px solid var(--border)', background: t === 'Fade' ? 'rgba(201,168,76,0.1)' : 'white', color: t === 'Fade' ? 'var(--gold-dark)' : 'var(--charcoal)', fontFamily: 'Jost, sans-serif' }}>{t}</div>
                ))}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Customise transitions, brand colour, and choose exactly which photos appear in your slideshow.
              </p>
              <button className="btn-gold" onClick={() => setUpgradeModal({ emoji: '🎞️', title: 'Customise your slideshow', subtitle: 'Set your brand colour, choose a transition style, and hand-pick exactly which photos play.' })} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}>
                Unlock Slideshow Settings
              </button>
            </>
          )}
        </div>

        {/* ─── Reels — Premium ────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 16 }}>Reels</h3>
          {isPremium ? (
            <div>
              {/* Existing reels list */}
              {reels.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  {reels.map((r) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--charcoal)' }}>{r.title}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{(r.photo_ids || []).length} item{(r.photo_ids || []).length !== 1 ? 's' : ''}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-outline"
                          onClick={() => window.open(`/#/reel/${event.id}/${r.id}`, '_blank')}
                          style={{ padding: '6px 12px', borderRadius: 3, fontSize: '0.72rem' }}
                        >
                          View
                        </button>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setActiveReelId(r.id);
                            setReelTitle(r.title);
                            setReelPhotoIds(r.photo_ids || []);
                            setShowReelBuilder(true);
                          }}
                          style={{ padding: '6px 12px', borderRadius: 3, fontSize: '0.72rem' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm('Delete this reel?')) return;
                            const { data: { session: reelDelSession } } = await supabase.auth.getSession();
                            await fetch(`${API_BASE}/.netlify/functions/manage-reel`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${reelDelSession?.access_token}` },
                              body: JSON.stringify({ action: 'delete', eventCode: event.id, reelId: r.id }),
                            });
                            await loadReels();
                            toast.show('Reel deleted');
                          }}
                          style={{ padding: '6px 12px', borderRadius: 3, fontSize: '0.72rem', background: 'none', border: '1px solid rgba(229,62,62,0.3)', color: '#c53030', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create new reel button */}
              {!showReelBuilder && (
                <button
                  className="btn-gold"
                  onClick={() => {
                    setActiveReelId(null);
                    setReelTitle('');
                    setReelPhotoIds([]);
                    setShowReelBuilder(true);
                  }}
                  style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}
                >
                  + Create New Reel
                </button>
              )}

              {/* Reel builder */}
              {showReelBuilder && (
                <div style={{ marginTop: 16, padding: 20, background: 'var(--cream)', borderRadius: 6 }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 500, marginBottom: 12, color: 'var(--charcoal)' }}>
                    {activeReelId ? 'Edit Reel' : 'New Reel'}
                  </h4>
                  <input
                    type="text"
                    value={reelTitle}
                    onChange={(e) => setReelTitle(e.target.value)}
                    placeholder="Reel title e.g. Best Moments"
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '10px 14px', fontSize: '0.88rem', marginBottom: 12, background: 'white', color: 'var(--charcoal)', fontFamily: 'Jost, sans-serif' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 10 }}>
                    {reelPhotoIds.length > 0 ? `${reelPhotoIds.length} item${reelPhotoIds.length !== 1 ? 's' : ''} selected` : 'No items selected — tap to select'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setReelPhotoIds([])} style={{ padding: '5px 12px', borderRadius: 3, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}>Clear</button>
                  </div>
                  <ReelPhotoGrid
                    photos={photos}
                    reelPhotoIds={reelPhotoIds}
                    onToggle={handleReelToggle}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn-gold"
                      disabled={reelSaving}
                      onClick={async () => {
                        if (!reelTitle.trim() && reelPhotoIds.length === 0) {
                          toast.show('Please add a title and select at least one photo');
                          return;
                        }
                        if (!reelTitle.trim()) {
                          toast.show('Please add a reel title');
                          return;
                        }
                        if (reelPhotoIds.length === 0) {
                          toast.show('Please select at least one photo or video');
                          return;
                        }
                        setReelSaving(true);
                        const body = activeReelId
                          ? { action: 'update', eventCode: event.id, reelId: activeReelId, title: reelTitle, photoIds: reelPhotoIds }
                          : { action: 'create', eventCode: event.id, title: reelTitle, photoIds: reelPhotoIds };
                        const { data: { session: reelSaveSession } } = await supabase.auth.getSession();
                        await fetch(`${API_BASE}/.netlify/functions/manage-reel`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${reelSaveSession?.access_token}` },
                          body: JSON.stringify(body),
                        });
                        await loadReels();
                        setReelSaving(false);
                        setShowReelBuilder(false);
                        setActiveReelId(null);
                        setReelTitle('');
                        setReelPhotoIds([]);
                        toast.show(activeReelId ? 'Reel updated' : 'Reel created');
                      }}
                      style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}
                    >
                      {reelSaving ? 'Saving...' : activeReelId ? 'Save Changes' : 'Create Reel'}
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => { setShowReelBuilder(false); setActiveReelId(null); setReelTitle(''); setReelPhotoIds([]); }}
                      style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {!showReelBuilder && (
                <button
                  className="btn-gold"
                  onClick={() => {
                    setActiveReelId(null);
                    setReelTitle('');
                    setReelPhotoIds([]);
                    setShowReelBuilder(true);
                  }}
                  style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}
                >
                  + Create New Reel
                </button>
              )}
              {showReelBuilder && (
                <div style={{ marginTop: 16, padding: 20, background: 'var(--cream)', borderRadius: 6 }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 500, marginBottom: 12, color: 'var(--charcoal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    New Reel
                    <span style={{ fontSize: '0.68rem', background: 'rgba(201,168,76,0.15)', color: 'var(--gold-dark)', padding: '2px 8px', borderRadius: 100, fontWeight: 500 }}>Premium</span>
                  </h4>
                  <input
                    type="text"
                    value={reelTitle}
                    onChange={(e) => setReelTitle(e.target.value)}
                    placeholder="Reel title e.g. Best Moments"
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '10px 14px', fontSize: '0.88rem', marginBottom: 12, background: 'white', color: 'var(--charcoal)', fontFamily: 'Jost, sans-serif' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 10 }}>
                    {reelPhotoIds.length > 0 ? `${reelPhotoIds.length} item${reelPhotoIds.length !== 1 ? 's' : ''} selected` : 'No items selected — tap to select'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setReelPhotoIds([])} style={{ padding: '5px 12px', borderRadius: 3, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}>Clear</button>
                  </div>
                  <ReelPhotoGrid photos={photos} reelPhotoIds={reelPhotoIds} onToggle={handleReelToggle} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn-gold"
                      onClick={() => setUpgradeModal({ emoji: '🎬', title: 'Create your event highlight reel', subtitle: 'Your selected photos are ready — generate your reel in seconds.' })}
                      style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}
                    >
                      Create Reel
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => { setShowReelBuilder(false); setReelTitle(''); setReelPhotoIds([]); }}
                      style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Face Tagging — Premium ─────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24 }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 16 }}>Face Tagging</h3>
          {isPremium ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button
                  onClick={async () => {
                    await fetch(`${API_BASE}/.netlify/functions/update-event-setting`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ eventCode, field: 'face_tagging_enabled', value: !event.face_tagging_enabled, accessToken: (await supabase.auth.getSession()).data.session?.access_token }),
                    });
                    await loadEvent();
                  }}
                  style={{
                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: event.face_tagging_enabled ? 'var(--gold)' : 'var(--border)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: 'white',
                    position: 'absolute', top: 3,
                    left: event.face_tagging_enabled ? 25 : 3,
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--charcoal)' }}>
                  {event.face_tagging_enabled ? 'Face Tagging ON' : 'Face Tagging OFF'}
                </span>
              </div>
              {event.face_tagging_enabled && (
                <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 4, padding: '12px 16px', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                  Enabling face tagging means guests can find photos of themselves. All guests must opt in — their consent is recorded.
                </div>
              )}
              {!event.face_tagging_enabled && (
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 300 }}>
                  When enabled, guests can take a selfie to find all photos that include them.
                </p>
              )}
              <button
                disabled={reindexLoading}
                onClick={async () => {
                  setReindexLoading(true);
                  setReindexMsg('');
                  try {
                    const { data: unindexed } = await supabase
                      .from('photos')
                      .select('id, image_url')
                      .eq('event_id', eventCode)
                      .is('face_vectors', null);
                    if (!unindexed || unindexed.length === 0) {
                      setReindexMsg('All photos are already indexed.');
                      setReindexLoading(false);
                      return;
                    }
                    let done = 0;
                    for (const photo of unindexed) {
                      try {
                        await fetch(`${API_BASE}/.netlify/functions/process-photo-faces`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ photoId: photo.id, photoUrl: photo.image_url, eventId: eventCode }),
                        });
                        done++;
                        setReindexMsg(`Indexing... ${done} of ${unindexed.length}`);
                      } catch { /* skip failed photo */ }
                    }
                    setReindexMsg(`Done — ${done} photo${done !== 1 ? 's' : ''} indexed.`);
                  } catch {
                    setReindexMsg('Something went wrong. Please try again.');
                  }
                  setReindexLoading(false);
                }}
                style={{ marginTop: 16, background: 'none', border: '1px solid rgba(201,168,76,0.4)', color: 'var(--gold-dark)', padding: '8px 16px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}
              >
                {reindexLoading ? reindexMsg || 'Indexing...' : 'Re-index All Photos'}
              </button>
              {reindexMsg && !reindexLoading && (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 10 }}>{reindexMsg}</p>
              )}
              <button
                disabled={faceDeleteLoading}
                onClick={async () => {
                  if (!window.confirm('Delete all face data for this event? This cannot be undone.')) return;
                  setFaceDeleteLoading(true);
                  setFaceDeleteMsg('');
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${API_BASE}/.netlify/functions/delete-face-data`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ eventCode, accessToken: session?.access_token }),
                    });
                    const result = await res.json();
                    if (res.ok) {
                      setFaceDeleteMsg(`Deleted ${result.consents} consent(s) and ${result.files} file(s).`);
                    } else {
                      setFaceDeleteMsg(result.error || 'Something went wrong.');
                    }
                  } catch {
                    setFaceDeleteMsg('Something went wrong. Please try again.');
                  }
                  setFaceDeleteLoading(false);
                }}
                style={{ marginTop: 16, background: 'none', border: '1px solid rgba(229,62,62,0.3)', color: '#c53030', padding: '8px 16px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}
              >
                {faceDeleteLoading ? 'Deleting...' : 'Delete All Face Data'}
              </button>
              {faceDeleteMsg && (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 10 }}>{faceDeleteMsg}</p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Guests take a selfie and instantly find every photo that includes them.
              </p>
              <button className="btn-gold" onClick={() => setUpgradeModal({ emoji: '🤳', title: 'Let guests find themselves', subtitle: 'Enable face tagging so every guest can take a selfie and instantly see all their photos from the event.' })} style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.78rem' }}>
                Enable Face Tagging
              </button>
            </>
          )}
        </div>

        {/* ─── Nudge Section ─────────────────────────────────────────── */}
        <div style={{
          background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)', marginTop: 24,
          opacity: isDisabled ? 0.5 : 1, pointerEvents: isDisabled ? 'none' : 'auto',
        }}>
          <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 8 }}>Send Nudge</h3>

          {isDisabled ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Event has ended — nudges disabled</p>
          ) : isPremium ? (
            <>
              {/* Milestone nudge */}
              {milestone && (
                <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '14px 18px', marginBottom: 16 }}>
                  <p style={{ fontSize: '0.88rem', color: 'var(--charcoal)', marginBottom: 10, fontWeight: 500 }}>
                    {milestone.msg}
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-outline" onClick={() => handleNudgeCopy(nudgeMessage)} style={{ padding: '8px 16px', borderRadius: 3, fontSize: '0.72rem' }}>
                      {nudgeCopyLabel}
                    </button>
                    <button className="btn-gold" onClick={() => handleNudgeWhatsApp(nudgeMessage)} style={{ padding: '8px 16px', borderRadius: 3, fontSize: '0.72rem' }}>
                      WhatsApp
                    </button>
                    <a href={`sms:?&body=${encodeURIComponent(nudgeMessage)}`} className="btn-outline" style={{ padding: '8px 16px', borderRadius: 3, fontSize: '0.72rem', textDecoration: 'none', textAlign: 'center' }}>
                      SMS
                    </a>
                  </div>
                </div>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Remind guests to upload their photos and videos
              </p>
              <div style={{ background: 'var(--cream)', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--charcoal)' }}>
                {nudgeMessage}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-outline" onClick={() => handleNudgeCopy()} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                  {nudgeCopyLabel}
                </button>
                <button className="btn-gold" onClick={() => handleNudgeWhatsApp()} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                  Share via WhatsApp
                </button>
                <a href={`sms:?&body=${encodeURIComponent(nudgeMessage)}`} className="btn-outline" style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem', textDecoration: 'none', textAlign: 'center' }}>
                  Share via SMS
                </a>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, fontWeight: 300 }}>
                Remind guests to upload their photos and videos
              </p>
              <div style={{ background: 'var(--cream)', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--charcoal)' }}>
                {nudgeMessage}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-outline" onClick={() => handleNudgeCopy()} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                  {nudgeCopyLabel}
                </button>
                <button className="btn-gold" onClick={() => handleNudgeWhatsApp()} style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem' }}>
                  Share via WhatsApp
                </button>
                <a href={`sms:?&body=${encodeURIComponent(nudgeMessage)}`} className="btn-outline" style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem', textDecoration: 'none', textAlign: 'center' }}>
                  Share via SMS
                </a>
              </div>
            </>
          )}
        </div>

        {/* ─── Gallery Section ───────────────────────────────────────── */}
        <div style={{ marginTop: 40 }}>
          <div className="divider" style={{ marginBottom: 28 }}>
            {photos.length > 0 ? `${photos.length} Approved Photo${photos.length !== 1 ? 's' : ''} and Video${photos.length !== 1 ? 's' : ''}` : 'Gallery'}
          </div>
          {photos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '4rem', marginBottom: 16, opacity: 0.3 }}>📸</div>
              <h3 className="serif" style={{ fontSize: '1.6rem', fontWeight: 300, color: 'var(--muted)' }}>No photos yet</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 8 }}>Share your QR code with guests to start collecting</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {photos.map((photo) => (
                <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 4, overflow: 'hidden', background: '#000' }}>
                  {photo.media_type === 'video' ? (
                    <video src={photo.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' }} onClick={() => setLightbox(photo)} />
                  ) : (
                    <img src={photo.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' }} onClick={() => setLightbox(photo)} />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                      width: 28, height: 28, cursor: 'pointer', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR Code section */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div className="divider" style={{ marginBottom: 28 }}>QR Code</div>
          <div style={{ display: 'inline-block', padding: 32, background: 'white', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
            <QRCode value={qrUrl} size={280} />
            <p style={{ fontSize: '0.92rem', fontFamily: 'Cormorant Garamond, serif', letterSpacing: '0.25em', color: 'var(--charcoal)', marginTop: 16, fontWeight: 400 }}>{event.id}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>Scan to join · eventsnapapp.live</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn-outline" onClick={handleCopyLink} style={{ padding: '8px 18px', borderRadius: 3, fontSize: '0.72rem' }}>
                Copy Join Link
              </button>
              <button className="btn-gold" onClick={handleOpenSlideshow} style={{ padding: '8px 18px', borderRadius: 3, fontSize: '0.72rem' }}>
                Open Slideshow
              </button>
            </div>
          </div>
        </div>
      </div>

      <Lightbox item={lightbox} eventName={event.title} onClose={() => setLightbox(null)} />
    </div>
  );
};

export default HostDashboard;
