import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

export default function SignUpPage({ onNavigate }) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    sessionStorage.setItem('postAuthRedirect', window.location.hash);
    const { error } = await signInWithGoogle();
    if (error) setLoading(false);
  };

  const handleEmailSignUp = async () => {
    if (!email || !password) { setError('Please enter email and password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setEmailLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setError('Could not create account. Please try again.'); } else { setSuccess(true); }
    setEmailLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16, color: 'var(--gold)' }}>✦</div>
          <h1 className="serif" style={{ fontSize: '2.4rem', fontWeight: 300, marginBottom: 8, color: 'var(--charcoal)' }}>
            Create account
          </h1>
          <p style={{ color: 'var(--muted)', fontWeight: 300, fontSize: '0.9rem' }}>
            Start creating beautiful event galleries
          </p>
        </div>

        <div style={{ background: 'white', borderRadius: 6, padding: 36, boxShadow: 'var(--shadow)' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✉️</div>
              <h3 className="serif" style={{ fontSize: '1.4rem', fontWeight: 300, marginBottom: 8 }}>Check your email</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                We've sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 20px', borderRadius: 3, border: '1px solid var(--border)', background: 'white', cursor: loading ? 'default' : 'pointer', fontFamily: "'Jost', sans-serif", fontSize: '0.88rem', fontWeight: 500, color: 'var(--charcoal)', transition: 'all 0.2s ease', opacity: loading ? 0.7 : 1 }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(201,168,76,0.15)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {loading ? (<><div className="loader" /><span>Redirecting…</span></>) : (
                  <><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg><span>Continue with Google</span></>
                )}
              </button>

              <div className="divider" style={{ margin: '24px 0' }}>or</div>

              <div style={{ marginBottom: 16 }}>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="Email address" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '13px 16px', fontSize: '0.95rem', background: 'var(--cream)', color: 'var(--charcoal)', marginBottom: 12 }} />
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleEmailSignUp()} placeholder="Password (min 6 characters)" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '13px 16px', fontSize: '0.95rem', background: 'var(--cream)', color: 'var(--charcoal)' }} />
              </div>

              {error && <p style={{ color: '#e53e3e', fontSize: '0.78rem', marginBottom: 12 }}>{error}</p>}

              <button className="btn-gold" onClick={handleEmailSignUp} disabled={emailLoading} style={{ width: '100%', padding: '13px', borderRadius: 3, fontSize: '0.78rem' }}>
                {emailLoading ? 'Creating account…' : 'Create Account'}
              </button>

              <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.82rem', color: 'var(--muted)' }}>
                Already have an account?{' '}
                <button onClick={() => onNavigate('signin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontWeight: 500, fontSize: '0.82rem' }}>
                  Sign in
                </button>
              </p>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 32, fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 300, lineHeight: 1.6 }}>
          Guests don't need to sign in — just scan the QR code at your event
        </p>
      </div>
    </div>
  );
}
