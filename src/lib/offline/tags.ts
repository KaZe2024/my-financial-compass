import { supabaseOffline as supabase } from "@/lib/offline/client";
import { checkOnlineWithHeartbeat } from "./network-status";
import { getSyncedRows, applyLocalMutation, type SyncedTable } from "./db";
import { queueMutation } from "./sync";
import { v4 as uuidv4 } from "uuid";

export async function syncTagsOffline(txId: string, newIds: string[], forceQueue = false) {
  const nextIds = Array.from(new Set(newIds));
  const user = await supabase.auth.getUser();
  const userId = user.data.user?.id;
  if (!userId) throw new Error("Utilisateur non authentifié");

  const online = !forceQueue && await checkOnlineWithHeartbeat();
  let oldIds: string[] = [];

  if (online) {
    const { data: existing, error: readError } = await supabase
      .from("transaction_tags")
      .select("tag_id")
      .eq("transaction_id", txId);
    if (readError) throw readError;
    oldIds = (existing ?? []).map((r: any) => r.tag_id);

    const toRemove = oldIds.filter((x) => !nextIds.includes(x));
    if (toRemove.length) {
      const { error } = await supabase.from("transaction_tags").delete().eq("transaction_id", txId).in("tag_id", toRemove);
      if (error) throw error;
    }
    const toAdd = nextIds.filter((x) => !oldIds.includes(x));
    if (toAdd.length) {
      const { error } = await supabase
        .from("transaction_tags")
        .insert(toAdd.map((tag_id) => ({ transaction_id: txId, tag_id, user_id: userId })));
      if (error) {
        // La transaction peut avoir basculé dans la file locale entre les deux
        // requêtes. Dans ce cas, conserver les tags avec elle au lieu de bloquer
        // le formulaire avec une erreur de clé étrangère.
        if ((error as any).code !== "23503") throw error;
        for (const tag_id of toAdd) {
          const id = uuidv4();
          const row = { id, transaction_id: txId, tag_id, user_id: userId };
          await applyLocalMutation("transaction_tags", "insert", row);
          await queueMutation("transaction_tags", "insert", row);
        }
      }
    }
    return;
  }

  // Offline path: read from local cache, queue mutations, apply local state
  const cached = await getSyncedRows("transaction_tags");
  oldIds = cached.filter((r: any) => r.transaction_id === txId).map((r: any) => r.tag_id);

  const toAdd = nextIds.filter((x) => !oldIds.includes(x));
  const toRemove = oldIds.filter((x) => !nextIds.includes(x));

  for (const tag_id of toRemove) {
    const row = cached.find((r: any) => r.transaction_id === txId && r.tag_id === tag_id) as any;
    if (row?.id) {
      await applyLocalMutation("transaction_tags", "delete", { id: row.id });
      await queueMutation("transaction_tags", "delete", { id: row.id });
    }
  }

  for (const tag_id of toAdd) {
    const id = uuidv4();
    const row = { id, transaction_id: txId, tag_id, user_id: userId };
    await applyLocalMutation("transaction_tags", "insert", row);
    await queueMutation("transaction_tags", "insert", row);
  }
}

export async function addTagsOffline(table: SyncedTable, parentId: string, tagIds: string[], idColumn: string) {
  const user = await supabase.auth.getUser();
  const userId = user.data.user?.id;
  if (!userId) throw new Error("Utilisateur non authentifié");
  const ids = Array.from(new Set(tagIds));
  for (const tag_id of ids) {
    const id = uuidv4();
    const row = { id, [idColumn]: parentId, tag_id, user_id: userId };
    await applyLocalMutation(table, "insert", row);
    await queueMutation(table, "insert", row);
  }
}
