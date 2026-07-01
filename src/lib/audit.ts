import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "create" | "update" | "delete" | "archive" | "restore" | "close";
export type AuditEntity =
  | "transaction" | "asset" | "debt" | "receivable"
  | "project" | "goal" | "budget_node" | "subscription" | "income_source"
  | "product" | "counterparty";

/**
 * Best-effort write to public.audit_log. Never throws — audit failures must not break user actions.
 */
export async function logAudit(
  entity_type: AuditEntity,
  entity_id: string | null,
  action: AuditAction,
  payload?: Record<string, unknown>,
) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("audit_log").insert({
      user_id: u.user.id,
      action,
      entity_type,
      entity_id: entity_id ?? null,
      payload: payload ?? null,
    } as any);
  } catch (e) {
    // silent
    console.warn("audit log failed", e);
  }
}
