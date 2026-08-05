import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { AI_SYSTEM_PROMPT, buildFinancialSnapshot } from "@/lib/ai-snapshot.server";

const InputSchema = z.object({
  month: z.string(),
  focus: z.string().nullable(),
  scores: z.object({
    health: z.number(),
    execution: z.number(),
    alignment: z.number().nullable(),
  }),
  drafts: z.array(z.object({ title: z.string(), detail: z.string().nullable() })).max(10),
});

/**
 * Enrichit le plan d'action mensuel : narratif de coach + reformulation
 * des actions en consignes opérationnelles. La sortie est parsée en texte
 * simple pour rester robuste.
 */
export const generateCoachNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const snapshot = await buildFinancialSnapshot(context.supabase);
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `[Contexte système]
${AI_SYSTEM_PROMPT}

${snapshot}

[Mission]
Tu es le coach d'optimisation de vie de l'utilisateur. Rédige son plan d'action pour ${data.month}.
Scores actuels : santé financière ${data.scores.health.toFixed(0)}/100, exécution ${data.scores.execution.toFixed(0)}/100, alignement ${data.scores.alignment == null ? "non mesuré" : data.scores.alignment.toFixed(0) + "/100"}.
Thème pressenti : ${data.focus ?? "non défini"}.

Actions détectées automatiquement :
${data.drafts.map((d, i) => `${i + 1}. ${d.title} — ${d.detail ?? ""}`).join("\n")}

Réponds STRICTEMENT dans ce format, en français, sans markdown :
FOCUS: <thème du mois, 3 à 6 mots>
SUMMARY: <3 phrases maximum, ton d'analyste, chiffrées quand possible>
ACTION: <consigne opérationnelle 1, verbe à l'infinitif, une seule phrase>
ACTION: <consigne opérationnelle 2>
ACTION: <consigne opérationnelle 3>`;

    let text = "";
    try {
      const result = streamText({ model: gateway("google/gemini-3-flash-preview"), prompt });
      text = await result.text;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error("[coach.generateCoachNarrative] gateway error:", msg);
      if (msg.includes("429")) throw new Error("Limite d'appels atteinte, réessaie dans une minute.");
      if (msg.includes("402")) throw new Error("Crédits IA épuisés — ajoute des crédits pour continuer.");
      throw new Error(msg);
    }

    const focus = text.match(/FOCUS:\s*(.+)/i)?.[1]?.trim() ?? null;
    const summary = text.match(/SUMMARY:\s*([\s\S]+?)(?=\nACTION:|$)/i)?.[1]?.trim() ?? null;
    const actions = [...text.matchAll(/ACTION:\s*(.+)/gi)].map((m) => m[1].trim()).filter(Boolean).slice(0, 5);

    return { focus, summary, actions };
  });
