import React, { useState, useEffect, useCallback } from 'react';
import { supabase, getPhotos } from '../store.js';
import { API_BASE } from '../config.js';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const PhotographerDashboard = ({ onNavigate, toast }) => {
  const [proAuth, setProAuth] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('proAuth') || 'null');
      if (stored && stored.expiresAt && Date.now() > stored.expiresAt) {
        localStorage.removeItem('proAuth');
        return null;
      }
      return stored;
    } catch { return null; }
  });
  const [account, setAccount] = useState(null);
  const [events, setEvents] = useState([]);
  const [photoCounts, setPhotoCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscribedBanner, setSubscribedBanner] = useState(false);

  // Check subscription and load data
  const loadAccount = useCallback(async () => {
    if (!proAuth?.id) return;

    const { data, error } = await supabase
      .from('photographer_accounts')
      .select('id, email, display_name, stripe_customer_id, stripe_subscription_id, subscription_status, created_at')
      .eq('id', proAuth.id)
      .single();

    if (error || !data) {
      localStorage.removeItem('proAuth');
      onNavigate('proLogin');
      return;
    }

    setAccount(data);

    // Update localStorage with fresh subscription status
    const updatedAuth = {
      ...proAuth,
      subscriptionStatus: data.subscription_status,
      stripeCustomerId: data.stripe_customer_id,
    };
    localStorage.setItem('proAuth', JSON.stringify(updatedAuth));
    setProAuth(updatedAuth);

    if (data.subscription_status !== 'active') {
      onNavigate('proSignup');
      return;
    }

    // Load events
    const { data: eventData } = await supabase
      .from('events_public')
      .select('id, title, subtitle, date, host, plan, created_at, event_slug, cover_photo_url, status, max_photos, max_guests, expires_at, brand_color, slideshow_transition, face_tagging_enabled, highlight_reel_url, photographer_id, moderation_enabled')
      .eq('photographer_id', proAuth.id)
      .order('created_at', { ascending: false });

    setEvents(eventData || []);

    // Load photo counts
    const counts = {};
    for (const evt of (eventData || [])) {
      const { data: photos } = await getPhotos(evt.id);
      counts[evt.id] = photos?.length || 0;
    }
    setPhotoCounts(counts);

    setLoading(false);
  }, [proAuth?.id, onNavigate]);

  useEffect(() => {
    if (!proAuth) {
      onNavigate('proLogin');
      return;
    }
    loadAccount();
  }, [proAuth, loadAccount, onNavigate]);

  // Check for subscribed=true param
  useEffect(() => {
    if (window.location.hash.includes('subscribed=true')) {
      setSubscribedBanner(true);
      window.location.hash = window.location.hash.replace('?subscribed=true', '');
      setTimeout(() => setSubscribedBanner(false), 5000);
      loadAccount();
    }
  }, [loadAccount]);

  const handleManageSubscription = async () => {
    if (!proAuth?.stripeCustomerId) return;
    setPortalLoading(true);
    try {
      const response = await fetch(`${API_BASE}/.netlify/functions/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeCustomerId: proAuth.stripeCustomerId }),
      });
      const { url } = await response.json();
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('proAuth');
    onNavigate('proLogin');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      {/* Subscribed banner */}
      {subscribedBanner && (
        <div style={{ background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: 'white', padding: '14px 24px', textAlign: 'center', fontSize: '0.92rem', fontWeight: 500 }}>
          Welcome to Photographer Pro! Your subscription is active.
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'var(--charcoal)', padding: '48px 32px 40px', color: 'white' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold-light)', marginBottom: 12 }}>📷 Photographer Pro</span>
              <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 300, lineHeight: 1.2 }}>
                {proAuth?.displayName || 'Dashboard'}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 6, fontSize: '0.88rem' }}>{proAuth?.email}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => { window.location.hash = '#/'; }}
                aria-label="Home"
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', padding: '8px 20px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}
              >
                ← Home
              </button>
              <button
                onClick={handleSignOut}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', padding: '8px 20px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>

          {/* Account Panel */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Account</h3>
            <div style={{ fontSize: '0.85rem', lineHeight: 2.2, marginBottom: 20 }}>
              <div><span style={{ color: 'var(--muted)' }}>Name:</span> <strong>{proAuth?.displayName}</strong></div>
              <div><span style={{ color: 'var(--muted)' }}>Email:</span> {proAuth?.email}</div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Subscription:</span>{' '}
                <span className="badge" style={{
                  background: account?.subscription_status === 'active' ? 'rgba(72,187,120,0.12)' : 'rgba(229,62,62,0.1)',
                  color: account?.subscription_status === 'active' ? '#276749' : '#c53030',
                }}>
                  {account?.subscription_status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <button
              className="btn-outline"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              style={{ padding: '10px 20px', borderRadius: 3, fontSize: '0.78rem', width: '100%' }}
            >
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </button>
          </div>

          {/* Quick Access Panel */}
          <div style={{ background: 'white', borderRadius: 6, padding: 28, boxShadow: 'var(--shadow)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 20 }}>Quick Access</h3>
            {events.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 300 }}>No events yet. Create one below.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {events.slice(0, 5).map((evt) => (
                  <div key={evt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--charcoal)' }}>{evt.title}</span>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/#/upload/${evt.id}/pro`;
                        navigator.clipboard?.writeText(url).catch(() => {});
                        toast?.show('Photographer link copied!');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontSize: '0.75rem', fontWeight: 500, fontFamily: 'Jost, sans-serif' }}
                    >
                      Copy Link
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* My Events */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 className="serif" style={{ fontSize: '1.5rem', fontWeight: 400 }}>My Events</h3>
            <button
              className="btn-gold"
              onClick={() => onNavigate('create')}
              style={{ padding: '10px 24px', borderRadius: 3, fontSize: '0.75rem' }}
            >
              Create New Event
            </button>
          </div>

          {events.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 6, padding: '60px 32px', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.3 }}>📸</div>
              <p className="serif" style={{ fontSize: '1.3rem', fontWeight: 300, color: 'var(--muted)' }}>No events yet</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 8 }}>Create your first event to get started</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {events.map((evt) => {
                const isEnded = evt.status === 'ended';
                const isExpired = evt.expires_at && new Date(evt.expires_at) < new Date();
                return (
                  <div key={evt.id} style={{ background: 'white', borderRadius: 6, padding: 24, boxShadow: 'var(--shadow)' }}>
                    {evt.cover_photo_url && (
                      <div style={{ borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                        <img src={evt.cover_photo_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                      </div>
                    )}
                    <h4 className="serif" style={{ fontSize: '1.2rem', fontWeight: 400, marginBottom: 6 }}>{evt.title}</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 12 }}>{formatDate(evt.date)}</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <span className="badge" style={{
                        background: isEnded ? 'rgba(229,62,62,0.1)' : isExpired ? 'rgba(160,160,160,0.15)' : 'rgba(72,187,120,0.12)',
                        color: isEnded ? '#c53030' : isExpired ? '#666' : '#276749',
                      }}>
                        {isEnded ? 'Ended' : isExpired ? 'Expired' : 'Active'}
                      </span>
                      <span className="badge badge-gold">{photoCounts[evt.id] || 0} photos</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn-outline"
                        onClick={() => onNavigate('event', { identifier: evt.event_slug || evt.id })}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 3, fontSize: '0.72rem' }}
                      >
                        View Gallery
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => onNavigate('host', { eventCode: evt.id })}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 3, fontSize: '0.72rem' }}
                      >
                        Host Dashboard
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotographerDashboard;
