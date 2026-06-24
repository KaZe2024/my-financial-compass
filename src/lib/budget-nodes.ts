export type BudgetNodeKind = "normal" | "subtotal";

export type BudgetNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_income: boolean;
  archived: boolean;
  notes: string | null;
  kind: BudgetNodeKind;
  created_at: string;
  updated_at: string;
};

export type TreeNode = BudgetNode & {
  children: TreeNode[];
  depth: number;
  path: string[]; // names from root to this node
  childCount: number;
  descendantCount: number;
};

export function buildTree(nodes: Array<Partial<BudgetNode> & { id: string; parent_id: string | null; name: string; sort_order: number }>): TreeNode[] {
  const byParent = new Map<string | null, any[]>();
  for (const n of nodes) {
    const k = n.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  function build(parent: string | null, depth: number, path: string[]): TreeNode[] {
    return (byParent.get(parent) ?? []).map((n) => {
      const newPath = [...path, n.name];
      const children = build(n.id, depth + 1, newPath);
      const descendantCount = children.reduce((s, c) => s + 1 + c.descendantCount, 0);
      return {
        ...n,
        kind: (n.kind ?? "normal") as BudgetNodeKind,
        depth,
        path: newPath,
        children,
        childCount: children.length,
        descendantCount,
      } as TreeNode;
    });
  }
  return build(null, 0, []);
}

export function flattenTree(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  function walk(ns: TreeNode[]) { for (const n of ns) { out.push(n); walk(n.children); } }
  walk(tree);
  return out;
}

export function descendantIds(tree: TreeNode[], id: string): string[] {
  const all = flattenTree(tree);
  const target = all.find((n) => n.id === id);
  if (!target) return [];
  return flattenTree(target.children).map((n) => n.id);
}

export function pathLabel(node: { path: string[] }, sep = " › ") {
  return node.path.join(sep);
}

/**
 * For each subtotal node, compute the sum of its preceding "normal" siblings
 * (until the previous subtotal at the same level). Returns Maps keyed by subtotal id.
 */
export function computeSubtotals(
  tree: TreeNode[],
  plannedByNode: Map<string, number>,
  spentByNode: Map<string, number>,
): { planned: Map<string, number>; spent: Map<string, number> } {
  const planned = new Map<string, number>();
  const spent = new Map<string, number>();
  function walk(siblings: TreeNode[]) {
    let bufP = 0, bufS = 0;
    for (const n of siblings) {
      if (n.kind === "subtotal") {
        // If subtotal has its own children, use those rollups too.
        let p = bufP, s = bufS;
        if (n.children.length > 0) {
          for (const c of n.children) {
            p += plannedByNode.get(c.id) ?? 0;
            s += spentByNode.get(c.id) ?? 0;
          }
        }
        planned.set(n.id, p);
        spent.set(n.id, s);
        bufP = 0; bufS = 0;
      } else {
        bufP += plannedByNode.get(n.id) ?? 0;
        bufS += spentByNode.get(n.id) ?? 0;
      }
      walk(n.children);
    }
  }
  walk(tree);
  return { planned, spent };
}
