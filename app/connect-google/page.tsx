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
        
        console.log("🔐 Starting OAuth flow...");
        
        if (!code) {
          console.error("❌ No authorization code in URL");
          setStatus("No authorization code found. Please try again.");
          return;
        }

        // Exchange code for tokens via our Edge Function
        setStatus("Getting tokens from Google…");
        console.log("🔑 Exchanging code for tokens...");
        const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/exchange-google-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          console.error("❌ Token exchange failed:", errText);
          setStatus(`Token exchange failed: ${errText}`);
          return;
        }

        const tokens = await tokenRes.json();
        console.log("✅ Received tokens:", { 
          has_access: !!tokens.access_token, 
          has_refresh: !!tokens.refresh_token,
          has_id_token: !!tokens.id_token 
        });
        
        if (!tokens.refresh_token) {
          console.error("❌ No refresh token received! Check OAuth consent settings.");
          setStatus("No refresh token received. Ensure app is set to 'offline' access.");
          return;
        }

        // Sign in to Supabase with Google ID token
        setStatus("Signing in to app…");
        console.log("👤 Signing in with ID token...");
        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: tokens.id_token,
        });

        if (authError || !authData.session) {
          console.error("❌ Sign-in failed:", authError);
          setStatus(`Sign-in failed: ${authError?.message || "No session"}`);
          return;
        }
        
        console.log("✅ Signed in:", {
          userId: authData.session.user.id,
          email: authData.session.user.email,
        });

        // Store the Google refresh token
        setStatus("Securing tokens…");
        console.log("📝 Storing refresh token...");
        const storeRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/store-tokens`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_refresh_token: tokens.refresh_token }),
        });
        
        if (!storeRes.ok) {
          const errorText = await storeRes.text();
          console.error("❌ Failed to store tokens:", errorText);
          setStatus(`Failed to store tokens: ${errorText}`);
          return;
        }
        
        const storeDiag = await storeRes.json();
        console.log("✅ Tokens stored:", storeDiag);
        
        if (!storeDiag.ok) {
          console.error("❌ Token storage reported error:", storeDiag);
          setStatus(`Token storage failed: ${storeDiag.error || "Unknown error"}`);
          return;
        }

        // Sync channel
        setStatus("Syncing channel and videos…");
        console.log("🔄 Starting channel sync...");
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
          console.error("❌ Sync failed:", errText);
          setStatus(`Sync failed: ${errText}. Please enable YouTube Data API v3 in Google Cloud Console.`);
          return;
        }

        const syncData = await syncRes.json();
        console.log("✅ Channel synced:", syncData);

        window.location.href = "/dashboard";
      } catch (e: any) {
        setStatus(`Error: ${e.message}`);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <p className="text-lg text-zinc-700 dark:text-zinc-200 font-medium">{status}</p>
    </div>
  );
}

