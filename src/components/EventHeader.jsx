import React from 'react';

const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const EventHeader = ({ event, photoCount = 0 }) => {
  const isFilm = event.theme === 'film';
  return (
    <>
      {event.cover_photo_url && (
        <div style={{
          width: '100%',
          height: 240,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <img
            src={event.cover_photo_url}
            alt="Event cover"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.7))',
          }} />
        </div>
      )}
      {isFilm ? (
        <div style={{
          background: 'var(--header-bg, linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%))',
          padding: '40px 24px 24px',
          textAlign: 'left',
        }}>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(2.4rem, 8vw, 3rem)',
            letterSpacing: '-0.01em',
            lineHeight: 1.0,
            color: 'var(--text)',
            marginBottom: 8,
          }}>{event.title}</h1>
          {event.subtitle && (
            <p style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '0.85rem',
              color: 'var(--text-soft)',
            }}>{event.subtitle}</p>
          )}
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '0.85rem',
            color: 'var(--text-soft)',
            marginTop: 2,
          }}>{formatDate(event.date)}</p>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 500,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--accent)',
            marginTop: 8,
          }}>LIVE · {photoCount} SHOTS</div>
        </div>
      ) : (
        <div style={{
          background: 'var(--header-bg, linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%))',
          padding: '48px 24px 40px',
          textAlign: 'center',
          color: 'var(--text, white)',
        }}>
          <span className="badge" style={{ background: 'var(--badge-bg, rgba(201,168,76,0.15))', color: 'var(--badge-text, var(--gold-light))', marginBottom: 16 }}>✦ Live Gallery</span>
          <h1 className="serif" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 300, marginBottom: 8 }}>{event.title}</h1>
          {event.subtitle && <p style={{ color: 'var(--text-soft, rgba(255,255,255,0.4))', fontWeight: 300, fontSize: '0.9rem' }}>{event.subtitle}</p>}
          <p style={{ color: 'var(--text-faint, rgba(255,255,255,0.25))', marginTop: 8, fontSize: '0.8rem' }}>{formatDate(event.date)}</p>
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', marginTop: 24 }}>
            <div>
              <span style={{ color: 'var(--accent, var(--gold-light))', fontSize: '1.3rem', fontWeight: 400 }}>{photoCount}</span>
              <span style={{ color: 'var(--text-soft, rgba(255,255,255,0.3))', fontSize: '0.72rem', marginLeft: 6, letterSpacing: '0.1em' }}>PHOTOS AND VIDEOS SHARED</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EventHeader;
