import React, { useState } from 'react';
import { API_BASE } from '../config.js';

const PhotographerLogin = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/.netlify/functions/verify-photographer-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });
      const result = await res.json();

      if (!result.valid) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      // Store session
      localStorage.setItem('proAuth', JSON.stringify({
        id: result.account.id,
        email: result.account.email,
        displayName: result.account.displayName,
        subscriptionStatus: result.account.subscriptionStatus,
        stripeCustomerId: result.account.stripeCustomerId,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));

      onNavigate('proDashboard');
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📷</div>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Photographer Pro</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 300 }}>Log in to your account</p>
        </div>

        <div style={{ background: 'white', borderRadius: 6, padding: 36, boxShadow: 'var(--shadow)' }}>
          {error && (
            <div style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: '0.85rem', color: '#c53030' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="john@example.com"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '13px 16px', fontSize: '0.95rem', background: 'white', color: 'var(--charcoal)' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter password"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '13px 16px', fontSize: '0.95rem', background: 'white', color: 'var(--charcoal)' }}
            />
          </div>

          <button
            className="btn-gold"
            onClick={handleLogin}
            disabled={loading}
            style={{ width: '100%', padding: 16, borderRadius: 3, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
          >
            {loading ? <><div className="loader" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> Logging in...</> : 'Log In'}
          </button>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'Jost, sans-serif' }}>
              Forgot password?
            </button>
          </div>

          {showForgot && (
            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 4, padding: '12px 16px', marginTop: 16, fontSize: '0.82rem', color: 'var(--muted)', textAlign: 'center' }}>
              Please contact support at hello@eventsnapapp.live
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Don't have an account?{' '}
              <button onClick={() => onNavigate('proSignup')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontWeight: 500, fontFamily: 'Jost, sans-serif', fontSize: '0.82rem' }}>
                Sign up
              </button>
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem' }}>← Back to home</button>
        </div>
      </div>
    </div>
  );
};

export default PhotographerLogin;
