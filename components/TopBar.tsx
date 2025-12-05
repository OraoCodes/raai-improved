"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { connectYouTube } from "@/lib/auth";

export default function TopBar() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const s = getSupabaseBrowserClient();
    s.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => setIsAuthed(!!sess));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return (
    <div className="w-full flex items-center justify-between px-6 py-3 border-b">
      <a href="/" className="font-heading font-medium text-base">YTI</a>
      <div className="flex items-center gap-3">
        {isAuthed && <a className="text-sm text-gray-600 hover:underline font-medium" href="/dashboard">Dashboard</a>}
        {!isAuthed ? (
          <button
            className="text-sm text-gray-600 hover:underline font-medium"
            onClick={connectYouTube}
          >
            Sign in
          </button>
        ) : (
          <button
            className="text-sm text-gray-600 hover:underline font-medium"
            onClick={async () => { const s = getSupabaseBrowserClient(); await s.auth.signOut(); window.location.href = "/"; }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}


