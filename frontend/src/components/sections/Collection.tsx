import { useState, useMemo } from "react"
import { Search, LayoutGrid, List, Plus, X } from "lucide-react"
import Atlas, { type AtlasItem } from "./Atlas"

const TYPES = ["person", "opportunity", "project", "organization", "event", "idea", "note"] as const
type ItemType = typeof TYPES[number]

interface ArchiveItem {
  id: string
  objectType: ItemType
  title: string
  subtitle: string
  createdAt: string
}

const TYPE_COLORS: Record<ItemType, { bg: string; text: string }> = {
  person:       { bg: "bg-[#eef1fb]", text: "text-[#1e3a8a]" },
  opportunity:  { bg: "bg-[#ecfdf5]", text: "text-[#065f46]" },
  project:      { bg: "bg-[#fef3e8]", text: "text-[#92400e]" },
  organization: { bg: "bg-[#e0f2fe]", text: "text-[#0369a1]" },
  event:        { bg: "bg-[#fce7f3]", text: "text-[#9d174d]" },
  idea:         { bg: "bg-[#f5f0ff]", text: "text-[#4c1d95]" },
  note:         { bg: "bg-[#f0fdf4]", text: "text-[#14532d]" },
}

const LS_KEY = "workspace:collection"

function load(): ArchiveItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] }
}
function save(items: ArchiveItem[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function Collection() {
  const [items, setItems] = useState<ArchiveItem[]>(load)
  const [search, setSearch] = useState("")
  const [selectedType, setSelectedType] = useState<ItemType | null>(null)
  const [view, setView] = useState<"grid" | "list">("list")
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<{ title: string; subtitle: string; objectType: ItemType }>({
    title: "", subtitle: "", objectType: "note",
  })

  const filtered = useMemo(() => items.filter(i => {
    if (selectedType && i.objectType !== selectedType) return false
    const q = search.toLowerCase()
    return !q || i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)
  }), [items, search, selectedType])

  const atlasItems: AtlasItem[] = useMemo(() => items.map(i => ({
    id: i.id, title: i.title, objectType: i.objectType,
  })), [items])

  function addItem() {
    if (!draft.title.trim()) return
    const next: ArchiveItem = {
      id: Date.now().toString(), ...draft,
      title: draft.title.trim(), subtitle: draft.subtitle.trim(),
      createdAt: new Date().toISOString(),
    }
    const updated = [next, ...items]
    setItems(updated); save(updated)
    setAdding(false); setDraft({ title: "", subtitle: "", objectType: "note" })
  }

  function removeItem(id: string) {
    const updated = items.filter(i => i.id !== id)
    setItems(updated); save(updated)
  }

  return (
    <div className="flex gap-0 h-full w-full">
      {/* ── Left: Collection list ── */}
      <div className="flex flex-col w-[420px] shrink-0 border-r border-[#e0e0e0] overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e0e0e0] bg-white shrink-0">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-[#f8f8f8] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
            />
          </div>
          <div className="flex items-center gap-0.5 border border-[#e0e0e0] rounded-md bg-white p-0.5">
            <button onClick={() => setView("grid")} className={`p-1 rounded ${view === "grid" ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f7]"}`}>
              <LayoutGrid size={12} className="text-[#7a7a7a]" />
            </button>
            <button onClick={() => setView("list")} className={`p-1 rounded ${view === "list" ? "bg-[#f0f0f0]" : "hover:bg-[#f5f5f7]"}`}>
              <List size={12} className="text-[#7a7a7a]" />
            </button>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors shrink-0"
          >
            <Plus size={12} /> Add
          </button>
        </div>

        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-[#e0e0e0] bg-white shrink-0">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${!selectedType ? "bg-[#1d1d1f] text-white border-[#1d1d1f]" : "border-[#e0e0e0] text-[#7a7a7a] hover:border-[#1d1d1f] hover:text-[#1d1d1f]"}`}
          >All</button>
          {TYPES.map(t => {
            const c = TYPE_COLORS[t]
            const active = selectedType === t
            return (
              <button
                key={t}
                onClick={() => setSelectedType(active ? null : t)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${active ? `${c.bg} ${c.text} border-transparent` : "border-[#e0e0e0] text-[#7a7a7a] hover:border-[#1d1d1f] hover:text-[#1d1d1f]"}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          })}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a] py-16">
              <p className="text-[13px] font-medium text-[#1d1d1f]">Nothing here yet</p>
              <p className="text-[11px] mt-1">Add items to populate your archive and atlas.</p>
            </div>
          ) : view === "list" ? (
            <div className="flex flex-col gap-1">
              {filtered.map(item => {
                const c = TYPE_COLORS[item.objectType]
                return (
                  <div key={item.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-[#e0e0e0] hover:bg-white transition-colors">
                    <span className={`w-[72px] shrink-0 text-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
                      {item.objectType}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{item.title}</p>
                      {item.subtitle && <p className="text-[11px] text-[#7a7a7a] truncate">{item.subtitle}</p>}
                    </div>
                    <span className="text-[10px] text-[#c0c0c0] shrink-0">{formatDate(item.createdAt)}</span>
                    <button onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={11} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map(item => {
                const c = TYPE_COLORS[item.objectType]
                return (
                  <div key={item.id} className="group relative p-3 rounded-xl border border-[#e0e0e0] bg-white hover:border-[#2c4470]/30 transition-colors">
                    <button onClick={() => removeItem(item.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={11} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                    </button>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>{item.objectType}</span>
                      <span className="text-[10px] text-[#c0c0c0]">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-[#1d1d1f] line-clamp-1">{item.title}</p>
                    {item.subtitle && <p className="text-[11px] text-[#7a7a7a] mt-0.5 line-clamp-1">{item.subtitle}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer count */}
        <div className="px-4 py-2 border-t border-[#e0e0e0] bg-white shrink-0">
          <p className="text-[11px] text-[#c0c0c0]">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Right: Atlas graph ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Atlas items={atlasItems} />
      </div>

      {/* Add item modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add to collection</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Type</label>
                <select
                  value={draft.objectType}
                  onChange={e => setDraft(d => ({ ...d, objectType: e.target.value as ItemType }))}
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none"
                >
                  {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Title</label>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addItem()}
                  placeholder="Name or title"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Subtitle</label>
                <input
                  value={draft.subtitle}
                  onChange={e => setDraft(d => ({ ...d, subtitle: e.target.value }))}
                  placeholder="Role, org, brief note…"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!draft.title.trim()}
                className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
