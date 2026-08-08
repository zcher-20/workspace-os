import { useState, useMemo, useRef, useEffect } from "react"
import { Plus, X, Clock, Search, ExternalLink, Pencil, ChevronUp, CheckCircle2, Circle } from "lucide-react"

type Status = "Exploring" | "Applying" | "Interview" | "Offer" | "Archived"
const COLUMNS: Status[] = ["Exploring", "Applying", "Interview", "Offer", "Archived"]

const LS_NAMES = "workspace:column-names"
const DEFAULT_NAMES: Record<Status, string> = { Exploring: "Exploring", Applying: "Applying", Interview: "Interview", Offer: "Offer", Archived: "Archived" }
function loadNames(): Record<Status, string> { try { return { ...DEFAULT_NAMES, ...JSON.parse(localStorage.getItem(LS_NAMES) || "{}") } } catch { return { ...DEFAULT_NAMES } } }
function saveNames(n: Record<Status, string>) { localStorage.setItem(LS_NAMES, JSON.stringify(n)) }

const STATUS_STYLES: Record<Status, { bg: string; text: string; dot: string; border: string }> = {
  Exploring: { bg: "bg-[#f0f0f0]",   text: "text-[#7a7a7a]",   dot: "bg-[#7a7a7a]",   border: "border-[#d8d8d8]" },
  Applying:  { bg: "bg-[#eef1fb]",   text: "text-[#1e3a8a]",   dot: "bg-[#1e3a8a]",   border: "border-[#b8c8f0]" },
  Interview: { bg: "bg-[#fef3e8]",   text: "text-[#92400e]",   dot: "bg-[#c4856a]",   border: "border-[#f0d0a8]" },
  Offer:     { bg: "bg-[#ecfdf5]",   text: "text-[#065f46]",   dot: "bg-[#5b9b8a]",   border: "border-[#a8dcc8]" },
  Archived:  { bg: "bg-[#f5f5f7]",   text: "text-[#7a7a7a]",   dot: "bg-[#c0c0c0]",   border: "border-[#e0e0e0]" },
}

interface Opportunity {
  id: string; title: string; organization: string; deadline: string
  status: Status; notes: string; link: string; logo?: string; done?: boolean; createdAt: string
}

const LS_KEY = "workspace:opportunities"
function load(): Opportunity[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] } }
function save(o: Opportunity[]) { localStorage.setItem(LS_KEY, JSON.stringify(o)) }

function formatDate(iso: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function isOverdue(deadline: string) { return !!deadline && new Date(deadline) < new Date() }

const EMPTY = { title: "", organization: "", deadline: "", status: "Exploring" as Status, notes: "", link: "", logo: "" }

const AVATAR_COLORS = ["#8b3a3a", "#524470", "#3d6060", "#723048", "#685840", "#7a5540", "#2c4470"]
function avatarColor(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getLogoSources(opp: Opportunity): string[] {
  const srcs: string[] = []
  if (opp.logo) srcs.push(opp.logo)
  if (opp.link) {
    try {
      const host = new URL(opp.link).hostname
      if (!opp.logo) srcs.push(`https://logo.clearbit.com/${host}`)
      srcs.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`)
    } catch { /* invalid URL */ }
  }
  return srcs
}

function OrgLogo({ opp, size = 28 }: { opp: Opportunity; size?: number }) {
  const sources = getLogoSources(opp)
  const key = sources.join("|")
  const [idx, setIdx] = useState(0)
  useEffect(() => { setIdx(0) }, [key])

  const letter = (opp.organization || opp.title || "?")[0].toUpperCase()
  const bg = avatarColor(opp.organization || opp.title)
  const src = sources[idx]

  if (src) {
    return (
      <img src={src} onError={() => setIdx(i => i + 1)} alt=""
        className="rounded-full object-contain bg-white border border-[#f0f0f0] shrink-0"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full shrink-0"
      style={{ width: size, height: size, background: bg }} />
  )
}

const INPUT_CLS = "w-full bg-transparent outline-none border-b border-[#ebebeb] focus:border-[#b0b0b0] transition-colors text-[13px] text-[#1d1d1f] placeholder:text-[#c8c8c8] py-1"
const LABEL_CLS = "text-[10px] font-semibold uppercase tracking-widest text-[#b0b0b0] mb-1"

// ── Expanded card ────────────────────────────────────────────────
interface ExpandedCardProps {
  opp: Opportunity
  isNew?: boolean
  onChange: (patch: Partial<Opportunity>) => void
  onClose: () => void
  onRemove: () => void
}
function ExpandedCard({ opp, isNew, onChange, onClose, onRemove }: ExpandedCardProps) {
  const [editing, setEditing] = useState(!!isNew)
  const overdue = isOverdue(opp.deadline)
  const shortLink = opp.link
    ? (() => { try { return new URL(opp.link).hostname.replace(/^www\./, "") } catch { return opp.link } })()
    : null

  return (
    <div className="bg-white rounded-2xl border border-[#2c4470]/20 shadow-lg overflow-hidden">

      <div className="p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <OrgLogo opp={opp} size={34} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[#1d1d1f] leading-snug">
              {opp.title || <span className="text-[#c0c0c0] font-normal italic">Untitled</span>}
            </p>
            {opp.organization && (
              <p className="text-[12px] font-medium text-[#5a5a5a] mt-0.5 truncate">{opp.organization}</p>
            )}
            {shortLink && (
              <a href={opp.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="block mt-1 text-[11px] text-[#8a8a8a] underline underline-offset-2 truncate hover:text-[#5a5a5a] transition-colors">
                {shortLink}
              </a>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setEditing(e => !e)}
              className={`p-1 rounded-lg transition-colors ${editing ? "bg-[#2c4470]/10 text-[#2c4470]" : "hover:bg-[#f0f0f0] text-[#b0b0b0]"}`}>
              <Pencil size={13} />
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f0f0f0] transition-colors">
              <ChevronUp size={13} className="text-[#b0b0b0]" />
            </button>
          </div>
        </div>

        {/* Meta row: deadline */}
        {opp.deadline && (
          <div className="flex items-center gap-1">
            <span className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? "text-[#92400e]" : "text-[#7a7a7a]"}`}>
              <Clock size={10} />{overdue ? "Overdue · " : ""}{formatDate(opp.deadline)}
            </span>
          </div>
        )}

        {/* Notes display */}
        {opp.notes && !editing && (
          <div className="bg-[#fafafa] rounded-xl px-3 py-2.5 border border-[#f0f0f0]">
            <p className="text-[12px] text-[#4a4a4a] whitespace-pre-wrap leading-relaxed">{opp.notes}</p>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="flex flex-col gap-3 pt-1 border-t border-[#f5f5f5]">
            <div>
              <p className={LABEL_CLS}>Title</p>
              <input value={opp.title} onChange={e => onChange({ title: e.target.value })}
                placeholder="Opportunity title" className={INPUT_CLS} />
            </div>
            <div>
              <p className={LABEL_CLS}>Organization</p>
              <input value={opp.organization} onChange={e => onChange({ organization: e.target.value })}
                placeholder="Company or institution" className={INPUT_CLS} />
            </div>
            <div>
              <p className={LABEL_CLS}>Link</p>
              <input value={opp.link} onChange={e => onChange({ link: e.target.value })}
                placeholder="https://…" className={INPUT_CLS} />
            </div>
            <div>
              <p className={LABEL_CLS}>Deadline</p>
              <input type="date" value={opp.deadline} onChange={e => onChange({ deadline: e.target.value })}
                className={`${INPUT_CLS} ${overdue ? "text-[#92400e]" : ""}`} />
            </div>
            <div>
              <p className={LABEL_CLS}>Status</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLUMNS.map(s => {
                  const st = STATUS_STYLES[s]
                  const active = opp.status === s
                  return (
                    <button key={s} onClick={() => onChange({ status: s })}
                      className={[
                        "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all",
                        active ? `${st.bg} ${st.text} ${st.border}` : "bg-white text-[#b0b0b0] border-[#e8e8e8] hover:border-[#c0c0c0] hover:text-[#7a7a7a]"
                      ].join(" ")}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className={LABEL_CLS}>Notes</p>
              <textarea value={opp.notes} onChange={e => onChange({ notes: e.target.value })}
                rows={3} placeholder="Add notes…"
                className="w-full bg-[#fafafa] rounded-xl border border-[#ebebeb] focus:border-[#d0d0d0] outline-none text-[12px] text-[#1d1d1f] px-3 py-2 resize-none transition-colors placeholder:text-[#c8c8c8]" />
            </div>
            <div>
              <p className={LABEL_CLS}>Logo URL <span className="normal-case font-normal opacity-60">(optional)</span></p>
              <input value={opp.logo ?? ""} onChange={e => onChange({ logo: e.target.value })}
                placeholder="Auto-detected from link" className={INPUT_CLS} />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[#f5f5f5]">
              <button onClick={onRemove} className="text-[11px] text-[#c0c0c0] hover:text-red-500 transition-colors font-medium">
                Delete
              </button>
              <p className="text-[10px] text-[#d0d0d0]">Saves automatically</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Compact card ─────────────────────────────────────────────────
interface OppCardProps {
  opp: Opportunity
  isBeingDragged: boolean
  onExpand: () => void
  onRemove: (e: React.MouseEvent) => void
  onToggleDone: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}
function OppCard({ opp, isBeingDragged, onExpand, onRemove, onToggleDone, onDragStart, onDragEnd }: OppCardProps) {
  const overdue = isOverdue(opp.deadline) && !opp.done
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onExpand}
      className={[
        "group bg-white rounded-2xl border p-4 cursor-grab active:cursor-grabbing",
        "hover:shadow-md transition-all select-none",
        opp.done ? "border-[#d0e8d8] opacity-60" : "border-[#e4e4e8] hover:border-[#2c4470]/40",
        isBeingDragged ? "opacity-30 scale-[0.97] shadow-none" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <OrgLogo opp={opp} size={34} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className={`text-[14px] font-semibold line-clamp-2 flex-1 leading-snug ${opp.done ? "line-through text-[#9a9a9a]" : "text-[#1d1d1f]"}`}>
              {opp.title || <span className="text-[#c0c0c0] font-normal italic">Untitled</span>}
            </p>
            <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
              <button
                onClick={e => { e.stopPropagation(); onToggleDone(e) }}
                className="p-0.5 transition-colors"
                title={opp.done ? "Mark undone" : "Mark done"}
              >
                {opp.done
                  ? <CheckCircle2 size={14} className="text-[#5b9b6a]" />
                  : <Circle size={14} className="text-[#d0d0d0] opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#5b9b6a]" />
                }
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {opp.link && (
                  <a href={opp.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="p-0.5 text-[#a0a0a0] hover:text-[#2c4470] transition-colors">
                    <ExternalLink size={12} />
                  </a>
                )}
                <button onClick={e => { e.stopPropagation(); onRemove(e) }}
                  className="p-0.5 text-[#a0a0a0] hover:text-[#1d1d1f] transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
          {opp.organization && (
            <p className="text-[12px] text-[#5a5a5a] mt-1.5 truncate font-medium">{opp.organization}</p>
          )}
          {opp.deadline && (
            <div className={`flex items-center gap-1 text-[11px] mt-2 font-medium ${overdue ? "text-[#92400e]" : "text-[#7a7a7a]"}`}>
              <Clock size={10} />
              {overdue ? "Overdue · " : ""}{formatDate(opp.deadline)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function Opportunities() {
  const [items,        setItems]        = useState<Opportunity[]>(load)
  const [search,       setSearch]       = useState("")
  const [adding,       setAdding]       = useState(false)
  const [draft,        setDraft]        = useState(EMPTY)
  const [colNames,     setColNames]     = useState<Record<Status, string>>(loadNames)
  const [editingCol,   setEditingCol]   = useState<Status | null>(null)
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dragOverCol,  setDragOverCol]  = useState<Status | null>(null)
  const [newCardId,    setNewCardId]     = useState<string | null>(null)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [pageNotes,    setPageNotes]    = useState(() => {
    try { return localStorage.getItem("workspace:opp-notes") || "" } catch { return "" }
  })

  const colInputRef = useRef<HTMLInputElement>(null)

  function startEditCol(col: Status) {
    setEditingCol(col); setTimeout(() => colInputRef.current?.select(), 0)
  }
  function commitColName(col: Status, value: string) {
    const name = value.trim() || DEFAULT_NAMES[col]
    const next = { ...colNames, [col]: name }
    setColNames(next); saveNames(next); setEditingCol(null)
  }

  function mutate(updated: Opportunity[]) { setItems(updated); save(updated) }

  function addItem() {
    if (!draft.title.trim()) return
    mutate([{ id: Date.now().toString(), ...draft, title: draft.title.trim(), createdAt: new Date().toISOString() }, ...items])
    setAdding(false); setDraft(EMPTY)
  }

  function updateItem(id: string, patch: Partial<Opportunity>) {
    mutate(items.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function startInlineAdd(col: Status) {
    const newId = Date.now().toString()
    mutate([{ id: newId, title: "", organization: "", deadline: "", status: col, notes: "", link: "", createdAt: new Date().toISOString() }, ...items])
    setExpandedId(newId)
    setNewCardId(newId)
  }

  function removeItem(id: string) {
    mutate(items.filter(i => i.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function onDrop(col: Status) {
    if (draggingId) updateItem(draggingId, { status: col })
    setDraggingId(null); setDragOverCol(null)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(i => !q || i.title.toLowerCase().includes(q) || i.organization.toLowerCase().includes(q))
  }, [items, search])

  const byStatus = useMemo(() => {
    const m: Record<Status, Opportunity[]> = { Exploring: [], Applying: [], Interview: [], Offer: [], Archived: [] }
    for (const i of filtered) m[i.status].push(i)
    return m
  }, [filtered])

  return (
    <div className="flex flex-col px-8 pt-10 overflow-y-auto h-full [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#d8d8d8] [&::-webkit-scrollbar-thumb]:rounded-full">
      {/* Hero */}
      <h1 className="text-[22px] font-bold tracking-tight text-[#1d1d1f] mb-8 shrink-0">Applications & Opportunities</h1>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-12 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-0 top-1/2 -translate-y-1/2 text-[#b0b0b0]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-5 pr-2 py-1.5 text-[12px] bg-transparent border-b border-[#e0e0e0] focus:border-[#a0a0a0] focus:outline-none transition-colors placeholder:text-[#c0c0c0]" />
        </div>
        <button onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors">
          <Plus size={13} /> Add
        </button>
      </div>

      {/* Kanban */}
      <div className="flex gap-3 shrink-0 overflow-x-auto pb-4 [&::-webkit-scrollbar]:h-0">
        {COLUMNS.map(col => {
          const isOver = dragOverCol === col && draggingId !== null
          return (
            <div key={col} className={`flex flex-col shrink-0 ${col === "Archived" ? "w-52 opacity-70" : "w-64"}`}>

              {/* Column header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[col].dot}`} />
                {editingCol === col ? (
                  <input ref={colInputRef} defaultValue={colNames[col]}
                    className="text-[13px] font-semibold text-[#7a7a7a] bg-transparent border-b border-[#7a7a7a] outline-none w-24"
                    onBlur={e => commitColName(col, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitColName(col, (e.target as HTMLInputElement).value) }}
                    autoFocus
                  />
                ) : (
                  <button className="group/col flex items-center gap-1 text-[13px] font-semibold text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors"
                    onClick={() => startEditCol(col)}>
                    {colNames[col]}
                    <Pencil size={9} className="opacity-0 group-hover/col:opacity-50 transition-opacity" />
                  </button>
                )}
                <span className="text-[10px] text-[#c0c0c0]">{byStatus[col].length}</span>
                <button onClick={() => startInlineAdd(col)}
                  className="ml-auto p-0.5 rounded hover:bg-[#f0f0f0] text-[#c0c0c0] hover:text-[#7a7a7a] transition-colors">
                  <Plus size={13} />
                </button>
              </div>

              {/* Drop zone / card list */}
              <div
                className={[
                  "flex flex-col gap-2 rounded-xl transition-colors p-1 -m-1",
                  isOver ? "bg-[#f0f4ff] ring-1 ring-[#2c4470]/20" : "",
                ].join(" ")}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col) }}
                onDragLeave={e => {
                  if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))
                    setDragOverCol(null)
                }}
                onDrop={e => { e.preventDefault(); onDrop(col) }}
              >
                {byStatus[col].map(opp =>
                  expandedId === opp.id ? (
                    <ExpandedCard
                      key={opp.id}
                      opp={opp}
                      isNew={newCardId === opp.id}
                      onChange={patch => updateItem(opp.id, patch)}
                      onClose={() => {
                        if (newCardId === opp.id && !opp.title.trim()) removeItem(opp.id)
                        setExpandedId(null); setNewCardId(null)
                      }}
                      onRemove={() => { removeItem(opp.id); setNewCardId(null) }}
                    />
                  ) : (
                    <OppCard
                      key={opp.id}
                      opp={opp}
                      isBeingDragged={draggingId === opp.id}
                      onExpand={() => setExpandedId(opp.id)}
                      onRemove={e => { e.stopPropagation(); removeItem(opp.id) }}
                      onToggleDone={e => { e.stopPropagation(); updateItem(opp.id, { done: !opp.done }) }}
                      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDraggingId(opp.id) }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                    />
                  )
                )}

                {byStatus[col].length === 0 && (
                  <div className={[
                    "border border-dashed rounded-xl px-4 py-6 text-center text-[11px] text-[#c0c0c0] transition-colors",
                    isOver ? "border-[#2c4470]/40 text-[#2c4470]/50" : "border-[#e0e0e0]",
                  ].join(" ")}>
                    {isOver ? "Drop here" : "Empty"}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Notes panel */}
      <div className="shrink-0 pt-10 pb-8">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[18px] font-bold text-[#1d1d1f] tracking-tight">Notes</h2>
          <span className="text-[11px] text-[#c0c0c0]">{pageNotes.length > 0 ? `${pageNotes.split(/\n/).length} line${pageNotes.split(/\n/).length !== 1 ? "s" : ""}` : "empty"}</span>
        </div>
        <textarea
          value={pageNotes}
          onChange={e => { setPageNotes(e.target.value); localStorage.setItem("workspace:opp-notes", e.target.value) }}
          placeholder="Write your thoughts — priorities, follow-ups, impressions…"
          className="w-full resize-none bg-[#fafafa] rounded-2xl outline-none text-[14px] text-[#1d1d1f] leading-relaxed px-5 py-4 placeholder:text-[#d0d0d0] min-h-[140px] focus:bg-white transition-colors"
          rows={6}
        />
      </div>

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add opportunity</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Title</label>
                <input autoFocus value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Role or opportunity name"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Organization</label>
                <input value={draft.organization} onChange={e => setDraft(d => ({ ...d, organization: e.target.value }))}
                  placeholder="Company or institution"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Link</label>
                <input value={draft.link} onChange={e => setDraft(d => ({ ...d, link: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">
                  Logo URL <span className="normal-case font-normal text-[#c0c0c0]">(optional)</span>
                </label>
                <input value={draft.logo} onChange={e => setDraft(d => ({ ...d, logo: e.target.value }))}
                  placeholder="Auto-detected from link if blank"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Deadline</label>
                <input type="date" value={draft.deadline} onChange={e => setDraft(d => ({ ...d, deadline: e.target.value }))}
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Status</label>
                <select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as Status }))}
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none">
                  {COLUMNS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Notes</label>
                <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                  rows={2} placeholder="Any notes…"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none resize-none" />
              </div>
              <button onClick={addItem} disabled={!draft.title.trim()}
                className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
