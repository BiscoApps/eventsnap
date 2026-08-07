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

  // NOTE: signInWithGoogle uses OAuth redirect flow — works on web only.
  // On native iOS, use signInWithGoogleNative below, which uses the native
  // Google Sign-In SDK and returns an idToken that Supabase validates
  // directly (same pattern as signInWithApple).
  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signInWithGoogleNative = async () => {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      const result = await GoogleAuth.signIn();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: result.authentication.idToken,
      });
      if (error) return { error };
      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

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
    signInWithGoogleNative,
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
