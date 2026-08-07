import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

export default function SignUpPage({ onNavigate }) {
  const { signInWithGoogle, signUpWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
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

  const handleAppleSignUp = async () => {
    setAppleLoading(true);
    sessionStorage.setItem('postAuthRedirect', window.location.hash);
    const { error } = await signUpWithApple();
    if (error) setAppleLoading(false);
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
                onClick={handleAppleSignUp}
                disabled={appleLoading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 20px', minHeight: 44, borderRadius: 6, border: 'none', background: '#000000', cursor: appleLoading ? 'default' : 'pointer', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif', fontSize: 17, fontWeight: 500, color: '#FFFFFF', transition: 'all 0.2s ease', opacity: appleLoading ? 0.7 : 1, marginBottom: 12 }}
                onMouseEnter={(e) => { if (!appleLoading) e.currentTarget.style.background = '#1a1a1a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#000000'; }}
              >
                {appleLoading ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><span>Redirecting…</span></>) : (
                  <><svg width="16" height="19" viewBox="0 0 814 1000" fill="#FFFFFF" aria-hidden="true"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" /></svg><span>Sign up with Apple</span></>
                )}
              </button>

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
