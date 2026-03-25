import React, { useState } from 'react';
import { supabase } from '../store.js';
import { API_BASE } from '../config.js';

const PhotographerSignup = ({ onNavigate }) => {
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    setError('');

    if (!form.displayName || !form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const hashRes = await fetch(`${API_BASE}/.netlify/functions/hash-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password }),
      });
      const { hash: passwordHash } = await hashRes.json();

      // Create account in photographer_accounts
      const { data, error: dbError } = await supabase
        .from('photographer_accounts')
        .insert({
          email: form.email.toLowerCase().trim(),
          display_name: form.displayName.trim(),
          password_hash: passwordHash,
          subscription_status: 'inactive',
        })
        .select()
        .single();

      if (dbError) {
        if (dbError.code === '23505') {
          setError('An account with this email already exists. Try logging in.');
        } else {
          setError('Could not create account. Please try again.');
        }
        setLoading(false);
        return;
      }

      // Store session
      localStorage.setItem('proAuth', JSON.stringify({
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        subscriptionStatus: 'inactive',
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }));

      // Redirect to Stripe Checkout
      const response = await fetch(`${API_BASE}/.netlify/functions/create-pro-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photographerId: data.id, email: data.email }),
      });
      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📷</div>
          <h2 className="serif" style={{ fontSize: '2.2rem', fontWeight: 300, marginBottom: 8 }}>Photographer Pro</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 300 }}>Unlimited premium events for £19/month</p>
        </div>

        <div style={{ background: 'white', borderRadius: 6, padding: 36, boxShadow: 'var(--shadow)' }}>
          {error && (
            <div style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: '0.85rem', color: '#c53030' }}>
              {error}
            </div>
          )}

          {[
            { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'John Smith Photography' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
            { key: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 characters' },
            { key: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: 'Repeat password' },
          ].map((f) => (
            <div key={f.key} style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 3, padding: '13px 16px', fontSize: '0.95rem', background: 'white', color: 'var(--charcoal)' }}
              />
            </div>
          ))}

          <button
            className="btn-gold"
            onClick={handleSignup}
            disabled={loading}
            style={{ width: '100%', padding: 16, borderRadius: 3, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
          >
            {loading ? <><div className="loader" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> Creating account...</> : 'Sign Up & Subscribe'}
          </button>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Already have an account?{' '}
              <button onClick={() => onNavigate('proLogin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-dark)', fontWeight: 500, fontFamily: 'Jost, sans-serif', fontSize: '0.82rem' }}>
                Log in
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

export default PhotographerSignup;
