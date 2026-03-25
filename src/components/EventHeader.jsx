import React from 'react';

const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const EventHeader = ({ event, photoCount = 0 }) => {
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
      <div style={{
        background: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)',
        padding: '48px 24px 40px',
        textAlign: 'center',
        color: 'white',
      }}>
        <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold-light)', marginBottom: 16 }}>✦ Live Gallery</span>
        <h1 className="serif" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 300, marginBottom: 8 }}>{event.title}</h1>
        {event.subtitle && <p style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 300, fontSize: '0.9rem' }}>{event.subtitle}</p>}
        <p style={{ color: 'rgba(255,255,255,0.25)', marginTop: 8, fontSize: '0.8rem' }}>{formatDate(event.date)}</p>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', marginTop: 24 }}>
          <div>
            <span style={{ color: 'var(--gold-light)', fontSize: '1.3rem', fontWeight: 400 }}>{photoCount}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', marginLeft: 6, letterSpacing: '0.1em' }}>PHOTOS AND VIDEOS SHARED</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default EventHeader;
