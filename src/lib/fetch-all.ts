// Helper to fetch ALL rows from a Supabase query, bypassing PostgREST's
// default row cap by paging with `.range()` until fewer rows come back.
// Usage:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("transactions").select("*").order("occurred_on").range(from, to)
//   );

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard safety ceiling to avoid runaway loops (1M rows).
  const HARD_CAP = 1_000_000;
  while (from < HARD_CAP) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
