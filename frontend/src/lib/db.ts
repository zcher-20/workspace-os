import { supabase } from "./supabase"

// ── IndexedDB helpers (images too large for localStorage) ─────────
const IDB_NAME  = "archive-os-images"
const IDB_STORE = "imgs"

export const IDB_KEYS = [
  "workspace:home-user-photo",
  "workspace:home-img-collection",
  "workspace:home-img-projects",
  "workspace:home-img-opportunities",
  "workspace:home-img-people",
  "workspace:home-img-degree",
  "workspace:home-img-chat",
]

export function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function idbSave(key: string, data: string): Promise<void> {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite")
    tx.objectStore(IDB_STORE).put(data, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function idbLoad(key: string): Promise<string | null> {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readonly")
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve((req.result as string) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// Pull image keys from Supabase → write into IndexedDB
export async function pullIDBFromSupabase(): Promise<void> {
  const { data, error } = await supabase
    .from("kv_store")
    .select("key, value")
    .in("key", IDB_KEYS)

  if (error) { console.warn("Supabase IDB pull failed:", error.message); return }

  for (const row of data ?? []) {
    if (typeof row.value === "string" && row.value) {
      await idbSave(row.key, row.value).catch(() => {})
    }
  }
}

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
