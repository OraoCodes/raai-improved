"use client";

/**
 * Unified authentication function that signs users in with YouTube access.
 * This ensures all users authenticate with YouTube scopes from the start,
 * maintaining consistent user IDs and persistent refresh tokens.
 */
export async function connectYouTube() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const redirectUri = `${window.location.origin}/connect-google`;
  const scope = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.force-ssl", // Full YouTube access including comments
  ].join(" ");
  
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline"); // Get refresh token
  authUrl.searchParams.set("prompt", "consent"); // Force consent to get refresh token
  
  window.location.href = authUrl.toString();
}


