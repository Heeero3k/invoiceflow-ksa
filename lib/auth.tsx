import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { ApiError, deleteAccount as deleteAccountApi, sheets } from "./api";
import { isBackendConfigured, supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

// Signing in with Google also grants access to the user's own Drive (files this
// app creates) and Sheets, so invoices and Excel files land in their account.
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_QUERY = { access_type: "offline", prompt: "consent" };

type AuthValue = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  /** Signed in with a real identity (not the anonymous guest session). */
  isSignedIn: boolean;
  displayName: string | null;
  email: string | null;
  /** Returns a session for calling Edge Functions, creating an anonymous guest session if needed. */
  ensureSession: () => Promise<Session>;
  signInWithProvider: (provider: "google" | "apple") => Promise<boolean>;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function redirectUrl() {
  return Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : Linking.createURL("auth-callback");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isBackendConfigured);
  const anonymousPromise = useRef<Promise<Session> | null>(null);
  const storedTokens = useRef(new Set<string>());

  // Google returns a refresh token only right after consent; hand it to the
  // backend once so Drive/Sheets work without a second permission screen.
  const captureGoogleToken = useCallback((next: Session | null) => {
    const token = next?.provider_refresh_token;
    if (!token || storedTokens.current.has(token) || next?.user.app_metadata?.provider !== "google") return;
    storedTokens.current.add(token);
    sheets.storeToken(token).catch((error) => console.warn("[auth] could not link Google Drive", error));
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer: Supabase forbids awaiting other auth calls inside this callback.
      setTimeout(() => captureGoogleToken(next), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [captureGoogleToken]);

  const ensureSession = useCallback(async () => {
    if (!isBackendConfigured) throw new ApiError("not_configured");
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    anonymousPromise.current ??= supabase.auth.signInAnonymously().then(({ data: anon, error }) => {
      anonymousPromise.current = null;
      if (error || !anon.session) throw new ApiError("unauthorized", error?.message);
      return anon.session;
    });
    return anonymousPromise.current;
  }, []);

  const signInWithProvider = useCallback(async (provider: "google" | "apple") => {
    if (!isBackendConfigured) throw new ApiError("not_configured");
    const redirectTo = redirectUrl();
    const extra = provider === "google" ? { scopes: GOOGLE_SCOPES, queryParams: GOOGLE_QUERY } : {};
    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, ...extra } });
      if (error) throw error;
      return false; // The page navigates away.
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true, ...extra } });
    if (error || !data.url) throw error ?? new Error("No OAuth URL");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return false;
    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === "string" ? queryParams.code : null;
    if (!code) throw new Error(typeof queryParams?.error_description === "string" ? queryParams.error_description : "Sign-in was not completed");
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return true;
  }, []);

  const sendEmailCode = useCallback(async (email: string) => {
    if (!isBackendConfigured) throw new ApiError("not_configured");
    // The email carries both a one-time code and a link back into the app (auth-callback).
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() } });
    if (error) throw error;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined);
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteAccountApi();
    await signOut();
  }, [signOut]);

  const value = useMemo<AuthValue>(() => {
    const user = session?.user ?? null;
    const isSignedIn = Boolean(user && !user.is_anonymous);
    const metadata = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    return {
      ready,
      session,
      user,
      isSignedIn,
      displayName: isSignedIn ? (metadata.full_name ?? metadata.name ?? user?.email?.split("@")[0] ?? null) : null,
      email: isSignedIn ? (user?.email ?? null) : null,
      ensureSession,
      signInWithProvider,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      deleteAccount,
    };
  }, [deleteAccount, ensureSession, ready, sendEmailCode, session, signInWithProvider, signOut, verifyEmailCode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
