import React from 'react';

const Home = ({ onNavigate }) => {
  return (
    <div data-theme="neutral">
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #F5EFE7)',
      color: 'var(--charcoal, #2c2c2c)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 24px 80px',
      fontFamily: 'Jost, sans-serif',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 48, animation: 'fadeUp 0.6s ease' }}>
        <h1 className="serif" style={{ fontSize: 'clamp(2.4rem, 6vw, 3.6rem)', fontWeight: 300, letterSpacing: '0.02em', marginBottom: 10 }}>
          EventSnap
        </h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', letterSpacing: '0.32em', fontWeight: 500 }}>
          <span style={{ color: '#FF5A1F' }}>LIVE</span>
          <span style={{ color: 'var(--muted, #7a7065)', fontSize: '0.7rem', letterSpacing: '0.1em' }}>or</span>
          <span style={{ color: '#c9a84c' }}>LUXE</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 560, marginBottom: 36, animation: 'fadeUp 0.6s 0.1s ease both' }}>
        <h2 className="serif" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 300, lineHeight: 1.2, marginBottom: 14, color: 'var(--charcoal, #2c2c2c)' }}>
          Collect every photo from your event.
        </h2>
        <p style={{ fontSize: '1rem', color: 'var(--muted, #7a7065)', lineHeight: 1.5 }}>
          One gallery, every guest, zero group-chat chaos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56, animation: 'fadeUp 0.6s 0.2s ease both' }}>
        <button
          onClick={() => onNavigate('create')}
          style={{
            background: 'var(--gold, #FF5A1F)',
            color: 'white',
            border: 'none',
            padding: '14px 28px',
            borderRadius: 3,
            fontFamily: 'Jost, sans-serif',
            fontSize: '0.78rem',
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Create an event
        </button>
        <button
          onClick={() => onNavigate('join')}
          style={{
            background: 'transparent',
            color: 'var(--charcoal, #2c2c2c)',
            border: '1px solid var(--border, rgba(44,44,44,0.25))',
            padding: '14px 28px',
            borderRadius: 3,
            fontFamily: 'Jost, sans-serif',
            fontSize: '0.78rem',
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Join with a code
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 760, width: '100%', animation: 'fadeUp 0.6s 0.3s ease both' }}>
        <button
          onClick={() => onNavigate('create')}
          style={{
            background: '#faf7f2',
            border: '1px solid #e8e0d0',
            borderRadius: 8,
            padding: '32px 28px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'Jost, sans-serif',
          }}
        >
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.32em', color: '#c9a84c', marginBottom: 10, fontWeight: 500 }}>LUXE</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.8rem', fontWeight: 300, color: '#2c2c2c', marginBottom: 8 }}>Classic</div>
          <p style={{ fontSize: '0.88rem', color: '#7a7065', lineHeight: 1.5, marginBottom: 16 }}>Editorial, golden-hour. Made for weddings and dinner parties.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#faf7f2', border: '1px solid #e8e0d0' }} />
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#c9a84c' }} />
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#2c2c2c' }} />
          </div>
        </button>

        <button
          onClick={() => onNavigate('create')}
          style={{
            background: '#1a1a1a',
            border: '1px solid #1a1a1a',
            borderRadius: 8,
            padding: '32px 28px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'Jost, sans-serif',
          }}
        >
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.32em', color: '#FF5A1F', marginBottom: 10, fontWeight: 500 }}>LIVE</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.8rem', color: '#FFF7EC', marginBottom: 8, letterSpacing: '-0.01em' }}>Film</div>
          <p style={{ fontSize: '0.88rem', color: 'rgba(255,247,236,0.65)', lineHeight: 1.5, marginBottom: 16 }}>Grainy, off-the-cuff. Made for nights out and birthdays.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#FFF7EC' }} />
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#FF5A1F' }} />
            <span style={{ width: 22, height: 22, borderRadius: 3, background: '#1a1a1a', border: '1px solid rgba(255,247,236,0.2)' }} />
          </div>
        </button>
      </div>
    </div>
    </div>
  );
};

export default Home;
