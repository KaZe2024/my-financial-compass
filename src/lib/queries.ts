import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import type { BudgetNode } from "@/lib/budget-nodes";

export const qkWallets = ["wallets"] as const;
export const walletsQO = queryOptions({
  queryKey: qkWallets,
  queryFn: async () => {
    const { data, error } = await supabase.from("wallets").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const qkCategories = ["budget_categories"] as const;
export const categoriesQO = queryOptions({
  queryKey: qkCategories,
  queryFn: async () => {
    const { data, error } = await supabase.from("budget_categories").select("*, budget_groups(name, color)").order("name");
    if (error) throw error;
    return data;
  },
});

export const qkBudgetNodes = ["budget_nodes"] as const;
export const budgetNodesQO = queryOptions({
  queryKey: qkBudgetNodes,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("budget_nodes")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BudgetNode[];
  },
});

export const qkProfile = ["profile"] as const;
export const profileQO = queryOptions({
  queryKey: qkProfile,
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const qkCounterparties = ["counterparties"] as const;
export const counterpartiesQO = queryOptions({
  queryKey: qkCounterparties,
  queryFn: async () => {
    const { data, error } = await supabase.from("counterparties").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

export const qkProjects = ["projects"] as const;
export const projectsQO = queryOptions({
  queryKey: qkProjects,
  queryFn: async () => {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});
