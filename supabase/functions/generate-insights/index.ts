import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!channel) return new Response("No channel", { status: 400 });

  const { data: vids } = await supabase
    .from("videos")
    .select("title,views,likes,comments,duration_seconds,published_at")
    .eq("channel_id", channel.id)
    .order("published_at", { ascending: false })
    .limit(60);

  const payload = vids ?? [];
  const prompt = `You are an AI analytics assistant helping a YouTuber. Based on this JSON:\n${JSON.stringify(
    payload
  )}\nSummarize best posting days/times, ideal duration range, engagement trend, and clear next steps in 2 short paragraphs.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    return new Response(`OpenAI error: ${errText}`, { status: 500 });
  }
  const j = await r.json();
  const summary = j.choices?.[0]?.message?.content ?? "";

  await supabase.from("insights").insert({
    user_id: user.id,
    channel_id: channel.id,
    type: "summary_v1",
    payload: payload as any,
    summary,
  });

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});


