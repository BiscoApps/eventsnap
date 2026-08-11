import React, { useState } from 'react';

const NamePrompt = ({ eventName, onJoin }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name');
      return;
    }
    localStorage.setItem('guestName', trimmed);
    onJoin(trimmed);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cream)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <button
        onClick={() => {
          if (window.history.length > 1) window.history.back();
          else window.location.hash = '#/';
        }}
        aria-label="Back"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          minWidth: 44,
          minHeight: 44,
          padding: '0 18px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 22,
          color: 'var(--charcoal)',
          fontSize: '0.85rem',
          fontFamily: "'Jost', sans-serif",
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}
      >
        ← Back
      </button>
      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✦</div>
          <h2 className="serif" style={{ fontSize: '2.4rem', fontWeight: 300, marginBottom: 8 }}>{eventName}</h2>
          <p style={{ color: 'var(--muted)', fontWeight: 300, fontSize: '0.9rem' }}>Welcome! Let everyone know who you are.</p>
        </div>
        <div style={{ background: 'white', borderRadius: 6, padding: 36, boxShadow: 'var(--shadow)' }}>
          <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>What's your name?</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Emma & Tom"
            style={{
              width: '100%',
              border: `1px solid ${error ? '#e53e3e' : 'var(--border)'}`,
              borderRadius: 3,
              padding: '13px 16px',
              fontSize: '0.95rem',
              background: 'var(--cream)',
              marginBottom: error ? 4 : 20,
            }}
          />
          {error && <p style={{ color: '#e53e3e', fontSize: '0.78rem', marginBottom: 16 }}>{error}</p>}
          <button className="btn-gold" onClick={handleSubmit} style={{ width: '100%', padding: '14px', borderRadius: 3 }}>
            Join Event
          </button>
        </div>
      </div>
    </div>
  );
};

export default NamePrompt;
