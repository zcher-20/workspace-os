import { useState, useMemo, useRef } from "react"
import { Search, Plus, X, Upload, ImageIcon, FolderOpen, Pencil } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import Atlas, { type AtlasItem } from "./Atlas"

const TYPES = ["person", "opportunity", "project", "organization", "event", "idea", "note"] as const
type ItemType = typeof TYPES[number]

// Only org/project/opp/event get the thin-outline folder treatment
const FOLDER_TYPES: Set<string> = new Set(["organization", "project", "opportunity", "event"])

interface ArchiveItem {
  id: string
  objectType: ItemType
  title: string
  subtitle: string
  content?: string
  imageUrl?: string
  folderId?: string   // which folder this item belongs to
  createdAt: string
}

interface CollectionFolder {
  id: string
  name: string
}

const LS_KEY     = "workspace:collection"
const LS_FOLDERS = "workspace:collection-folders"

function load(): ArchiveItem[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] } }
function save(items: ArchiveItem[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)) }
function loadFolders(): CollectionFolder[] { try { return JSON.parse(localStorage.getItem(LS_FOLDERS) || "[]") } catch { return [] } }
function saveFolders(f: CollectionFolder[]) { localStorage.setItem(LS_FOLDERS, JSON.stringify(f)) }

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

function TextCard({ item, onRemove, onEdit }: { item: ArchiveItem; onRemove: () => void; onEdit: () => void }) {
  const body = item.content || item.subtitle || ""
  return (
    <div className="group relative break-inside-avoid mb-2 bg-[#f7f7f5] px-3 py-3">
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Edit"><Pencil size={9} className="text-[#7a7a7a] hover:text-[#1d1d1f]" /></button>
        <button onClick={onRemove}><X size={9} className="text-[#7a7a7a] hover:text-[#1d1d1f]" /></button>
      </div>

      {body && (
        <div className="overflow-hidden w-full pr-5 mb-2 prose prose-sm max-w-none [&>*]:text-[12px] [&>*]:text-[#1d1d1f] [&>*]:leading-[1.6] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:mb-1.5 [&>p]:break-words [&>ul]:pl-3 [&>ol]:pl-3 [&>ul>li]:text-[12px] [&>ol>li]:text-[12px] [&>h1]:text-[13px] [&>h1]:font-semibold [&>h2]:text-[12px] [&>h2]:font-semibold [&>h3]:text-[12px] [&>h3]:font-semibold [&>strong]:font-semibold [&>blockquote]:border-l-2 [&>blockquote]:border-[#c8c8c8] [&>blockquote]:pl-2 [&>blockquote]:text-[#7a7a7a] [&>code]:text-[11px] [&>code]:bg-[#e8e8e4] [&>code]:px-1 [&>pre]:overflow-x-auto [&>pre]:text-[11px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
      )}
      <p className="text-[10px] text-[#7a7a7a] font-medium leading-snug pr-5">{item.title}</p>
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

function Card({ item, onRemove, onEdit }: { item: ArchiveItem; onRemove: () => void; onEdit: () => void }) {
  if (item.imageUrl) return <ImageCard item={item} onRemove={onRemove} />
  if (FOLDER_TYPES.has(item.objectType)) return <FolderCard item={item} onRemove={onRemove} />
  return <TextCard item={item} onRemove={onRemove} onEdit={onEdit} />
}

// ── Main component ───────────────────────────────────────────────

export default function Collection() {
  const [items, setItems]       = useState<ArchiveItem[]>(load)
  const [folders, setFolders]   = useState<CollectionFolder[]>(loadFolders)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [search, setSearch]     = useState("")
  const [adding, setAdding]     = useState(false)
  const [editingItem, setEditingItem] = useState<ArchiveItem | null>(null)
  const [editDraft, setEditDraft] = useState({ title: "", content: "" })
  const [draft, setDraft]       = useState<{
    title: string; subtitle: string; objectType: ItemType; content: string; imageUrl: string; folderId: string
  }>({ title: "", subtitle: "", objectType: "note", content: "", imageUrl: "", folderId: "" })
  const [dragOver, setDragOver]           = useState(false)
  const [draggedId, setDraggedId]         = useState<string | null>(null)
  const [dragOverId, setDragOverId]       = useState<string | null>(null)
  const [folderDragOverId, setFolderDragOverId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function openEdit(item: ArchiveItem) {
    setEditingItem(item)
    setEditDraft({ title: item.title, content: item.content ?? item.subtitle ?? "" })
  }
  function saveEdit() {
    if (!editingItem) return
    const updated = items.map(i => i.id === editingItem.id
      ? { ...i, title: editDraft.title.trim() || i.title, content: editDraft.content }
      : i
    )
    setItems(updated); save(updated); setEditingItem(null)
  }

  function addFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const f: CollectionFolder = { id: Date.now().toString(), name }
    const updated = [...folders, f]; setFolders(updated); saveFolders(updated)
    setNewFolderName(""); setCreatingFolder(false)
  }
  function removeFolder(id: string) {
    const updated = folders.filter(f => f.id !== id); setFolders(updated); saveFolders(updated)
    if (activeFolderId === id) setActiveFolderId(null)
    // unassign items from deleted folder
    const updatedItems = items.map(i => i.folderId === id ? { ...i, folderId: undefined } : i)
    setItems(updatedItems); save(updatedItems)
  }

  function onCardDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = "move"
  }
  function onCardDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id !== draggedId) setDragOverId(id)
  }
  // Drag over a folder pill — assign item to that folder on drop
  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault(); setFolderDragOverId(folderId)
  }
  function onFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault(); setFolderDragOverId(null)
    if (!draggedId) return
    const updated = items.map(i => i.id === draggedId ? { ...i, folderId } : i)
    setItems(updated); save(updated); setDraggedId(null)
  }
  function onFolderDragLeave() { setFolderDragOverId(null) }

  function onCardDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return }
    const reordered = [...items]
    const fromIdx = reordered.findIndex(i => i.id === draggedId)
    const toIdx   = reordered.findIndex(i => i.id === targetId)
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setItems(reordered); save(reordered)
    setDraggedId(null); setDragOverId(null)
  }
  function onCardDragEnd() { setDraggedId(null); setDragOverId(null) }

  function loadFile(file: File) {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setDraft(d => ({ ...d, imageUrl: dataUrl, title: d.title || file.name.replace(/\.[^.]+$/, "") }))
    }
    reader.readAsDataURL(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
    e.target.value = ""
  }

  function onDropZone(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) loadFile(f)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(i => {
      if (activeFolderId && i.folderId !== activeFolderId) return false
      if (!q) return true
      return i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        (i.content ?? "").toLowerCase().includes(q)
    })
  }, [items, search, activeFolderId])

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
      folderId: draft.folderId || undefined,
      createdAt: new Date().toISOString(),
    }
    const updated = [next, ...items]
    setItems(updated); save(updated)
    setAdding(false)
    setDraft({ title: "", subtitle: "", objectType: "note", content: "", imageUrl: "", folderId: activeFolderId ?? "" })
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

        {/* Folder strip */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#f0f0f0] bg-white shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveFolderId(null)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold shrink-0 transition-colors ${!activeFolderId ? "bg-[#1d1d1f] text-white" : "text-[#7a7a7a] hover:text-[#1d1d1f]"}`}
          >
            All
          </button>
          {folders.map(f => (
            <div
              key={f.id}
              className={`group flex items-center gap-1 shrink-0 transition-colors ${
                folderDragOverId === f.id ? "bg-[#dde8f5] ring-1 ring-[#2c4470]" :
                activeFolderId === f.id ? "bg-[#eef1fb]" : "hover:bg-[#f5f5f7]"
              }`}
              onDragOver={e => onFolderDragOver(e, f.id)}
              onDragLeave={onFolderDragLeave}
              onDrop={e => onFolderDrop(e, f.id)}
            >
              <button
                onClick={() => setActiveFolderId(activeFolderId === f.id ? null : f.id)}
                className={`flex items-center gap-1 pl-2 pr-1 py-1 text-[10px] font-semibold ${activeFolderId === f.id ? "text-[#2c4470]" : "text-[#7a7a7a]"}`}
              >
                <FolderOpen size={10} /> {f.name}
              </button>
              <button onClick={() => removeFolder(f.id)} className="pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={8} className="text-[#7a7a7a]" />
              </button>
            </div>
          ))}
          {creatingFolder ? (
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addFolder(); if (e.key === "Escape") setCreatingFolder(false) }}
              onBlur={() => { if (newFolderName.trim()) addFolder(); else setCreatingFolder(false) }}
              placeholder="Folder name…"
              className="text-[10px] px-1.5 py-0.5 border border-[#c0c0c0] outline-none w-24 shrink-0"
            />
          ) : (
            <button onClick={() => setCreatingFolder(true)} className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#b0b0b0] hover:text-[#7a7a7a] shrink-0 transition-colors">
              <Plus size={9} /> Folder
            </button>
          )}
        </div>

        {/* Masonry board */}
        <div className="flex-1 overflow-y-auto bg-white">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a] py-16 px-8">
              <p className="text-[13px] font-medium text-[#1d1d1f]">Nothing here yet</p>
              <p className="text-[11px] mt-1">{activeFolderId ? "This folder is empty." : "Add images, text, links, or entities to build your board."}</p>
            </div>
          ) : (
            <div
              className="p-2"
              style={{ columns: "2", columnGap: "8px" }}
            >
              {filtered.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={e => onCardDragStart(e, item.id)}
                  onDragOver={e => onCardDragOver(e, item.id)}
                  onDrop={e => onCardDrop(e, item.id)}
                  onDragEnd={onCardDragEnd}
                  style={{
                    opacity: draggedId === item.id ? 0.35 : 1,
                    outline: dragOverId === item.id ? "2px solid #2c4470" : "none",
                    outlineOffset: "2px",
                    transition: "opacity 0.15s",
                  }}
                >
                  <Card item={item} onRemove={() => removeItem(item.id)} onEdit={() => openEdit(item)} />
                </div>
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

              {/* Folder */}
              {folders.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Folder</label>
                  <select
                    value={draft.folderId}
                    onChange={e => setDraft(d => ({ ...d, folderId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-[13px] border border-[#e0e0e0] bg-white focus:outline-none"
                  >
                    <option value="">— None —</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}

              {/* Image — upload or URL */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Image</label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileInput} />

                {draft.imageUrl ? (
                  /* Preview */
                  <div className="mt-1 relative">
                    <img src={draft.imageUrl} alt="" className="w-full max-h-40 object-cover block" />
                    <button
                      onClick={() => setDraft(d => ({ ...d, imageUrl: "" }))}
                      className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center bg-black/50 text-white"
                    >
                      <X size={9} />
                    </button>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDropZone}
                    className={`mt-1 flex flex-col items-center justify-center gap-1.5 py-5 border cursor-pointer transition-colors ${
                      dragOver ? "border-[#2c4470] bg-[#f0f4fc]" : "border-dashed border-[#d0d0d0] hover:border-[#2c4470]/50 hover:bg-[#fafafa]"
                    }`}
                  >
                    <Upload size={16} className="text-[#b0b0b0]" />
                    <span className="text-[11px] text-[#7a7a7a]">Drop image or <span className="underline">browse</span></span>
                  </div>
                )}

                {/* URL fallback */}
                {!draft.imageUrl && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <ImageIcon size={11} className="text-[#b0b0b0] shrink-0" />
                    <input
                      value={draft.imageUrl}
                      onChange={e => setDraft(d => ({ ...d, imageUrl: e.target.value }))}
                      placeholder="or paste image URL…"
                      className="flex-1 px-2 py-1 text-[11px] border border-[#e8e8e8] focus:outline-none focus:border-[#2c4470]/40 bg-transparent"
                    />
                  </div>
                )}
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

      {/* ── Edit item modal ── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setEditingItem(null)}>
          <div className="bg-white shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Edit note</h2>
              <button onClick={() => setEditingItem(null)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Title</label>
                <input
                  autoFocus
                  value={editDraft.title}
                  onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#a0a0a0]">Content — markdown supported</label>
                <textarea
                  value={editDraft.content}
                  onChange={e => setEditDraft(d => ({ ...d, content: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && e.metaKey) saveEdit() }}
                  rows={8}
                  className="mt-1 w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 resize-none font-mono"
                  placeholder="# Heading&#10;**bold**, _italic_, - list items…"
                />
              </div>
              <button onClick={saveEdit} className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
