"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { signInWithGoogleApp, connectYouTube } from "@/lib/auth";

export default function Home() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const s = getSupabaseBrowserClient();
    s.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => setIsAuthed(!!sess));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-24 px-8 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="text-3xl font-heading font-semibold text-black dark:text-zinc-50">
            Turn your YouTube analytics into actions
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Sign in, then connect your YouTube channel to get instant insights.
          </p>
          {!isAuthed ? (
            <button
              onClick={signInWithGoogleApp}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-black px-5 py-3 text-white font-medium transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Sign in with Google
            </button>
          ) : (
            <div className="flex gap-3">
              <a href="/dashboard" className="inline-flex items-center justify-center rounded-md border px-5 py-3 font-medium">Go to Dashboard</a>
              <button
                onClick={connectYouTube}
                className="inline-flex items-center justify-center rounded-md bg-black px-5 py-3 text-white font-medium transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Connect my Channel
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
