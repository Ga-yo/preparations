import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/db-types";

// 테스트용 최소 Supabase fake: from().select().eq()/ilike()/is()/in()/order()/limit()/maybeSingle() 체인, insert()는 성공만 반환, rpc()는 rpcs 함수 결과
type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: Row[]; error: null }> {
  private max = Infinity;
  constructor(private rows: Row[]) {}
  select() { return this; }
  order() { return this; }
  eq(c: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { return this.eq(c, v); }
  in(c: string, vs: unknown[]) { this.rows = this.rows.filter((r) => vs.includes(r[c])); return this; }
  ilike(c: string, p: string) {
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    this.rows = this.rows.filter((r) => re.test(String(r[c])));
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  insert() { return Promise.resolve({ error: null }); }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  then<A, B>(ok?: ((v: { data: Row[]; error: null }) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve({ data: this.rows.slice(0, this.max), error: null }).then(ok, err);
  }
}

export function fakeDb(tables: Record<string, Row[]>, rpcs: Record<string, (args: Record<string, unknown>) => Row[]> = {}) {
  return {
    from: (t: string) => new Query([...(tables[t] ?? [])]),
    rpc: (name: string, args: Record<string, unknown>) => Promise.resolve({ data: rpcs[name]?.(args) ?? [], error: null }),
  } as unknown as SupabaseClient<Database>;
}
