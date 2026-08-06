import { useState, useMemo } from "react"
import { Search, Plus, X } from "lucide-react"
import Atlas, { type AtlasItem } from "./Atlas"

const TYPES = ["person", "opportunity", "project", "organization", "event", "idea", "note"] as const
type ItemType = typeof TYPES[number]

// "Folder" types get an outline border — entity-like items that group other things
const FOLDER_TYPES: Set<string> = new Set(["person", "organization", "project", "opportunity", "event"])

interface ArchiveItem {
  id: string
  objectType: ItemType
  title: string
  subtitle: string
  content?: string    // body text for notes/ideas
  imageUrl?: string   // media items
  createdAt: string
}

const LS_KEY = "workspace:collection"

function load(): ArchiveItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] }
}
function save(items: ArchiveItem[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)) }

// ── Card variants ────────────────────────────────────────────────

function ImageCard({ item, onRemove }: { item: ArchiveItem; onRemove: () => void }) {
  return (
    <div className="group relative break-inside-avoid mb-2 overflow-hidden">
      <img
        src={item.imageUrl}
        alt={item.title}
        className="w-full block object-cover"
        style={{ display: "block" }}
        onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
      />
      {/* Hover overlay with title */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onRemove}
          className="w-5 h-5 flex items-center justify-center bg-black/50 text-white"
        >
          <X size={9} />
        </button>
      </div>
      {item.title && (
        <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform bg-black/70 px-2 py-1.5">
          <p className="text-[10px] text-white font-medium leading-snug truncate">{item.title}</p>
          {item.subtitle && <p className="text-[9px] text-white/70 truncate">{item.subtitle}</p>}
        </div>
      )}
    </div>
  )
}

function TextCard({ item, onRemove }: { item: ArchiveItem; onRemove: () => void }) {
  const body = item.content || item.subtitle || ""
  return (
    <div className="group relative break-inside-avoid mb-2 bg-[#f7f7f5] px-3 py-3">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={10} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
      </button>

      {body && (
        <p className="text-[12px] text-[#1d1d1f] leading-[1.6] mb-2 line-clamp-6 pr-4">{body}</p>
      )}
      <p className="text-[10px] text-[#7a7a7a] font-medium leading-snug pr-4">{item.title}</p>
    </div>
  )
}

function FolderCard({ item, onRemove }: { item: ArchiveItem; onRemove: () => void }) {
  return (
    <div className="group relative break-inside-avoid mb-2 border border-[#d4d4d4] px-3 py-3 bg-white">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={10} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
      </button>

      <p className="text-[9px] font-bold uppercase tracking-widest text-[#a0a0a0] mb-1.5">{item.objectType}</p>
      <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug pr-4">{item.title}</p>
      {item.subtitle && <p className="text-[11px] text-[#7a7a7a] mt-1 leading-snug pr-4">{item.subtitle}</p>}
    </div>
  )
}

function Card({ item, onRemove }: { item: ArchiveItem; onRemove: () => void }) {
  if (item.imageUrl) return <ImageCard item={item} onRemove={onRemove} />
  if (FOLDER_TYPES.has(item.objectType)) return <FolderCard item={item} onRemove={onRemove} />
  return <TextCard item={item} onRemove={onRemove} />
}

// ── Main component ───────────────────────────────────────────────

export default function Collection() {
  const [items, setItems] = useState<ArchiveItem[]>(load)
  const [search, setSearch]     = useState("")
  const [adding, setAdding]     = useState(false)
  const [draft, setDraft]       = useState<{
    title: string; subtitle: string; objectType: ItemType; content: string; imageUrl: string
  }>({ title: "", subtitle: "", objectType: "note", content: "", imageUrl: "" })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return !q ? items : items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.subtitle.toLowerCase().includes(q) ||
      (i.content ?? "").toLowerCase().includes(q)
    )
  }, [items, search])

  const atlasItems: AtlasItem[] = useMemo(() => items.map(i => ({
    id: i.id, title: i.title, subtitle: i.subtitle, objectType: i.objectType,
  })), [items])

  function addItem() {
    if (!draft.title.trim() && !draft.imageUrl.trim()) return
    const next: ArchiveItem = {
      id: Date.now().toString(),
      objectType: draft.objectType,
      title: draft.title.trim() || draft.imageUrl.trim(),
      subtitle: draft.subtitle.trim(),
      content: draft.content.trim() || undefined,
      imageUrl: draft.imageUrl.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    const updated = [next, ...items]
    setItems(updated); save(updated)
    setAdding(false)
    setDraft({ title: "", subtitle: "", objectType: "note", content: "", imageUrl: "" })
  }

  function removeItem(id: string) {
    const updated = items.filter(i => i.id !== id)
    setItems(updated); save(updated)
  }

  return (
    <div className="flex h-full w-full">

      {/* ── Left: Visual board ── */}
      <div className="flex flex-col w-[460px] shrink-0 border-r border-[#e0e0e0] overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#e0e0e0] bg-white shrink-0">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#b0b0b0]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search collection…"
              className="w-full pl-7 pr-3 py-1.5 text-[12px] bg-[#f5f5f5] border-none focus:outline-none focus:ring-1 focus:ring-[#2c4470]/20"
            />
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors shrink-0"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {/* Masonry board */}
        <div className="flex-1 overflow-y-auto bg-white">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a] py-16 px-8">
              <p className="text-[13px] font-medium text-[#1d1d1f]">Nothing here yet</p>
              <p className="text-[11px] mt-1">Add images, text, links, or entities to build your board.</p>
            </div>
          ) : (
            <div
              className="p-2"
              style={{ columns: "2", columnGap: "8px" }}
            >
              {filtered.map(item => (
                <Card key={item.id} item={item} onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[#e8e8e8] bg-white shrink-0">
          <p className="text-[10px] text-[#c0c0c0]">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Right: Atlas graph ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Atlas items={atlasItems} />
      </div>

      {/* ── Add modal ── */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add to collection</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Type */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Type</label>
                <select
                  value={draft.objectType}
                  onChange={e => setDraft(d => ({ ...d, objectType: e.target.value as ItemType }))}
                  className="mt-1 w-full px-3 py-2 text-[13px] border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                >
                  {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>

              {/* Image URL */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Image URL</label>
                <input
                  value={draft.imageUrl}
                  onChange={e => setDraft(d => ({ ...d, imageUrl: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Title</label>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="Name, title, or source"
                  className="mt-1 w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Subtitle</label>
                <input
                  value={draft.subtitle}
                  onChange={e => setDraft(d => ({ ...d, subtitle: e.target.value }))}
                  placeholder="Author, organization, tag…"
                  className="mt-1 w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>

              {/* Content */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Content / Note</label>
                <textarea
                  value={draft.content}
                  onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && e.metaKey) addItem() }}
                  placeholder="Text, quote, or note body…"
                  rows={3}
                  className="mt-1 w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 resize-none"
                />
              </div>

              <button
                onClick={addItem}
                disabled={!draft.title.trim() && !draft.imageUrl.trim()}
                className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors"
              >
                Add to board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
