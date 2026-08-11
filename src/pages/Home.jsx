import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../store.js';
import { API_BASE } from '../config.js';

const Home = ({ onNavigate }) => {
  const { user, signOut } = useAuth();
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountMsg, setDeleteAccountMsg] = useState('');

  const handleDeleteAccount = async () => {
    if (deleteAccountLoading) return;
    setDeleteAccountLoading(true);
    setDeleteAccountMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/.netlify/functions/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: session?.access_token, confirm: true }),
      });
      const result = await res.json();
      if (res.ok && result.deleted) {
        // The user no longer exists, so signOut() can reject — swallow it and
        // hard-reload so no stale session survives in memory.
        try { await signOut(); } catch (e) { console.warn('signOut failed post-deletion:', e); }
        localStorage.removeItem('proAuth');
        window.location.hash = '/';
        window.location.reload();
        return;
      }
      setDeleteAccountMsg(result.error || 'Something went wrong.');
      setDeleteAccountLoading(false);
    } catch {
      setDeleteAccountMsg('Something went wrong. Please try again.');
      setDeleteAccountLoading(false);
    }
  };

  return (
    <div data-theme="neutral">
    <div style={{
      minHeight: '100vh',
      background: 'var(--cream, #FDFAF2)',
      color: 'var(--charcoal, #3A2800)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 24px 80px',
      fontFamily: "'Courier Prime', monospace",
    }}>
      <div style={{ textAlign: 'center', marginBottom: 48, animation: 'fadeUp 0.6s ease' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          {[['E', false], ['V', false], ['E', false], ['N', false], ['T', false], ['S', true], ['N', true], ['A', true], ['P', true]].map(([ch, accent], i) => (
            <div key={i} style={{
              width: 36, height: 36,
              background: accent ? '#B8860B' : '#3A2800',
              border: `2px solid ${accent ? '#8A6000' : '#1A1200'}`,
              boxShadow: '2px 2px 0 #1A1200',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Press Start 2P', monospace", fontSize: 12,
              color: '#FDFAF2', marginRight: 4,
            }}>{ch}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', letterSpacing: '0.32em', fontWeight: 500 }}>
          <span style={{ color: '#FF5A1F' }}>LIVE</span>
          <span style={{ color: 'var(--muted, #7a7065)', fontSize: '0.7rem', letterSpacing: '0.1em' }}>or</span>
          <span style={{ color: '#B8860B' }}>LUXE</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 560, marginBottom: 36, animation: 'fadeUp 0.6s 0.1s ease both' }}>
        <h2 className="serif" style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 400, lineHeight: 1.8, marginBottom: 14, color: '#3A2800' }}>
          Collect every photo from your event.
        </h2>
        <p style={{ fontSize: '1rem', color: 'var(--muted, #8A6800)', lineHeight: 1.5 }}>
          One gallery, every guest, zero group-chat chaos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56, animation: 'fadeUp 0.6s 0.2s ease both' }}>
        <button className="btn-gold" onClick={() => onNavigate('create')} style={{ padding: '14px 28px', borderRadius: 0 }}>
          Create an event
        </button>
        <button className="btn-outline" onClick={() => onNavigate('join')} style={{ padding: '14px 28px', borderRadius: 0 }}>
          Join with a code
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 760, width: '100%', animation: 'fadeUp 0.6s 0.3s ease both' }}>
        <button
          onClick={() => onNavigate('create')}
          style={{
            background: '#F8F0D8',
            border: '2px solid #E8D080',
            borderRadius: 0,
            boxShadow: '3px 3px 0 #C8A830',
            padding: '32px 28px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: "'Courier Prime', monospace",
          }}
        >
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.32em', color: '#B8860B', marginBottom: 10, fontWeight: 500 }}>LUXE</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.8rem', fontWeight: 300, color: '#3A2800', marginBottom: 8 }}>Classic</div>
          <p style={{ fontSize: '0.88rem', color: '#8A6800', lineHeight: 1.5, marginBottom: 16 }}>Editorial, golden-hour. Made for weddings and dinner parties.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#F8F0D8', border: '1px solid #E8D080' }} />
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#B8860B' }} />
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#3A2800' }} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('create')}
          style={{
            background: '#1a1a1a',
            border: '2px solid #1A1200',
            borderRadius: 0,
            boxShadow: '3px 3px 0 #5A4000',
            padding: '32px 28px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: "'Courier Prime', monospace",
          }}
        >
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.32em', color: '#FF5A1F', marginBottom: 10, fontWeight: 500 }}>LIVE</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.8rem', color: '#FFF7EC', marginBottom: 8, letterSpacing: '-0.01em' }}>Film</div>
          <p style={{ fontSize: '0.88rem', color: 'rgba(255,247,236,0.65)', lineHeight: 1.5, marginBottom: 16 }}>Grainy, off-the-cuff. Made for nights out and birthdays.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#FFF7EC' }} />
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#FF5A1F' }} />
            <span style={{ width: 22, height: 22, borderRadius: 0, background: '#1a1a1a', border: '1px solid rgba(255,247,236,0.2)' }} />
          </div>
        </button>
      </div>

      {user && (
        <div style={{ marginTop: 56, textAlign: 'center', animation: 'fadeUp 0.6s 0.4s ease both' }}>
          <button
            disabled={deleteAccountLoading}
            onClick={() => { setDeleteAccountMsg(''); setDeleteAccountModal(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c53030', fontSize: '0.78rem', fontFamily: "'Courier Prime', monospace", textDecoration: 'underline' }}
          >
            {deleteAccountLoading ? 'Deleting account...' : 'Delete my account'}
          </button>
          {deleteAccountMsg && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted, #8A6800)', marginTop: 10 }}>{deleteAccountMsg}</p>
          )}
        </div>
      )}

      {deleteAccountModal && (
        <div className="modal-bg" onClick={() => { if (!deleteAccountLoading) setDeleteAccountModal(false); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FDFAF2', border: '2px solid #E8D080', boxShadow: '3px 3px 0 #C8A830', padding: 28, maxWidth: 420, width: 'calc(100% - 48px)' }}>
            <h3 className="serif" style={{ fontSize: '1.3rem', fontWeight: 400, marginBottom: 12 }}>Delete account?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted, #8A6800)', lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently delete your account and all events, photos, and reels. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteAccountModal(false)} style={{ background: 'none', border: '1px solid var(--border, #E8D080)', color: 'var(--charcoal, #3A2800)', padding: '8px 16px', borderRadius: 0, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}>
                Cancel
              </button>
              <button onClick={() => { setDeleteAccountModal(false); handleDeleteAccount(); }} style={{ background: '#c53030', border: '1px solid #c53030', color: 'white', padding: '8px 16px', borderRadius: 0, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Jost, sans-serif' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default Home;
