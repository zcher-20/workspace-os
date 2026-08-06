import { useState, useMemo, useRef } from "react"
import { Plus, X, Clock, Search, ExternalLink, Pencil } from "lucide-react"

type Status = "Exploring" | "Applying" | "Interview" | "Offer" | "Archived"
const COLUMNS: Status[] = ["Exploring", "Applying", "Interview", "Offer", "Archived"]

const LS_NAMES = "workspace:column-names"
const DEFAULT_NAMES: Record<Status, string> = { Exploring: "Exploring", Applying: "Applying", Interview: "Interview", Offer: "Offer", Archived: "Archived" }
function loadNames(): Record<Status, string> { try { return { ...DEFAULT_NAMES, ...JSON.parse(localStorage.getItem(LS_NAMES) || "{}") } } catch { return { ...DEFAULT_NAMES } } }
function saveNames(n: Record<Status, string>) { localStorage.setItem(LS_NAMES, JSON.stringify(n)) }

const STATUS_STYLES: Record<Status, { bg: string; text: string; dot: string }> = {
  Exploring: { bg: "bg-[#f0f0f0]",   text: "text-[#7a7a7a]",   dot: "bg-[#7a7a7a]" },
  Applying:  { bg: "bg-[#eef1fb]",   text: "text-[#1e3a8a]",   dot: "bg-[#1e3a8a]" },
  Interview: { bg: "bg-[#fef3e8]",   text: "text-[#92400e]",   dot: "bg-[#c4856a]" },
  Offer:     { bg: "bg-[#ecfdf5]",   text: "text-[#065f46]",   dot: "bg-[#5b9b8a]" },
  Archived:  { bg: "bg-[#f5f5f7]",   text: "text-[#7a7a7a]",   dot: "bg-[#c0c0c0]" },
}

interface Opportunity {
  id: string
  title: string
  organization: string
  deadline: string
  status: Status
  notes: string
  link: string
  createdAt: string
}

const LS_KEY = "workspace:opportunities"
function load(): Opportunity[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] } }
function save(o: Opportunity[]) { localStorage.setItem(LS_KEY, JSON.stringify(o)) }

function formatDate(iso: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function isOverdue(deadline: string) { return deadline && new Date(deadline) < new Date() }

const EMPTY = { title: "", organization: "", deadline: "", status: "Exploring" as Status, notes: "", link: "" }

export default function Opportunities() {
  const [items, setItems]       = useState<Opportunity[]>(load)
  const [search, setSearch]     = useState("")
  const [adding, setAdding]     = useState(false)
  const [draft, setDraft]       = useState(EMPTY)
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [colNames, setColNames] = useState<Record<Status, string>>(loadNames)
  const [editingCol, setEditingCol] = useState<Status | null>(null)
  const colInputRef = useRef<HTMLInputElement>(null)

  function startEditCol(col: Status) {
    setEditingCol(col)
    setTimeout(() => colInputRef.current?.select(), 0)
  }
  function commitColName(col: Status, value: string) {
    const name = value.trim() || DEFAULT_NAMES[col]
    const next = { ...colNames, [col]: name }
    setColNames(next); saveNames(next)
    setEditingCol(null)
  }

  function mutate(updated: Opportunity[]) { setItems(updated); save(updated) }

  function addItem() {
    if (!draft.title.trim()) return
    const item: Opportunity = { id: Date.now().toString(), ...draft, title: draft.title.trim(), createdAt: new Date().toISOString() }
    mutate([item, ...items])
    setAdding(false); setDraft(EMPTY)
  }

  function updateStatus(id: string, status: Status) {
    mutate(items.map(i => i.id === id ? { ...i, status } : i))
    if (selected?.id === id) setSelected(s => s ? { ...s, status } : null)
  }

  function removeItem(id: string) {
    mutate(items.filter(i => i.id !== id))
    if (selected?.id === id) setSelected(null)
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

  const selectedItem = selected ? items.find(i => i.id === selected.id) ?? null : null

  function OppCard({ opp }: { opp: Opportunity }) {
    const overdue = isOverdue(opp.deadline)
    return (
      <div
        className="group bg-white rounded-xl border border-[#e0e0e0] p-4 hover:border-[#2c4470]/30 transition-colors cursor-pointer"
        onClick={() => setSelected(opp)}
      >
        <div className="flex items-start justify-between mb-2">
          <p className="text-[13px] font-semibold text-[#1d1d1f] line-clamp-2 flex-1 pr-2">{opp.title}</p>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
            {opp.link && (
              <a href={opp.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="p-0.5 text-[#7a7a7a] hover:text-[#2c4470] transition-colors">
                <ExternalLink size={11} />
              </a>
            )}
            <button onClick={e => { e.stopPropagation(); removeItem(opp.id) }}>
              <X size={11} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
            </button>
          </div>
        </div>
        {opp.organization && <p className="text-[11px] text-[#7a7a7a] mb-2">{opp.organization}</p>}
        <div className="flex items-center justify-between">
          {opp.deadline && (
            <div className={`flex items-center gap-1 text-[11px] ${overdue ? "text-[#92400e]" : "text-[#7a7a7a]"}`}>
              <Clock size={9} />
              {overdue ? "Overdue · " : ""}{formatDate(opp.deadline)}
            </div>
          )}
          {opp.link && (
            <ExternalLink size={9} className="text-[#c0c0c0] ml-auto" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search opportunities…"
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
        </div>
        <button onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors">
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Kanban */}
        <div className="flex gap-3 flex-1 overflow-auto">
          {COLUMNS.filter(c => c !== "Archived").map(col => (
            <div key={col} className="flex flex-col gap-2 w-52 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[col].dot}`} />
                {editingCol === col ? (
                  <input
                    ref={colInputRef}
                    defaultValue={colNames[col]}
                    className="text-[14px] font-semibold tracking-tight text-[#7a7a7a] bg-transparent border-b border-[#7a7a7a] outline-none w-24"
                    onBlur={e => commitColName(col, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitColName(col, (e.target as HTMLInputElement).value) }}
                    autoFocus
                  />
                ) : (
                  <button
                    className="group/col flex items-center gap-1 text-[14px] font-semibold tracking-tight text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors"
                    onClick={() => startEditCol(col)}
                    title="Click to rename"
                  >
                    {colNames[col]}
                    <Pencil size={10} className="opacity-0 group-hover/col:opacity-60 transition-opacity" />
                  </button>
                )}
                <span className="ml-auto text-[10px] text-[#c0c0c0]">{byStatus[col].length}</span>
              </div>
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                {byStatus[col].map(opp => <OppCard key={opp.id} opp={opp} />)}
                {byStatus[col].length === 0 && (
                  <div className="border border-dashed border-[#e0e0e0] rounded-xl px-4 py-6 text-center text-[11px] text-[#c0c0c0]">Empty</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div className="w-64 shrink-0 bg-white rounded-2xl border border-[#e0e0e0] p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-start justify-between">
              <h3 className="text-[14px] font-semibold text-[#1d1d1f] leading-snug flex-1 pr-2">{selectedItem.title}</h3>
              <button onClick={() => setSelected(null)}><X size={14} className="text-[#7a7a7a]" /></button>
            </div>

            {selectedItem.organization && <p className="text-[12px] text-[#7a7a7a] -mt-2">{selectedItem.organization}</p>}

            {/* Link */}
            {selectedItem.link && (
              <a href={selectedItem.link} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-[12px] text-[#2c4470] hover:underline truncate">
                <ExternalLink size={11} />
                <span className="truncate">{selectedItem.link.replace(/^https?:\/\//, "")}</span>
              </a>
            )}

            {/* Status */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Status</p>
              <div className="flex flex-col gap-1">
                {COLUMNS.map(s => (
                  <button key={s} onClick={() => updateStatus(selectedItem.id, s)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${selectedItem.status === s ? `${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} font-semibold` : "hover:bg-[#f5f5f7] text-[#7a7a7a]"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {selectedItem.deadline && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-1">Deadline</p>
                <p className={`text-[13px] ${isOverdue(selectedItem.deadline) ? "text-[#92400e] font-medium" : "text-[#1d1d1f]"}`}>
                  {formatDate(selectedItem.deadline)}{isOverdue(selectedItem.deadline) ? " · Overdue" : ""}
                </p>
              </div>
            )}

            {selectedItem.notes && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-1">Notes</p>
                <p className="text-[12px] text-[#1d1d1f] leading-relaxed">{selectedItem.notes}</p>
              </div>
            )}

            <button onClick={() => removeItem(selectedItem.id)} className="mt-auto text-[11px] text-[#7a7a7a] hover:text-red-600 transition-colors text-left">
              Delete opportunity
            </button>
          </div>
        )}
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
