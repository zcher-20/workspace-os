import { useState, useMemo, useRef, useEffect } from "react"
import {
  Search, Plus, X, MessageSquare, Clock, CheckCircle, ChevronRight,
  Building, MapPin, Globe, ChevronLeft, Copy, Check, Pencil,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface Interaction { id: string; date: string; summary: string }

interface Person {
  id: string; name: string; role: string; organization: string
  email: string; linkedin?: string; needsFollowup: boolean; interactions: Interaction[]; createdAt: string
}

interface Organization {
  id: string; name: string; type: string; location: string
  website: string; notes: string; createdAt: string
}

interface CalEvent {
  id: string; date: string; title: string
  linkedId?: string; linkedType?: "person" | "org"; notes?: string
}

// ── Storage ────────────────────────────────────────────────────────

const LS_PEOPLE    = "workspace:people"
const LS_ORGS      = "workspace:organizations"
const LS_CAL       = "workspace:calendar-events"
const LS_TEMPLATES = "workspace:outreach-templates"

interface OutreachTemplate { id: string; label: string; body: string }

const DEFAULT_TEMPLATES: OutreachTemplate[] = [
  {
    id: "email",
    label: "Cold Email",
    body: `Subject: [Role] at [Company] — Zayneb Cherif

Hi [Name],

I came across your work at [Company] and was really drawn to [specific thing]. I'm currently exploring opportunities in [field] and would love to connect.

I'd appreciate even 15 minutes of your time to learn more about your experience and the team.

Best,
Zayneb`,
  },
  {
    id: "recruiter",
    label: "Recruiter Outreach",
    body: `Hi [Name],

I noticed you work with companies in [industry] and wanted to reach out. I'm a [role/background] with experience in [skills] and am actively exploring new opportunities.

Would love to connect if you're working on anything that might be a fit.

Best,
Zayneb`,
  },
  {
    id: "linkedin",
    label: "LinkedIn Note",
    body: `Hi [Name], I came across your profile and was impressed by your work at [Company]. I'm interested in [topic/role] and would love to connect and learn from your experience. Hope to chat soon!`,
  },
  {
    id: "followup",
    label: "Follow-up",
    body: `Hi [Name],

Just following up on my previous message — I wanted to reiterate my interest in connecting. I know things get busy, so no pressure at all.

Looking forward to hearing from you when you have a moment.

Best,
Zayneb`,
  },
]

function loadTemplates(): OutreachTemplate[] {
  try { return JSON.parse(localStorage.getItem(LS_TEMPLATES) || "null") ?? DEFAULT_TEMPLATES }
  catch { return DEFAULT_TEMPLATES }
}
function saveTemplates(t: OutreachTemplate[]) { localStorage.setItem(LS_TEMPLATES, JSON.stringify(t)) }

function loadPeople(): Person[] { try { return JSON.parse(localStorage.getItem(LS_PEOPLE) || "[]") } catch { return [] } }
function savePeople(p: Person[]) { localStorage.setItem(LS_PEOPLE, JSON.stringify(p)) }
function loadOrgs(): Organization[] { try { return JSON.parse(localStorage.getItem(LS_ORGS) || "[]") } catch { return [] } }
function saveOrgs(o: Organization[]) { localStorage.setItem(LS_ORGS, JSON.stringify(o)) }
function loadCal(): CalEvent[] { try { return JSON.parse(localStorage.getItem(LS_CAL) || "[]") } catch { return [] } }
function saveCal(e: CalEvent[]) { localStorage.setItem(LS_CAL, JSON.stringify(e)) }

// ── Helpers ────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase() || "?"
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function padDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const AVATAR_COLORS = ["#4f7ab3", "#5b9b8a", "#c4856a", "#b8769a", "#9a8b6e", "#6b7fa8"]
function avatarColor(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const ORG_TYPES = ["Company", "University", "Nonprofit", "Government", "Research Lab", "Startup", "Other"]
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// ── Full calendar ──────────────────────────────────────────────────

function FullCalendar({
  year, month, events, selected,
  onPrev, onNext, onSelectDay, onAddEvent,
}: {
  year: number; month: number; events: CalEvent[]
  selected: string | null
  onPrev: () => void; onNext: () => void
  onSelectDay: (d: string) => void
  onAddEvent: (date: string) => void
}) {
  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const todayStr = padDate(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="select-none w-full">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onPrev} className="p-2 rounded-lg hover:bg-[#f5f5f7] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="text-[17px] font-semibold text-[#1d1d1f] tracking-tight">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={onNext} className="p-2 rounded-lg hover:bg-[#f5f5f7] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day header row */}
      <div className="grid grid-cols-7 border-b border-[#f0f0f0] mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-[#b0b0b0] uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) {
            return (
              <div key={`pad-${i}`} className="border-b border-r border-[#f8f8f8] min-h-[80px]"
                style={{ borderRight: (i + 1) % 7 === 0 ? "none" : undefined }} />
            )
          }
          const dateStr  = padDate(year, month, d)
          const dayEvts  = events.filter(e => e.date === dateStr)
          const isToday  = dateStr === todayStr
          const isSel    = dateStr === selected
          const isLastCol = (i + 1) % 7 === 0

          return (
            <div
              key={dateStr}
              className={`group relative flex flex-col min-h-[80px] border-b cursor-pointer transition-colors ${
                isLastCol ? "" : "border-r"
              } border-[#f0f0f0] ${
                isSel  ? "bg-[#f0f3fa]" :
                         "hover:bg-[#fafafa]"
              }`}
              onClick={() => onSelectDay(dateStr)}
            >
              {/* Day number */}
              <div className="flex items-start justify-between px-2 pt-2 pb-1">
                <span className={`text-[13px] font-medium w-6 h-6 flex items-center justify-center rounded-full leading-none ${
                  isToday ? "bg-[#1d1d1f] text-white" :
                  isSel   ? "text-[#2c4470] font-semibold" :
                            "text-[#1d1d1f]"
                }`}>
                  {d}
                </span>
                {/* Quick add button */}
                <button
                  onClick={e => { e.stopPropagation(); onAddEvent(dateStr) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#c0c0c0] hover:text-[#1d1d1f] p-0.5"
                >
                  <Plus size={11} />
                </button>
              </div>

              {/* Event chips */}
              <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
                {dayEvts.slice(0, 3).map(ev => (
                  <div key={ev.id}
                    className="text-[10px] leading-snug px-1.5 py-0.5 rounded truncate font-medium"
                    style={{ background: "#e8edf7", color: "#2c4470" }}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvts.length > 3 && (
                  <span className="text-[9px] text-[#a0a0a0] px-1.5">+{dayEvts.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────

export default function People() {
  const [tab, setTab] = useState<"people" | "orgs">("people")
  const [people, setPeople]       = useState<Person[]>(loadPeople)
  const [orgs,   setOrgs]         = useState<Organization[]>(loadOrgs)
  const [calEvents, setCalEvents] = useState<CalEvent[]>(loadCal)

  const [search,         setSearch]         = useState("")
  const [filterFollowup, setFilterFollowup] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedOrg,    setSelectedOrg]    = useState<Organization | null>(null)
  const [interactionText, setInteractionText] = useState("")

  const today = new Date()
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [selDay,   setSelDay]   = useState<string | null>(null)

  // Add-event state
  const [addingEventDate, setAddingEventDate] = useState<string | null>(null)
  const [evtTitle,  setEvtTitle]  = useState("")
  const [evtNotes,  setEvtNotes]  = useState("")
  const evtInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingEventDate && evtInputRef.current) evtInputRef.current.focus()
  }, [addingEventDate])

  // Templates
  const [templates, setTemplates] = useState<OutreachTemplate[]>(loadTemplates)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function updateTemplate(id: string, body: string) {
    const next = templates.map(t => t.id === id ? { ...t, body } : t)
    setTemplates(next); saveTemplates(next)
  }
  function copyTemplate(t: OutreachTemplate) {
    navigator.clipboard.writeText(t.body)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 1500)
  }
  function addTemplate() {
    const newT: OutreachTemplate = { id: Date.now().toString(), label: "New Template", body: "" }
    const next = [...templates, newT]
    setTemplates(next); saveTemplates(next); setEditingTemplateId(newT.id)
  }
  function removeTemplate(id: string) {
    const next = templates.filter(t => t.id !== id)
    setTemplates(next); saveTemplates(next)
    if (editingTemplateId === id) setEditingTemplateId(null)
  }

  // Add modals
  const [addingPerson, setAddingPerson] = useState(false)
  const [addingOrg,    setAddingOrg]    = useState(false)
  const [personDraft, setPersonDraft] = useState({ name: "", role: "", organization: "", email: "", linkedin: "" })
  const [orgDraft,    setOrgDraft]    = useState({ name: "", type: "Company", location: "", website: "", notes: "" })

  const activePerson = selectedPerson ? people.find(p => p.id === selectedPerson.id) ?? null : null
  const activeOrg    = selectedOrg    ? orgs.find(o => o.id === selectedOrg.id)       ?? null : null

  const filteredPeople = useMemo(() => people.filter(p => {
    if (filterFollowup && !p.needsFollowup) return false
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.organization.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
  }), [people, search, filterFollowup])

  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase()
    return orgs.filter(o => !q || o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q) || o.location.toLowerCase().includes(q))
  }, [orgs, search])

  const dayEvents  = selDay ? calEvents.filter(e => e.date === selDay) : []

  // ── Mutations ────────────────────────────────────────────────────
  function mutatePeople(next: Person[]) { setPeople(next); savePeople(next) }
  function mutateOrgs(next: Organization[]) { setOrgs(next); saveOrgs(next) }
  function mutateCal(next: CalEvent[]) { setCalEvents(next); saveCal(next) }

  function addPerson() {
    if (!personDraft.name.trim()) return
    const p: Person = {
      id: Date.now().toString(), ...personDraft,
      name: personDraft.name.trim(), needsFollowup: false, interactions: [], createdAt: new Date().toISOString(),
    }
    mutatePeople([p, ...people]); setAddingPerson(false); setPersonDraft({ name: "", role: "", organization: "", email: "" })
  }
  function addOrg() {
    if (!orgDraft.name.trim()) return
    const o: Organization = { id: Date.now().toString(), ...orgDraft, name: orgDraft.name.trim(), createdAt: new Date().toISOString() }
    mutateOrgs([o, ...orgs]); setAddingOrg(false); setOrgDraft({ name: "", type: "Company", location: "", website: "", notes: "" })
  }
  function logInteraction() {
    if (!activePerson || !interactionText.trim()) return
    const it: Interaction = { id: Date.now().toString(), date: new Date().toISOString(), summary: interactionText.trim() }
    mutatePeople(people.map(p => p.id === activePerson.id ? { ...p, interactions: [it, ...p.interactions] } : p))
    setInteractionText("")
  }
  function toggleFollowup(id: string) {
    mutatePeople(people.map(p => p.id === id ? { ...p, needsFollowup: !p.needsFollowup } : p))
  }
  function removePerson(id: string) { mutatePeople(people.filter(p => p.id !== id)); if (activePerson?.id === id) setSelectedPerson(null) }
  function removeOrg(id: string)    { mutateOrgs(orgs.filter(o => o.id !== id));     if (activeOrg?.id === id)    setSelectedOrg(null) }

  function submitEvent() {
    if (!evtTitle.trim() || !addingEventDate) return
    const linkedId   = tab === "people" ? activePerson?.id : activeOrg?.id
    const linkedType = tab === "people" ? "person" as const : "org" as const
    const e: CalEvent = {
      id: Date.now().toString(), date: addingEventDate, title: evtTitle.trim(),
      notes: evtNotes || undefined,
      linkedId: linkedId || undefined,
      linkedType: linkedId ? linkedType : undefined,
    }
    mutateCal([...calEvents, e])
    setEvtTitle(""); setEvtNotes(""); setAddingEventDate(null)
    setSelDay(addingEventDate)
  }
  function removeCalEvent(id: string) { mutateCal(calEvents.filter(e => e.id !== id)) }

  function prevMonth() { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1) }
  function nextMonth() { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1) }

  const showDetail = activePerson || activeOrg || selDay

  return (
    <div className="flex flex-col gap-10">
    <div className="flex gap-4">

      {/* ── Left: list panel ──────────────────────────────────────── */}
      <div className="flex flex-col w-60 shrink-0">
        <div className="flex gap-0.5 bg-[#f0f0f0] rounded-lg p-0.5 mb-3">
          {(["people", "orgs"] as const).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setSearch(""); setSelectedPerson(null); setSelectedOrg(null) }}
              className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-colors ${tab === t ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
              {t === "people" ? "People" : "Organizations"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === "people" ? "Search people…" : "Search orgs…"}
              className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
          </div>
          <button onClick={() => tab === "people" ? setAddingPerson(true) : setAddingOrg(true)}
            className="p-1.5 rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {tab === "people" && (
          <button onClick={() => setFilterFollowup(f => !f)}
            className={`flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg text-[12px] font-medium border transition-colors ${filterFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "bg-white border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
            <Clock size={12} /> Follow-up
            {people.filter(p => p.needsFollowup).length > 0 && (
              <span className="ml-auto bg-[#92400e] text-white rounded-full text-[10px] px-1.5 py-0.5 leading-none">
                {people.filter(p => p.needsFollowup).length}
              </span>
            )}
          </button>
        )}

        <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
          {tab === "people" && filteredPeople.map(p => (
            <button key={p.id}
              onClick={() => { setSelectedPerson(p); setSelectedOrg(null) }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-colors ${activePerson?.id === p.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: avatarColor(p.id) }}>
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{p.name}</p>
                <p className="text-[10px] text-[#7a7a7a] truncate">{p.role}{p.organization ? ` · ${p.organization}` : ""}</p>
                {p.linkedin && (
                  <a href={p.linkedin} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] text-[#b0b0b0] hover:text-[#2c4470] transition-colors truncate block mt-0.5">
                    LinkedIn ↗
                  </a>
                )}
              </div>
              {p.needsFollowup && <div className="w-1.5 h-1.5 rounded-full bg-[#c4856a] shrink-0" />}
            </button>
          ))}
          {tab === "orgs" && filteredOrgs.map(o => (
            <button key={o.id}
              onClick={() => { setSelectedOrg(o); setSelectedPerson(null) }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-colors ${activeOrg?.id === o.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}>
              <div className="w-7 h-7 rounded-lg bg-[#eef1fb] flex items-center justify-center shrink-0">
                <Building size={13} className="text-[#2c4470]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{o.name}</p>
                <p className="text-[10px] text-[#7a7a7a] truncate">{o.type}{o.location ? ` · ${o.location}` : ""}</p>
              </div>
            </button>
          ))}
          {((tab === "people" && filteredPeople.length === 0) || (tab === "orgs" && filteredOrgs.length === 0)) && (
            <p className="text-center py-8 text-[12px] text-[#b0b0b0]">
              {(tab === "people" ? people : orgs).length === 0 ? "None yet." : "No results."}
            </p>
          )}
        </div>
      </div>

      {/* ── Right: calendar + detail ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 gap-0 overflow-hidden">

        {/* Calendar */}
        <div className="bg-white overflow-y-auto" style={{ maxHeight: showDetail ? "55%" : "100%" }}>
          <div className="px-5 pt-5 pb-3">
            <FullCalendar
              year={calYear} month={calMonth} events={calEvents} selected={selDay}
              onPrev={prevMonth} onNext={nextMonth}
              onSelectDay={d => setSelDay(s => s === d ? null : d)}
              onAddEvent={d => { setAddingEventDate(d); setSelDay(d) }}
            />
          </div>
        </div>

        {/* Add-event inline form */}
        {addingEventDate && (
          <div className="shrink-0 bg-[#f5f5f7] border-t border-[#eee] px-5 py-3 flex items-center gap-2">
            <div className="text-[11px] font-medium text-[#7a7a7a] shrink-0">
              {new Date(addingEventDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <input ref={evtInputRef} value={evtTitle} onChange={e => setEvtTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitEvent(); if (e.key === "Escape") setAddingEventDate(null) }}
              placeholder="Event title…"
              className="flex-1 px-3 py-1.5 text-[12px] border border-[#e0e0e0] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
            <input value={evtNotes} onChange={e => setEvtNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-36 px-3 py-1.5 text-[11px] border border-[#e0e0e0] rounded-lg bg-white focus:outline-none" />
            <button onClick={submitEvent} disabled={!evtTitle.trim()}
              className="px-3 py-1.5 rounded-lg bg-[#1d1d1f] text-white text-[12px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
              Add
            </button>
            <button onClick={() => setAddingEventDate(null)} className="text-[#b0b0b0] hover:text-[#1d1d1f] transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Detail panel — person/org/day events */}
        {showDetail && (
          <div className="flex-1 overflow-y-auto bg-white border-t border-[#f0f0f0]">

            {/* Person detail */}
            {activePerson && (
              <div className="px-5 py-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                      style={{ background: avatarColor(activePerson.id) }}>
                      {initials(activePerson.name)}
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-[#1d1d1f]">{activePerson.name}</h2>
                      <p className="text-[12px] text-[#7a7a7a]">{activePerson.role}{activePerson.organization ? ` · ${activePerson.organization}` : ""}</p>
                      {activePerson.email && <p className="text-[11px] text-[#7a7a7a] mt-0.5">{activePerson.email}</p>}
                      {activePerson.linkedin && (
                        <a href={activePerson.linkedin} target="_blank" rel="noreferrer"
                          className="text-[11px] text-[#b0b0b0] hover:text-[#2c4470] transition-colors mt-0.5 block">
                          LinkedIn ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleFollowup(activePerson.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${activePerson.needsFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
                      {activePerson.needsFollowup ? <><CheckCircle size={11} /> Following up</> : <><Clock size={11} /> Follow-up</>}
                    </button>
                    <button onClick={() => removePerson(activePerson.id)}>
                      <X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <input value={interactionText} onChange={e => setInteractionText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && logInteraction()}
                    placeholder="Log an interaction… (Enter to save)"
                    className="flex-1 px-3 py-2 text-[12px] rounded-lg border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                  <button onClick={logInteraction} disabled={!interactionText.trim()}
                    className="px-3 py-2 rounded-lg bg-[#1d1d1f] text-white text-[12px] hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors flex items-center gap-1.5">
                    <MessageSquare size={12} /> Log
                  </button>
                </div>

                {activePerson.interactions.length > 0 && (
                  <div className="relative ml-2 pl-4 border-l-2 border-[#f0f0f0] flex flex-col gap-3">
                    {activePerson.interactions.map(it => (
                      <div key={it.id} className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#2c4470] ring-4 ring-white" />
                        <p className="text-[10px] text-[#7a7a7a] mb-0.5">{fmtDate(it.date)}</p>
                        <p className="text-[12px] text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2">{it.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Org detail */}
            {activeOrg && (
              <div className="px-5 py-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#eef1fb] flex items-center justify-center">
                      <Building size={18} className="text-[#2c4470]" />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold text-[#1d1d1f]">{activeOrg.name}</h2>
                      <p className="text-[12px] text-[#7a7a7a]">{activeOrg.type}</p>
                    </div>
                  </div>
                  <button onClick={() => removeOrg(activeOrg.id)}>
                    <X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 text-[13px]">
                  {activeOrg.location && <div className="flex items-center gap-2 text-[#7a7a7a]"><MapPin size={13} />{activeOrg.location}</div>}
                  {activeOrg.website && (
                    <div className="flex items-center gap-2 text-[#7a7a7a]">
                      <Globe size={13} />
                      <a href={activeOrg.website} target="_blank" rel="noreferrer" className="hover:text-[#2c4470] underline truncate">{activeOrg.website}</a>
                    </div>
                  )}
                  {activeOrg.notes && <p className="mt-1 text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2.5 text-[12px]">{activeOrg.notes}</p>}
                </div>
              </div>
            )}

            {/* Day events */}
            {selDay && dayEvents.length > 0 && (
              <div className="px-5 pb-5" style={{ paddingTop: (activePerson || activeOrg) ? 0 : 20 }}>
                {(activePerson || activeOrg) && <div className="border-t border-[#f0f0f0] mt-4 mb-4" />}
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-3">
                  {new Date(selDay + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <div className="flex flex-col gap-2">
                  {dayEvents.map(e => {
                    const linked = e.linkedType === "person"
                      ? people.find(p => p.id === e.linkedId)?.name
                      : orgs.find(o => o.id === e.linkedId)?.name
                    return (
                      <div key={e.id} className="flex items-start gap-3 group px-3 py-2.5 rounded-xl bg-[#f8f9fd] border border-[#eef1fb]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4f7ab3] mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[#1d1d1f] font-medium">{e.title}</p>
                          {linked && <p className="text-[11px] text-[#7a7a7a]">{linked}</p>}
                          {e.notes && <p className="text-[11px] text-[#a0a0a0] mt-0.5">{e.notes}</p>}
                        </div>
                        <button onClick={() => removeCalEvent(e.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={11} className="text-[#c0c0c0] hover:text-[#1d1d1f]" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state when day selected but no events */}
            {selDay && dayEvents.length === 0 && !activePerson && !activeOrg && (
              <div className="px-5 py-5">
                <p className="text-[12px] font-semibold text-[#7a7a7a] mb-1">
                  {new Date(selDay + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <p className="text-[12px] text-[#b0b0b0]">No events — click + on any day to add one.</p>
              </div>
            )}
          </div>
        )}
      </div>

    </div>{/* end main flex row */}

      {/* ── Outreach Templates ───────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-7">
          <h2 className="text-[20px] font-bold tracking-tight text-[#1d1d1f]">Outreach Templates</h2>
          <button onClick={addTemplate}
            className="flex items-center gap-1.5 text-[12px] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
            <Plus size={13} /> Add template
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#f0f0f0] bg-[#fafafa]">
                {editingTemplateId === t.id
                  ? <input
                      autoFocus
                      value={t.label}
                      onChange={e => {
                        const next = templates.map(x => x.id === t.id ? { ...x, label: e.target.value } : x)
                        setTemplates(next); saveTemplates(next)
                      }}
                      onBlur={() => setEditingTemplateId(null)}
                      className="text-[12px] font-semibold text-[#1d1d1f] bg-transparent outline-none border-b border-[#c0c0c0] flex-1"
                    />
                  : <span className="text-[12px] font-semibold text-[#1d1d1f]">{t.label}</span>
                }
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => copyTemplate(t)}
                    className="p-1 rounded hover:bg-[#ebebeb] transition-colors text-[#7a7a7a] hover:text-[#1d1d1f]">
                    {copiedId === t.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  </button>
                  <button onClick={() => setEditingTemplateId(t.id)}
                    className="p-1 rounded hover:bg-[#ebebeb] transition-colors text-[#7a7a7a] hover:text-[#1d1d1f]">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => removeTemplate(t.id)}
                    className="p-1 rounded hover:bg-[#ebebeb] transition-colors text-[#7a7a7a] hover:text-red-400">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <textarea
                value={t.body}
                onChange={e => updateTemplate(t.id, e.target.value)}
                rows={7}
                className="w-full px-3 py-2.5 text-[12px] text-[#3a3a3a] leading-relaxed resize-none outline-none font-mono bg-white placeholder:text-[#c0c0c0]"
                placeholder="Write your template here…"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Add person modal ──────────────────────────────────────── */}
      {addingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAddingPerson(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold">Add person</h2>
              <button onClick={() => setAddingPerson(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {(["name", "role", "organization", "email", "linkedin"] as const).map(field => (
                <div key={field}>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">{field === "linkedin" ? "LinkedIn URL" : field}</label>
                  <input autoFocus={field === "name"}
                    value={personDraft[field]} onChange={e => setPersonDraft(d => ({ ...d, [field]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && field === "linkedin" && addPerson()}
                    placeholder={field === "name" ? "Full name" : field === "role" ? "Job title" : field === "organization" ? "Company" : field === "email" ? "Email" : "https://linkedin.com/in/…"}
                    className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
              ))}
              <button onClick={addPerson} disabled={!personDraft.name.trim()}
                className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add org modal ─────────────────────────────────────────── */}
      {addingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAddingOrg(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold">Add organization</h2>
              <button onClick={() => setAddingOrg(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Name</label>
                <input autoFocus value={orgDraft.name} onChange={e => setOrgDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Organization name"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Type</label>
                <select value={orgDraft.type} onChange={e => setOrgDraft(d => ({ ...d, type: e.target.value }))}
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none">
                  {ORG_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Location</label>
                <input value={orgDraft.location} onChange={e => setOrgDraft(d => ({ ...d, location: e.target.value }))}
                  placeholder="City, Country"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Website</label>
                <input value={orgDraft.website} onChange={e => setOrgDraft(d => ({ ...d, website: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Notes</label>
                <textarea value={orgDraft.notes} onChange={e => setOrgDraft(d => ({ ...d, notes: e.target.value }))}
                  rows={2} placeholder="Any notes…"
                  className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none resize-none" />
              </div>
              <button onClick={addOrg} disabled={!orgDraft.name.trim()}
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
