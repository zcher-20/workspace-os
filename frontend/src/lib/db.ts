import { supabase } from "./supabase"

// ── Key-value store that mirrors localStorage ──────────────────────
// Each workspace key maps to one row in the kv_store table.
// Strategy: localStorage is the fast read cache; Supabase is the
// persistent source of truth. On app boot we pull from Supabase
// into localStorage, then all reads are synchronous as before.

const SYNCED_KEYS = [
  "workspace:opportunities",
  "workspace:tasks-v1",
  "workspace:timeline-hidden",
  "workspace:home-name",
  "workspace:home-role",
  "workspace:collection",
  "workspace:collection-folders",
  "workspace:canvas-v2",
  "workspace:canvas-folders",
  "workspace:canvas-strokes",
  "workspace:canvas-connections",
  "workspace:canvas-pan",
  "workspace:people",
  "workspace:organizations",
  "workspace:calendar-events",
  "workspace:outreach-templates",
  "workspace:column-names",
  "workspace:opp-notes",
  "workspace:atlas-type-config",
  "workspace:atlas-custom-nodes",
  "workspace:degree-courses-v5",
  "workspace:degree-semesters-v5",
  "workspace:degree-major-v5",
  "workspace:degree-notes",
  "workspace:schedule-cal-v1",
  "workspace:req-cl-core-v1",
  "workspace:req-cl-math-v1",
  "workspace:req-cl-design-v1",
  "workspace:req-cl-school-v1",
  "workspace:events",
]

// Pull all keys from Supabase → write into localStorage
export async function pullFromSupabase(): Promise<void> {
  const { data, error } = await supabase
    .from("kv_store")
    .select("key, value")
    .in("key", SYNCED_KEYS)

  if (error) { console.warn("Supabase pull failed:", error.message); return }

  for (const row of data ?? []) {
    try {
      localStorage.setItem(row.key, JSON.stringify(row.value))
    } catch {}
  }
}

// Push a single key from localStorage → Supabase
export function pushToSupabase(key: string, value: unknown): void {
  supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .then(({ error }) => { if (error) console.warn("Supabase push failed:", error.message) })
}
