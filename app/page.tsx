"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { signInWithGoogleApp, connectYouTube } from "@/lib/auth";

export default function Home() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [hasChannel, setHasChannel] = useState(false);

  useEffect(() => {
    const s = getSupabaseBrowserClient();
    s.auth.getSession().then(async ({ data }) => {
      setIsAuthed(!!data.session);
      
      // Check if user has connected channel
      if (data.session) {
        const { data: ch } = await s
          .from("channels")
          .select("id")
          .limit(1)
          .maybeSingle();
        setHasChannel(!!ch);
      }
    });
    
    const { data: sub } = s.auth.onAuthStateChange(async (_e, sess) => {
      setIsAuthed(!!sess);
      if (sess) {
        const { data: ch } = await s
          .from("channels")
          .select("id")
          .limit(1)
          .maybeSingle();
        setHasChannel(!!ch);
      }
    });
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
            Connect your YouTube channel to get instant AI-powered insights and analytics.
          </p>
          {!isAuthed || !hasChannel ? (
            <button
              onClick={connectYouTube}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-gray-300 bg-black px-5 py-3 text-white font-medium transition-colors hover:bg-zinc-800 hover:border-gray-400 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isAuthed ? "Connect YouTube Channel" : "Sign in with YouTube"}
            </button>
          ) : (
            <a 
              href="/dashboard" 
              className="mt-2 inline-flex items-center justify-center rounded-md border border-gray-300 bg-black px-5 py-3 text-white font-medium transition-colors hover:bg-zinc-800 hover:border-gray-400 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Go to Dashboard
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
