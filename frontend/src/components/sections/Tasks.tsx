import { useState, useRef, useEffect } from "react"
import { X, Check, ExternalLink, ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react"

// ── Opportunities (shared via localStorage) ───────────────────────
type OppStatus = "Exploring" | "Applying" | "Interview" | "Offer" | "Archived"
interface Opportunity {
  id: string; title: string; organization: string; deadline: string
  status: OppStatus; notes: string; link: string; logo?: string; done?: boolean; createdAt: string
}
const STATUS_COLORS: Record<OppStatus, { dot: string; bg: string; text: string }> = {
  Exploring: { dot: "#c0c0c0", bg: "#f0f0f0", text: "#7a7a7a" },
  Applying:  { dot: "#1e3a8a", bg: "#eef1fb", text: "#1e3a8a" },
  Interview: { dot: "#c4856a", bg: "#fef3e8", text: "#92400e" },
  Offer:     { dot: "#5b9b8a", bg: "#ecfdf5", text: "#065f46" },
  Archived:  { dot: "#c0c0c0", bg: "#f5f5f7", text: "#9a9a9a" },
}
function loadOpps(): Opportunity[] {
  try { return JSON.parse(localStorage.getItem("workspace:opportunities") || "[]") } catch { return [] }
}
function saveOpps(o: Opportunity[]) { localStorage.setItem("workspace:opportunities", JSON.stringify(o)) }

const LS_HIDDEN = "workspace:timeline-hidden"
function loadHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || "[]") as string[]) } catch { return new Set() }
}
function saveHidden(h: Set<string>) { localStorage.setItem(LS_HIDDEN, JSON.stringify([...h])) }

const AVATAR_COLORS = ["#8b3a3a", "#524470", "#3d6060", "#723048", "#685840", "#7a5540", "#2c4470"]
function avatarBg(str: string) {
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function OppLogo({ opp, size = 20 }: { opp: Opportunity; size?: number }) {
  const sources: string[] = []
  if (opp.logo) sources.push(opp.logo)
  if (opp.link) {
    try {
      const host = new URL(opp.link).hostname
      if (!opp.logo) sources.push(`https://logo.clearbit.com/${host}`)
      sources.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`)
    } catch {}
  }
  const [idx, setIdx] = useState(0)
  const key = sources.join("|")
  useEffect(() => { setIdx(0) }, [key])
  const src = sources[idx]
  if (src) {
    return <img src={src} onError={() => setIdx(i => i + 1)} alt=""
      className="rounded-full object-contain bg-white border border-[#f0f0f0] shrink-0"
      style={{ width: size, height: size }} />
  }
  const letter = (opp.organization || opp.title || "?")[0].toUpperCase()
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: avatarBg(opp.organization || opp.title), fontSize: size * 0.45 }}>
      {letter}
    </div>
  )
}

// ── Date helpers ──────────────────────────────────────────────────
function daysBetween(a: Date, b: Date) { return Math.floor((b.getTime() - a.getTime()) / 86_400_000) }
function startOfDay(d: Date)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function shiftMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function shiftDate(iso: string, days: number, dateOnly = false): string {
  const d = new Date(iso); d.setDate(d.getDate() + days)
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString()
}
function fmtDate(iso: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function navTo(section: string) {
  window.dispatchEvent(new CustomEvent("workspace:navigate", { detail: section }))
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function shortLink(url: string) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    const path = u.pathname.length > 1 ? u.pathname.slice(0, 18) + (u.pathname.length > 19 ? "…" : "") : ""
    return host + path
  } catch { return url }
}

// ── Timeline ──────────────────────────────────────────────────────
const DAY_W = 36

// origLeft/origWidth stored so onMove can reposition without React re-renders
type DragState = {
  id: string; type: "move" | "resize"; startX: number
  origCreatedAt: string; origDeadline: string
  origLeft: number; origWidth: number
}

const STATUSES: OppStatus[] = ["Exploring", "Applying", "Interview", "Offer", "Archived"]

function Timeline() {
  const [opps,   setOpps]   = useState<Opportunity[]>(loadOpps)
  const [hidden, setHidden] = useState<Set<string>>(loadHidden)
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  const dragRef  = useRef<DragState | null>(null)
  const barRefs  = useRef<Map<string, HTMLDivElement>>(new Map())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<{ org: string; status: OppStatus; createdAt: string; deadline: string; link: string }>({
    org: "", status: "Exploring", createdAt: "", deadline: "", link: ""
  })
  const [statusPopup, setStatusPopup] = useState<{ id: string } | null>(null)

  useEffect(() => {
    function refresh() { setOpps(loadOpps()) }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [])

  useEffect(() => {
    if (!statusPopup) return
    function close() { setStatusPopup(null) }
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [statusPopup])

  // Direct DOM manipulation — zero React re-renders during drag
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const dr = dragRef.current
      if (!dr) return
      const dx = e.clientX - dr.startX
      const el = barRefs.current.get(dr.id)
      if (!el) return
      if (dr.type === "move") {
        el.style.left = `${Math.max(0, dr.origLeft + dx)}px`
      } else {
        el.style.width = `${Math.max(DAY_W * 2, dr.origWidth + dx)}px`
      }
    }
    function onUp(e: MouseEvent) {
      const dr = dragRef.current
      if (!dr) return
      const dayDelta = Math.round((e.clientX - dr.startX) / DAY_W)
      if (dayDelta !== 0) {
        const { id, type, origCreatedAt, origDeadline } = dr
        setOpps(prev => {
          const next = prev.map(o => {
            if (o.id !== id) return o
            if (type === "move") return {
              ...o,
              createdAt: origCreatedAt ? shiftDate(origCreatedAt, dayDelta) : o.createdAt,
              deadline:  origDeadline  ? shiftDate(origDeadline,  dayDelta, true) : o.deadline,
            }
            return { ...o, deadline: origDeadline ? shiftDate(origDeadline, dayDelta, true) : o.deadline }
          })
          saveOpps(next); return next
        })
      } else {
        // Snap back to original position if no net movement
        const el = barRefs.current.get(dr.id)
        if (el) { el.style.left = `${dr.origLeft}px`; el.style.width = `${dr.origWidth}px` }
      }
      dragRef.current = null
      document.body.style.cursor = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])

  function startDrag(e: React.MouseEvent, opp: Opportunity, type: "move" | "resize", el: HTMLDivElement) {
    e.preventDefault(); e.stopPropagation()
    const rect = el.getBoundingClientRect()
    const parentRect = el.parentElement!.parentElement!.getBoundingClientRect()
    dragRef.current = {
      id: opp.id, type, startX: e.clientX,
      origCreatedAt: opp.createdAt, origDeadline: opp.deadline,
      origLeft: rect.left - parentRect.left,
      origWidth: rect.width,
    }
    document.body.style.cursor = type === "resize" ? "ew-resize" : "grabbing"
  }

  function hideOpp(id: string) {
    setHidden(prev => { const next = new Set(prev).add(id); saveHidden(next); return next })
  }

  function addNew() {
    const today = new Date().toISOString().slice(0, 10)
    const id = uid()
    const stub: Opportunity = { id, title: "", organization: "", deadline: today, status: "Exploring", notes: "", link: "", createdAt: today }
    setOpps(prev => { const next = [...prev, stub]; saveOpps(next); return next })
    setHidden(prev => { const next = new Set(prev); next.delete(id); return next })
    setEditFields({ org: "", status: "Exploring", createdAt: today, deadline: today, link: "" })
    setEditingId(id)
  }

  function saveEdit() {
    if (!editingId) return
    setOpps(prev => {
      const next = prev.map(o => o.id !== editingId ? o : {
        ...o,
        organization: editFields.org,
        title: editFields.org,
        status: editFields.status,
        createdAt: editFields.createdAt,
        deadline: editFields.deadline,
        link: editFields.link,
      })
      saveOpps(next); return next
    })
    setEditingId(null)
  }

  function cancelEdit() {
    if (!editingId) return
    setOpps(prev => { const next = prev.filter(o => o.id !== editingId); saveOpps(next); return next })
    setEditingId(null)
  }

  const today     = startOfDay(new Date())
  const viewStart = anchor
  const viewEnd   = endOfMonth(shiftMonths(anchor, 1))
  const totalDays = daysBetween(viewStart, viewEnd) + 1
  const totalW    = totalDays * DAY_W

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(viewStart); d.setDate(d.getDate() + i); return d
  })

  const monthBounds: { label: string; x: number }[] = []
  days.forEach((d, i) => {
    if (i === 0 || d.getDate() === 1)
      monthBounds.push({ label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), x: i * DAY_W })
  })

  const todayX       = daysBetween(viewStart, today)
  const todayVisible = todayX >= 0 && todayX < totalDays
  const visible      = opps.filter(o => !hidden.has(o.id))
  const withDates    = visible.filter(o => o.createdAt || o.deadline)
  const noDates      = visible.filter(o => !o.createdAt && !o.deadline)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navTo("opportunities")}
          className="flex items-center gap-1.5 text-[22px] font-bold text-[#5a5a5a] tracking-tight hover:underline underline-offset-2">
          Applications
        </button>
        {noDates.length > 0 && <span className="text-[12px] text-[#9a9a9a]">No date ({noDates.length})</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setAnchor(m => shiftMonths(m, -1))}
            className="p-1 rounded-lg hover:bg-[#f0f0f0] transition-colors">
            <ChevronLeft size={14} className="text-[#7a7a7a]" />
          </button>
          <button onClick={() => setAnchor(startOfMonth(new Date()))}
            className="px-2.5 py-0.5 text-[11px] font-medium rounded-lg border border-[#e0e0e0] hover:bg-[#f5f5f7] transition-colors text-[#5a5a5a]">
            Today
          </button>
          <button onClick={() => setAnchor(m => shiftMonths(m, 1))}
            className="p-1 rounded-lg hover:bg-[#f0f0f0] transition-colors">
            <ChevronRight size={14} className="text-[#7a7a7a]" />
          </button>
        </div>
      </div>

      {/* Scrollable grid */}
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <div style={{ width: totalW, position: "relative", minWidth: "100%" }}>

          {/* Today line */}
          {todayVisible && (
            <div style={{ position: "absolute", top: 0, left: todayX * DAY_W + DAY_W / 2, width: 1, height: "100%", background: "#ef4444", pointerEvents: "none", zIndex: 0 }} />
          )}

          {/* Month labels */}
          <div style={{ position: "relative", height: 24 }}>
            {monthBounds.map(({ label, x }) => (
              <span key={x} style={{ position: "absolute", left: x + 4, top: 4 }}
                className="text-[16px] font-bold text-[#1d1d1f]">{label}</span>
            ))}
          </div>

          {/* Day numbers */}
          <div style={{ display: "flex", height: 32 }}>
            {days.map((d, i) => {
              const isToday   = daysBetween(today, d) === 0
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={i} style={{ width: DAY_W, flexShrink: 0 }} className="flex items-center justify-center">
                  {isToday
                    ? <span className="w-[22px] h-[22px] rounded-full bg-red-500 text-white flex items-center justify-center text-[11px] font-bold">{d.getDate()}</span>
                    : <span className={`text-[11px] ${isWeekend ? "text-[#c0c0c0]" : "text-[#7a7a7a]"}`}>{d.getDate()}</span>
                  }
                </div>
              )
            })}
          </div>

          {/* Divider */}
          <div className="h-px bg-[#ebebeb] mb-2" />

          {/* Bars */}
          {withDates.length === 0 && noDates.length === 0 && !editingId ? (
            <p className="text-[12px] text-[#c0c0c0] py-6 pl-1">No applications — click + New to add one.</p>
          ) : withDates.map(opp => {
            const isEditing = editingId === opp.id

            const rawStart = opp.createdAt ? startOfDay(new Date(opp.createdAt)) : startOfDay(new Date(opp.deadline))
            const rawEnd   = opp.deadline  ? startOfDay(new Date(opp.deadline))  : rawStart
            const leftDay  = daysBetween(viewStart, rawStart)
            const rightDay = daysBetween(viewStart, rawEnd)
            if (!isEditing && (leftDay >= totalDays || rightDay < 0)) return null

            const cl = isEditing ? Math.max(0, daysBetween(viewStart, today)) * DAY_W : Math.max(0, leftDay) * DAY_W
            const cr = Math.min(totalDays, rightDay + 1) * DAY_W
            const bw = isEditing ? 440 : Math.max(420, cr - cl)
            const sc = STATUS_COLORS[opp.status]
            const name    = opp.organization || opp.title
            const dateStr = [opp.createdAt && fmtDate(opp.createdAt), opp.deadline && fmtDate(opp.deadline)]
              .filter(Boolean).join(" → ")
            const linkShort = opp.link ? shortLink(opp.link) : ""

            return (
              <div key={opp.id} style={{ position: "relative", height: isEditing ? 100 : 72 }}>
                <div
                  ref={el => { if (el) barRefs.current.set(opp.id, el); else barRefs.current.delete(opp.id) }}
                  style={{ position: "absolute", left: cl, width: bw, top: 8, bottom: 8, zIndex: isEditing ? 10 : 2, cursor: isEditing ? "default" : "grab" }}
                  onMouseDown={e => {
                    if (isEditing) return
                    const el = barRefs.current.get(opp.id)
                    if (el) startDrag(e, opp, "move", el)
                  }}
                >
                  {isEditing ? (
                    /* ── Editing form ── */
                    <div className="h-full bg-white border border-[#c8c8e0] rounded-xl shadow-md flex flex-col px-3 py-2 gap-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editFields.org}
                          onChange={e => setEditFields(f => ({ ...f, org: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                          placeholder="Organization or title"
                          className="flex-1 text-[12px] font-semibold text-[#1d1d1f] outline-none bg-transparent placeholder-[#c0c0c0]"
                        />
                        <select
                          value={editFields.status}
                          onChange={e => setEditFields(f => ({ ...f, status: e.target.value as OppStatus }))}
                          className="text-[11px] text-[#5a5a5a] outline-none bg-transparent border-none cursor-pointer"
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#7a7a7a]">
                        <input type="date" value={editFields.createdAt}
                          onChange={e => setEditFields(f => ({ ...f, createdAt: e.target.value }))}
                          className="outline-none bg-transparent border-b border-[#e0e0e0] text-[11px] text-[#7a7a7a]" />
                        <span>→</span>
                        <input type="date" value={editFields.deadline}
                          onChange={e => setEditFields(f => ({ ...f, deadline: e.target.value }))}
                          className="outline-none bg-transparent border-b border-[#e0e0e0] text-[11px] text-[#7a7a7a]" />
                        <input value={editFields.link}
                          onChange={e => setEditFields(f => ({ ...f, link: e.target.value }))}
                          placeholder="Paste link…"
                          className="flex-1 outline-none bg-transparent border-b border-[#e0e0e0] text-[11px] text-[#7a7a7a] placeholder-[#d0d0d0] min-w-0" />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={cancelEdit} className="text-[11px] text-[#b0b0b0] hover:text-[#5a5a5a]">Cancel</button>
                        <button onClick={saveEdit} className="text-[11px] font-semibold text-[#2c4470] hover:underline">Save</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal bar ── */
                    <div className="h-full bg-white border border-[#e0e0e4] rounded-xl shadow-sm overflow-hidden relative group/bar select-none">
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => hideOpp(opp.id)}
                        className="absolute top-1.5 right-2 opacity-0 group-hover/bar:opacity-100 transition-opacity z-10"
                      >
                        <X size={10} className="text-[#c0c0c0] hover:text-red-400" />
                      </button>

                      <div className="h-full flex items-center gap-2.5 px-4 pr-8">
                        <OppLogo opp={opp} size={22} />
                        <div className="flex flex-col justify-center min-w-0 flex-1 gap-1">
                          <span className="text-[13px] font-semibold text-[#1d1d1f] leading-tight truncate">{name}</span>
                          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                            {dateStr && <span className="text-[11px] text-[#a0a0a0] whitespace-nowrap shrink-0">{dateStr}</span>}
                            {dateStr && linkShort && <span className="text-[11px] text-[#d0d0d0] shrink-0">·</span>}
                            {linkShort && (
                              <a href={opp.link} target="_blank" rel="noopener noreferrer"
                                onMouseDown={e => e.stopPropagation()}
                                className="text-[11px] text-[#b0b0b0] hover:text-[#5a5a5a] truncate">
                                {linkShort}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="relative shrink-0">
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); setStatusPopup(p => p?.id === opp.id ? null : { id: opp.id }) }}
                            className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                            <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: sc.text }}>{opp.status}</span>
                          </button>
                          {statusPopup?.id === opp.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-[#e0e0e0] rounded-xl shadow-lg z-50 py-1 min-w-[130px]">
                              {STATUSES.map(s => {
                                const c = STATUS_COLORS[s]
                                return (
                                  <button key={s}
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setOpps(prev => { const next = prev.map(o => o.id === opp.id ? { ...o, status: s } : o); saveOpps(next); return next })
                                      setStatusPopup(null)
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-[#f5f5f7] text-left"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
                                    <span className="text-[12px] font-medium" style={{ color: c.text }}>{s}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-black/5 rounded-r-xl"
                        onMouseDown={e => {
                          const el = barRefs.current.get(opp.id)
                          if (el) startDrag(e, opp, "resize", el)
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* No-date list */}
          {noDates.length > 0 && (
            <div className="border-t border-[#f0f0f0] pt-2 mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#c0c0c0] mb-2 pl-1">No date</p>
              {noDates.map(opp => {
                const sc = STATUS_COLORS[opp.status]
                return (
                  <div key={opp.id} className="flex items-center gap-2 py-1.5 pl-1 group/nd">
                    <OppLogo opp={opp} size={16} />
                    <span className="text-[12px] font-semibold text-[#7a7a7a]">{opp.organization || opp.title}</span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: sc.bg, color: sc.text }}>{opp.status}</span>
                    <button onClick={() => hideOpp(opp.id)}
                      className="ml-auto opacity-0 group-hover/nd:opacity-100 transition-opacity">
                      <X size={10} className="text-[#c0c0c0] hover:text-red-400" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={addNew}
            className="flex items-center gap-1.5 text-[12px] text-[#b0b0b0] hover:text-[#5a5a5a] transition-colors mt-4 pl-1">
            + New
          </button>
        </div>
      </div>

      {/* Large empty space below applications */}
      <div className="h-32" />
    </div>
  )
}

// ── Weekly tasks ──────────────────────────────────────────────────
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const LS_KEY = "workspace:tasks-v1"

type TaskType = "text" | "bullet" | "checkbox" | "link"
interface Task {
  id: string; type: TaskType; text: string
  url?: string; favicon?: string; checked?: boolean; color?: string
}
type WeekData = Record<string, Task[]>

function loadData(): WeekData { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") ?? {} } catch { return {} } }
function saveData(d: WeekData) { localStorage.setItem(LS_KEY, JSON.stringify(d)) }
function isUrl(t: string) { if (!t.startsWith("http://") && !t.startsWith("https://")) return false; try { new URL(t); return true } catch { return false } }
function faviconUrl(url: string) { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` } catch { return "" } }

// Auto-growing textarea — text wraps instead of clipping
function GrowTextarea({ taskId, value, onChange, onKeyDown, onPaste, style, className }: {
  taskId: string; value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  style?: React.CSSProperties; className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = "auto"
    ref.current.style.height = ref.current.scrollHeight + "px"
  }, [value])
  return (
    <textarea ref={ref} data-task-id={taskId} value={value} rows={1}
      onChange={onChange} onKeyDown={onKeyDown} onPaste={onPaste}
      style={{ resize: "none", overflow: "hidden", ...style }}
      className={className} />
  )
}

function TaskRow({ task, onChange, onDelete, onEnter }: {
  task: Task; onChange: (p: Partial<Task>) => void; onDelete: () => void; onEnter: () => void
}) {
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    if (task.type === "text") {
      if (val === "- ")  { onChange({ type: "bullet",   text: "" }); return }
      if (val === "[] ") { onChange({ type: "checkbox", text: "" }); return }
    }
    onChange({ text: val })
  }
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text").trim()
    if (isUrl(pasted)) {
      e.preventDefault()
      try {
        const { hostname } = new URL(pasted)
        onChange({ type: "link", url: pasted, favicon: faviconUrl(pasted), text: task.text.trim() || hostname })
      } catch {}
    }
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter() }
    if (e.key === "Backspace" && !task.text) { e.preventDefault(); onDelete() }
  }

  const textStyle: React.CSSProperties = {
    color: task.color ?? (task.checked ? "#b0b0b0" : "#1d1d1f"),
    textDecoration: task.checked ? "line-through" : "none",
  }
  const cls = "flex-1 min-w-0 bg-transparent outline-none text-[13px] leading-relaxed"

  if (task.type === "link") {
    return (
      <div className="flex items-start gap-2 py-0.5 group/row">
        <a href={task.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="shrink-0 mt-1 w-4 flex items-center justify-center">
          {task.favicon
            ? <img src={task.favicon} alt="" className="w-4 h-4 rounded-sm"
                onError={e => (e.currentTarget.style.visibility = "hidden")} />
            : <ExternalLink size={12} className="text-[#a0a0c0]" />}
        </a>
        <GrowTextarea taskId={task.id} value={task.text}
          onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
          style={{ ...textStyle, color: "#2c3c7a" }} className={`${cls} font-semibold`} />
        <button onClick={onDelete} className="opacity-0 group-hover/row:opacity-100 mt-1 shrink-0 transition-opacity">
          <X size={10} className="text-[#c0c0c0] hover:text-[#666]" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-1.5 py-0.5 group/row">
      <div className="shrink-0 w-4 mt-1 flex items-center justify-center">
        {task.type === "checkbox" && (
          <button onClick={() => onChange({ checked: !task.checked })}
            className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center transition-colors ${task.checked ? "border-[#888] bg-[#888]" : "border-[#c8c8c8] hover:border-[#888]"}`}>
            {task.checked && <Check size={8} className="text-white" strokeWidth={3} />}
          </button>
        )}
        {task.type === "bullet" && <span className="text-[11px] text-[#7a7a7a]">•</span>}
      </div>
      <GrowTextarea taskId={task.id} value={task.text}
        onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
        style={textStyle} className={cls} />
      <button onClick={onDelete} className="opacity-0 group-hover/row:opacity-100 mt-1 shrink-0 transition-opacity">
        <X size={10} className="text-[#c0c0c0] hover:text-[#666]" />
      </button>
    </div>
  )
}

function DayColumn({ day, tasks, onChange }: { day: string; tasks: Task[]; onChange: (t: Task[]) => void }) {
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingFocus.current) return
    document.querySelector<HTMLTextAreaElement>(`[data-task-id="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  function addTask(afterId?: string) {
    const t: Task = { id: uid(), type: "text", text: "" }
    pendingFocus.current = t.id
    if (afterId === undefined) { onChange([...tasks, t]); return }
    const idx = tasks.findIndex(x => x.id === afterId)
    const next = [...tasks]; next.splice(idx + 1, 0, t); onChange(next)
  }
  function updateTask(id: string, patch: Partial<Task>) { onChange(tasks.map(t => t.id === id ? { ...t, ...patch } : t)) }
  function deleteTask(id: string) {
    const idx = tasks.findIndex(t => t.id === id)
    onChange(tasks.filter(t => t.id !== id))
    if (idx > 0) pendingFocus.current = tasks[idx - 1].id
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-[13px] font-bold text-[#1d1d1f] mb-2">{day}</h3>
      <div className="flex flex-col">
        {tasks.map(task => (
          <TaskRow key={task.id} task={task}
            onChange={p => updateTask(task.id, p)}
            onDelete={() => deleteTask(task.id)}
            onEnter={() => addTask(task.id)} />
        ))}
        <button onClick={() => addTask()}
          className="ml-5 text-[13px] text-transparent hover:text-[#c0c0c0] text-left transition-colors py-0.5 mt-0.5">+</button>
      </div>
    </div>
  )
}

// ── Shared inner content (used on Tasks page AND Home page) ──────
export function TasksContent() {
  const [data, setData] = useState<WeekData>(loadData)
  function setDay(day: string, tasks: Task[]) { const next = { ...data, [day]: tasks }; setData(next); saveData(next) }

  return (
    <>
      {/* Mon – Thu */}
      <div className="grid grid-cols-4 gap-x-8 gap-y-10 mb-10">
        {DAYS.slice(0, 4).map(day => (
          <DayColumn key={day} day={day} tasks={data[day] ?? []} onChange={t => setDay(day, t)} />
        ))}
      </div>

      {/* Fri – Sun */}
      <div className="grid grid-cols-3 gap-x-14">
        {DAYS.slice(4).map(day => (
          <DayColumn key={day} day={day} tasks={data[day] ?? []} onChange={t => setDay(day, t)} />
        ))}
      </div>

      {/* Timeline */}
      <div className="border-t border-[#ebebeb] mt-14 pt-10">
        <Timeline />
      </div>
    </>
  )
}

// ── Tasks page ────────────────────────────────────────────────────
export default function Tasks() {
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-10 pb-16 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <h1 className="text-[22px] font-bold text-[#5a5a5a] tracking-tight pt-14 pb-10">Tasks</h1>
        <TasksContent />
      </div>
    </div>
  )
}
