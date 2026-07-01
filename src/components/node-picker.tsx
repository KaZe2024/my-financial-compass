import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { buildTree, flattenTree, pathLabel, type BudgetNode, type TreeNode } from "@/lib/budget-nodes";

type Props = {
  nodes: BudgetNode[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** When true, allow non-leaf nodes to be picked. Defaults to true. */
  allowBranches?: boolean;
  /** Restrict selectable / visible nodes to a specific tree depth (0 = root). */
  onlyDepth?: number;
  /** When true, render only the leaf name (no parent path). */
  hidePath?: boolean;
  /** When true, exclude subtotal-kind nodes. Defaults to true. */
  excludeSubtotals?: boolean;
  /** When true, only nodes with no children (feuilles) are selectable/visible. */
  leafOnly?: boolean;
};

export function NodePicker({ nodes, value, onChange, placeholder = "Sélectionner un budget…", allowBranches = true, onlyDepth, hidePath = false, excludeSubtotals = true, leafOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => buildTree(nodes.filter((n) => !n.archived && (!excludeSubtotals || n.kind !== "subtotal"))), [nodes, excludeSubtotals]);
  const flatAll = useMemo(() => flattenTree(tree), [tree]);
  const flat = useMemo(() => {
    let f = flatAll;
    if (onlyDepth != null) f = f.filter((n) => n.depth === onlyDepth);
    if (leafOnly) f = f.filter((n) => n.childCount === 0);
    return f;
  }, [flatAll, onlyDepth, leafOnly]);
  const selected = flatAll.find((n) => n.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? (hidePath ? selected.name : pathLabel(selected)) : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <div className="flex items-center gap-1">
            {selected && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            // val is composed of "id|path" — we match on path
            const path = val.split("|")[1] ?? "";
            return path.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Rechercher un budget…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {flat.map((n: TreeNode) => {
                const disabled = (!allowBranches && n.childCount > 0) || (leafOnly && n.childCount > 0);
                const label = hidePath ? n.name : pathLabel(n);
                return (
                  <CommandItem
                    key={n.id}
                    value={`${n.id}|${label}`}
                    disabled={disabled}
                    onSelect={() => { onChange(n.id); setOpen(false); }}
                    className={cn("flex items-center gap-2", disabled && "opacity-40")}
                    style={{ paddingLeft: onlyDepth != null ? 8 : 8 + n.depth * 14 }}
                  >
                    <Check className={cn("h-3.5 w-3.5", n.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{hidePath ? n.name : label}</span>
                    {onlyDepth == null && n.childCount > 0 && (
                      <span className="ml-auto font-mono text-[9px] text-muted-foreground">{n.descendantCount}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
