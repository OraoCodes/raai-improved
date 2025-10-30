"use client";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export async function signInWithGoogleApp() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: ["openid", "email", "profile"].join(" "),
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
}

export async function connectYouTube() {
  // Manual Google OAuth to capture refresh token
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const redirectUri = `${window.location.origin}/connect-google`;
  const scope = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");
  
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  
  window.location.href = authUrl.toString();
}


