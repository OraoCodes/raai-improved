"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ConnectPage() {
  const [status, setStatus] = useState<string>("Connecting your channel…");

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      try {
        setStatus("Completing sign-in…");
        const url = new URL(window.location.href);
        let session = null as any;
        let exchangeError: any = null;

        // Only call PKCE exchange if there is a code param
        const code = url.searchParams.get("code");
        if (code) {
          const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
          exchangeError = error;
          session = exchanged?.session ?? null;
        }

        // Fallback: if we ended up with implicit fragment (#access_token=...), parse and setSession
        if (!session && window.location.hash.startsWith("#")) {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token") || params.get("provider_refresh_token");
          if (access_token && refresh_token) {
            const { data: setData, error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!setErr) session = setData.session ?? null;
          }
        }

        if (exchangeError && !session) {
          setStatus("Sign-in failed. Please try again.");
          return;
        }
        if (!session) {
          setStatus("No active session. Please go back and sign in again.");
          return;
        }
        // Clean URL
        if (window.location.hash) history.replaceState(null, "", "/connect");
        setStatus("Securing tokens…");
        const provider_refresh_token =
          (session as any)?.provider_refresh_token ||
          new URLSearchParams(window.location.hash.slice(1)).get("refresh_token") ||
          new URLSearchParams(window.location.hash.slice(1)).get("provider_refresh_token");
        const storeRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/store-tokens`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_refresh_token }),
        });
        try { console.debug("store-tokens diag:", await storeRes.clone().json()); } catch {}
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/store-tokens`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_refresh_token }),
        }).catch(() => {});

        setStatus("Syncing channel and videos…");
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const provider_token = (session as any)?.provider_token || 
          hashParams.get("provider_token") ||
          hashParams.get("access_token"); // Google access token is in hash as access_token
        const syncRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-channel`, {
          method: "POST",
          headers: { 
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_token, maxVideos: 500 }),
        });

        if (!syncRes.ok) {
          const errText = await syncRes.text();
          setStatus(`Sync failed: ${errText}. Please enable YouTube Data API v3 in Google Cloud Console, then sign out and reconnect.`);
          return;
        }

        // Only redirect; do not auto-generate insights
        window.location.href = "/dashboard";
      } catch (e) {
        setStatus("There was an issue connecting your channel. Please try again.");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <p className="text-lg text-zinc-700 dark:text-zinc-200 font-medium">{status}</p>
    </div>
  );
}


