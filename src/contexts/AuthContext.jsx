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
  // On native iOS, use signInWithGoogleNative below, which uses the
  // @capgo/capacitor-social-login plugin to get an idToken directly from
  // Google's native SDK. Same pattern as signInWithApple.
  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signInWithGoogleNative = async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: { iOSClientId: '981094037952-4574jal4cfha76tu99rjeorig8b3uhic.apps.googleusercontent.com' },
        apple: {},
      });
      const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['profile', 'email'] } });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: result.idToken,
      });
      if (error) return { error };
      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

  const signUpWithGoogleNative = async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: { iOSClientId: '981094037952-4574jal4cfha76tu99rjeorig8b3uhic.apps.googleusercontent.com' },
        apple: {},
      });
      const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['profile', 'email'] } });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: result.idToken,
      });
      if (error) return { error };

      const givenName = result.givenName ?? '';
      const familyName = result.familyName ?? '';
      const fullName = `${givenName} ${familyName}`.trim();
      if (fullName && data.session?.user) {
        await supabase.from('profiles').upsert({ id: data.session.user.id, full_name: fullName });
      }

      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

  const signInWithApple = async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: { iOSClientId: '981094037952-4574jal4cfha76tu99rjeorig8b3uhic.apps.googleusercontent.com' },
        apple: {},
      });
      const { result } = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.idToken,
      });
      if (error) return { error };
      return { session: data.session };
    } catch (error) {
      return { error };
    }
  };

  const signUpWithApple = async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: { iOSClientId: '981094037952-4574jal4cfha76tu99rjeorig8b3uhic.apps.googleusercontent.com' },
        apple: {},
      });
      const { result } = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.idToken,
      });
      if (error) return { error };

      // Apple returns the name ONLY on first sign-in — capture it now or it is gone forever.
      const givenName = result.givenName ?? '';
      const familyName = result.familyName ?? '';
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
    signUpWithGoogleNative,
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
