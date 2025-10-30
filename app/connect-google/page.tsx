"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ConnectGooglePage() {
  const [status, setStatus] = useState<string>("Connecting your channel…");

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      try {
        setStatus("Exchanging authorization code…");
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        
        if (!code) {
          setStatus("No authorization code found. Please try again.");
          return;
        }

        // Exchange code for tokens via our Edge Function
        setStatus("Getting tokens from Google…");
        const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/exchange-google-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          setStatus(`Token exchange failed: ${errText}`);
          return;
        }

        const tokens = await tokenRes.json();
        console.debug("Google tokens:", { has_access: !!tokens.access_token, has_refresh: !!tokens.refresh_token });

        // Sign in to Supabase with Google ID token
        setStatus("Signing in to app…");
        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: tokens.id_token,
        });

        if (authError || !authData.session) {
          setStatus(`Sign-in failed: ${authError?.message || "No session"}`);
          return;
        }

        // Store the Google refresh token
        setStatus("Securing tokens…");
        const storeRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/store-tokens`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_refresh_token: tokens.refresh_token }),
        });
        const storeDiag = await storeRes.json();
        console.debug("store-tokens diag:", storeDiag);

        // Sync channel
        setStatus("Syncing channel and videos…");
        const syncRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-channel`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_token: tokens.access_token, maxVideos: 500 }),
        });

        if (!syncRes.ok) {
          const errText = await syncRes.text();
          setStatus(`Sync failed: ${errText}`);
          return;
        }

        window.location.href = "/dashboard";
      } catch (e: any) {
        setStatus(`Error: ${e.message}`);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <p className="text-lg text-zinc-700 dark:text-zinc-200">{status}</p>
    </div>
  );
}

