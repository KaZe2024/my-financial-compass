import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { AI_SYSTEM_PROMPT, buildFinancialSnapshot } from "@/lib/ai-snapshot.server";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_conversations")
      .select("id, title, archived, created_at, updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: conv } = await context.supabase.from("chat_conversations").select("*").eq("id", data.id).maybeSingle();
    const { data: msgs, error } = await context.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { conversation: conv, messages: msgs ?? [] };
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_conversations")
      .insert({ user_id: context.userId, title: "Nouvelle conversation" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chat_conversations").update({ title: data.title }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("chat_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversationId: z.string().uuid(),
    content: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Persist the user message.
    await context.supabase.from("chat_messages").insert({
      user_id: context.userId,
      conversation_id: data.conversationId,
      role: "user",
      content: data.content,
    });

    // Load history (last 20 messages).
    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    const snapshot = await buildFinancialSnapshot(context.supabase);
    const gateway = createLovableAiGatewayProvider(key);

    let assistantText = "";
    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        messages: [
          { role: "system", content: `${AI_SYSTEM_PROMPT}\n\n${snapshot}` },
          ...((history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))),
        ],
      });
      assistantText = result.text;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) throw new Error("Limite d'appels atteinte, réessaie dans une minute.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés — ajoute des crédits pour continuer.");
      throw new Error(msg);
    }

    const { data: saved, error } = await context.supabase.from("chat_messages").insert({
      user_id: context.userId,
      conversation_id: data.conversationId,
      role: "assistant",
      content: assistantText,
    }).select("id, role, content, created_at").single();
    if (error) throw new Error(error.message);

    // Bump conversation updated_at; auto-title from first user message.
    const { data: conv } = await context.supabase.from("chat_conversations").select("title").eq("id", data.conversationId).maybeSingle();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (conv?.title === "Nouvelle conversation") {
      patch.title = data.content.slice(0, 60);
    }
    await context.supabase.from("chat_conversations").update(patch).eq("id", data.conversationId);

    return saved;
  });

export const listInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_insights")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const dismissInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("ai_insights").update({ dismissed_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const snapshot = await buildFinancialSnapshot(context.supabase);
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `À partir de cette situation, génère 3 alertes ou recommandations financières actionnables et distinctes. Format strict — une par bloc, séparées par une ligne "---":

SEVERITY: warning|critical|info|success
TITLE: <titre court, max 80 caractères>
BODY: <2-3 phrases concrètes avec chiffres>
---

Situation:
${snapshot}`;

    let text = "";
    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      text = result.text;
    } catch (e: any) {
      throw new Error(String(e?.message ?? e));
    }

    // Parse blocks.
    const inserts: Array<{ user_id: string; kind: string; severity: string; title: string; body: string }> = [];
    for (const block of text.split(/^---\s*$/m)) {
      const sev = block.match(/SEVERITY:\s*(\w+)/i)?.[1]?.toLowerCase() ?? "info";
      const title = block.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
      const body = block.match(/BODY:\s*([\s\S]+?)$/i)?.[1]?.trim();
      if (!title || !body) continue;
      const severity = ["info", "warning", "critical", "success"].includes(sev) ? sev : "info";
      inserts.push({ user_id: context.userId, kind: "daily_review", severity, title, body });
    }
    if (inserts.length) {
      const { error } = await context.supabase.from("ai_insights").insert(inserts);
      if (error) throw new Error(error.message);
    }
    return { created: inserts.length };
  });
