import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // NOTE: Google sign-in works on web but is disabled in the native iOS build
  // because window.location.origin becomes capacitor://localhost, which Supabase
  // and Google both reject as a redirect. The Google button is conditionally
  // rendered in SignInPage.jsx and SignUpPage.jsx based on VITE_NATIVE_APP.
  // On iOS, users use Sign in with Apple or email/password. Full deep-link
  // Google fix planned for v1.1.
  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signInWithApple = async () => {
    try {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const { response } = await SignInWithApple.authorize({ scopes: 'name email' });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: response.identityToken,
      });
      if (error) return { error };
      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

  const signUpWithApple = async () => {
    try {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const { response } = await SignInWithApple.authorize({ scopes: 'name email' });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: response.identityToken,
      });
      if (error) return { error };

      // Apple returns the name ONLY on first sign-in — capture it now or it is gone forever.
      const givenName = response.givenName ?? response.fullName?.givenName ?? '';
      const familyName = response.familyName ?? response.fullName?.familyName ?? '';
      const fullName = `${givenName} ${familyName}`.trim();
      if (fullName && data.session?.user) {
        await supabase.from('profiles').upsert({ id: data.session.user.id, full_name: fullName });
      }

      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

  const signOut = () => supabase.auth.signOut();

  const signInWithEmail = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signUpWithEmail = (email, password) =>
    supabase.auth.signUp({ email, password });

  const value = {
    user: session?.user ?? null,
    session,
    loading,
    signInWithGoogle,
    signInWithApple,
    signUpWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export default AuthProvider;
