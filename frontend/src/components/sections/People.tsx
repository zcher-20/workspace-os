import { useState, useMemo } from "react"
import {
  Search, Plus, X, MessageSquare, Clock, CheckCircle, ChevronRight,
  Building, MapPin, Globe, ChevronLeft,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface Interaction { id: string; date: string; summary: string }

interface Person {
  id: string; name: string; role: string; organization: string
  email: string; needsFollowup: boolean; interactions: Interaction[]; createdAt: string
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

const LS_PEOPLE = "workspace:people"
const LS_ORGS   = "workspace:organizations"
const LS_CAL    = "workspace:calendar-events"

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
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// ── Calendar sub-component ─────────────────────────────────────────

function MiniCalendar({
  year, month, events, selected,
  onPrev, onNext, onSelectDay,
}: {
  year: number; month: number; events: CalEvent[]
  selected: string | null
  onPrev: () => void; onNext: () => void
  onSelectDay: (d: string) => void
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)

  const today = new Date()
  const todayStr = padDate(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="p-1 hover:text-[#1d1d1f] text-[#7a7a7a] transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-[12px] font-semibold text-[#1d1d1f]">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={onNext} className="p-1 hover:text-[#1d1d1f] text-[#7a7a7a] transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-[#b0b0b0] py-0.5">{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} />
          const dateStr = padDate(year, month, d)
          const hasEvents = events.some(e => e.date === dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selected
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDay(dateStr)}
              className={`flex flex-col items-center py-0.5 rounded transition-colors ${
                isSelected ? "bg-[#1d1d1f] text-white" :
                isToday    ? "bg-[#f0f0f0] text-[#1d1d1f]" :
                             "hover:bg-[#f5f5f7] text-[#1d1d1f]"
              }`}
            >
              <span className="text-[11px] leading-none py-1">{d}</span>
              {hasEvents && (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white/70" : "bg-[#b08a8a]"}`} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────

export default function People() {
  const [tab, setTab] = useState<"people" | "orgs">("people")
  const [people, setPeople]   = useState<Person[]>(loadPeople)
  const [orgs, setOrgs]       = useState<Organization[]>(loadOrgs)
  const [calEvents, setCalEvents] = useState<CalEvent[]>(loadCal)

  const [search, setSearch]           = useState("")
  const [filterFollowup, setFilterFollowup] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedOrg,    setSelectedOrg]    = useState<Organization | null>(null)
  const [interactionText, setInteractionText] = useState("")

  // Calendar state
  const today = new Date()
  const [calYear,   setCalYear]   = useState(today.getFullYear())
  const [calMonth,  setCalMonth]  = useState(today.getMonth())
  const [selDay,    setSelDay]    = useState<string | null>(null)
  const [addingEvent, setAddingEvent] = useState(false)
  const [evtDraft, setEvtDraft] = useState({ title: "", notes: "" })

  // Add modals
  const [addingPerson, setAddingPerson] = useState(false)
  const [addingOrg,    setAddingOrg]    = useState(false)
  const [personDraft, setPersonDraft] = useState({ name: "", role: "", organization: "", email: "" })
  const [orgDraft,    setOrgDraft]    = useState({ name: "", type: "Company", location: "", website: "", notes: "" })

  // Derived
  const activePerson = selectedPerson ? people.find(p => p.id === selectedPerson.id) ?? null : null
  const activeOrg    = selectedOrg    ? orgs.find(o => o.id === selectedOrg.id) ?? null    : null

  const filteredPeople = useMemo(() => people.filter(p => {
    if (filterFollowup && !p.needsFollowup) return false
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.organization.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
  }), [people, search, filterFollowup])

  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase()
    return orgs.filter(o => !q || o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q) || o.location.toLowerCase().includes(q))
  }, [orgs, search])

  const dayEvents = selDay ? calEvents.filter(e => e.date === selDay) : []

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
    const o: Organization = {
      id: Date.now().toString(), ...orgDraft, name: orgDraft.name.trim(), createdAt: new Date().toISOString(),
    }
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
  function removePerson(id: string) {
    mutatePeople(people.filter(p => p.id !== id))
    if (activePerson?.id === id) setSelectedPerson(null)
  }
  function removeOrg(id: string) {
    mutateOrgs(orgs.filter(o => o.id !== id))
    if (activeOrg?.id === id) setSelectedOrg(null)
  }
  function addCalEvent() {
    if (!evtDraft.title.trim() || !selDay) return
    const linkedId = tab === "people" ? activePerson?.id : activeOrg?.id
    const linkedType = tab === "people" ? "person" as const : "org" as const
    const e: CalEvent = {
      id: Date.now().toString(), date: selDay, title: evtDraft.title.trim(),
      notes: evtDraft.notes || undefined,
      linkedId: linkedId || undefined,
      linkedType: linkedId ? linkedType : undefined,
    }
    mutateCal([...calEvents, e]); setEvtDraft({ title: "", notes: "" }); setAddingEvent(false)
  }
  function removeCalEvent(id: string) { mutateCal(calEvents.filter(e => e.id !== id)) }

  return (
    <div className="flex gap-4 h-full">

      {/* ── Left: list panel ──────────────────────────────────────── */}
      <div className="flex flex-col w-64 shrink-0">
        {/* Tab switcher */}
        <div className="flex gap-0.5 bg-[#f0f0f0] rounded-lg p-0.5 mb-3">
          {(["people", "orgs"] as const).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setSearch(""); setSelectedPerson(null); setSelectedOrg(null) }}
              className={`flex-1 py-1.5 rounded-md text-[12px] font-medium transition-colors ${tab === t ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
              {t === "people" ? "People" : "Organizations"}
            </button>
          ))}
        </div>

        {/* Search + Add */}
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

        {/* Follow-up filter (people only) */}
        {tab === "people" && (
          <button onClick={() => setFilterFollowup(f => !f)}
            className={`flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg text-[12px] font-medium border transition-colors ${filterFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "bg-white border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
            <Clock size={12} /> Needs follow-up
            {people.filter(p => p.needsFollowup).length > 0 && (
              <span className="ml-auto bg-[#92400e] text-white rounded-full text-[10px] px-1.5 py-0.5 leading-none">
                {people.filter(p => p.needsFollowup).length}
              </span>
            )}
          </button>
        )}

        {/* List */}
        <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
          {tab === "people" && filteredPeople.map(p => (
            <button key={p.id} onClick={() => { setSelectedPerson(p); setSelectedOrg(null) }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-colors ${activePerson?.id === p.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                style={{ background: avatarColor(p.id) }}>
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{p.name}</p>
                <p className="text-[11px] text-[#7a7a7a] truncate">{p.role}{p.organization ? ` · ${p.organization}` : ""}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.needsFollowup && <div className="w-1.5 h-1.5 rounded-full bg-[#c4856a]" />}
                <ChevronRight size={12} className="text-[#c0c0c0]" />
              </div>
            </button>
          ))}
          {tab === "orgs" && filteredOrgs.map(o => (
            <button key={o.id} onClick={() => { setSelectedOrg(o); setSelectedPerson(null) }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-colors ${activeOrg?.id === o.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}>
              <div className="w-8 h-8 rounded-lg bg-[#eef1fb] flex items-center justify-center shrink-0">
                <Building size={14} className="text-[#2c4470]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{o.name}</p>
                <p className="text-[11px] text-[#7a7a7a] truncate">{o.type}{o.location ? ` · ${o.location}` : ""}</p>
              </div>
              <ChevronRight size={12} className="text-[#c0c0c0] shrink-0" />
            </button>
          ))}
          {((tab === "people" && filteredPeople.length === 0) || (tab === "orgs" && filteredOrgs.length === 0)) && (
            <div className="text-center py-10 text-[12px] text-[#7a7a7a]">
              {(tab === "people" ? people : orgs).length === 0 ? "Nothing here yet." : "No results."}
            </div>
          )}
        </div>
      </div>

      {/* ── Middle: detail panel ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {activePerson && (
          <div className="bg-white rounded-2xl border border-[#e0e0e0] p-6 h-full overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shrink-0"
                  style={{ background: avatarColor(activePerson.id) }}>
                  {initials(activePerson.name)}
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1d1d1f]">{activePerson.name}</h2>
                  <p className="text-[12px] text-[#7a7a7a]">{activePerson.role}{activePerson.organization ? ` · ${activePerson.organization}` : ""}</p>
                  {activePerson.email && <p className="text-[11px] text-[#7a7a7a] mt-0.5">{activePerson.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleFollowup(activePerson.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${activePerson.needsFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
                  {activePerson.needsFollowup ? <><CheckCircle size={11} /> Following up</> : <><Clock size={11} /> Mark follow-up</>}
                </button>
                <button onClick={() => removePerson(activePerson.id)}>
                  <X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                </button>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Log interaction</p>
              <div className="flex gap-2">
                <input value={interactionText} onChange={e => setInteractionText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && logInteraction()}
                  placeholder="What happened? (met at conference, follow-up email…)"
                  className="flex-1 px-3 py-2 text-[12px] rounded-lg border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                <button onClick={logInteraction} disabled={!interactionText.trim()}
                  className="px-3 py-2 rounded-lg bg-[#1d1d1f] text-white text-[12px] hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors flex items-center gap-1.5">
                  <MessageSquare size={12} /> Log
                </button>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-3">Interaction history</p>
              {activePerson.interactions.length === 0
                ? <p className="text-[12px] text-[#7a7a7a] italic">No interactions recorded yet.</p>
                : <div className="relative ml-2 pl-4 border-l-2 border-[#f0f0f0] flex flex-col gap-3">
                    {activePerson.interactions.map(it => (
                      <div key={it.id} className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#2c4470] ring-4 ring-white" />
                        <p className="text-[11px] text-[#7a7a7a] mb-0.5">{fmtDate(it.date)}</p>
                        <p className="text-[13px] text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2">{it.summary}</p>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        )}

        {activeOrg && (
          <div className="bg-white rounded-2xl border border-[#e0e0e0] p-6 h-full overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#eef1fb] flex items-center justify-center">
                  <Building size={22} className="text-[#2c4470]" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1d1d1f]">{activeOrg.name}</h2>
                  <p className="text-[12px] text-[#7a7a7a]">{activeOrg.type}</p>
                </div>
              </div>
              <button onClick={() => removeOrg(activeOrg.id)}>
                <X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
              </button>
            </div>
            <div className="flex flex-col gap-3 text-[13px]">
              {activeOrg.location && <div className="flex items-center gap-2 text-[#7a7a7a]"><MapPin size={13} />{activeOrg.location}</div>}
              {activeOrg.website && (
                <div className="flex items-center gap-2 text-[#7a7a7a]">
                  <Globe size={13} />
                  <a href={activeOrg.website} target="_blank" rel="noreferrer" className="hover:text-[#2c4470] underline">
                    {activeOrg.website}
                  </a>
                </div>
              )}
              {activeOrg.notes && <p className="mt-2 text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2.5 text-[12px]">{activeOrg.notes}</p>}
            </div>
          </div>
        )}

        {!activePerson && !activeOrg && (
          <div className="flex items-center justify-center h-full text-center text-[#7a7a7a]">
            <div>
              <p className="text-[14px] font-medium text-[#1d1d1f]">
                {tab === "people" ? "Select a person" : "Select an organization"}
              </p>
              <p className="text-[12px] mt-1">View details and log interactions.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: calendar panel ─────────────────────────────────── */}
      <div className="w-56 shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-[#e0e0e0] p-4">
          <MiniCalendar
            year={calYear} month={calMonth} events={calEvents} selected={selDay}
            onPrev={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1) }}
            onNext={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1) }}
            onSelectDay={d => setSelDay(s => s === d ? null : d)}
          />
        </div>

        {/* Events for selected day */}
        {selDay && (
          <div className="bg-white rounded-2xl border border-[#e0e0e0] p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a]">
                {new Date(selDay + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              <button onClick={() => setAddingEvent(true)}
                className="p-1 rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors">
                <Plus size={11} />
              </button>
            </div>

            {addingEvent && (
              <div className="mb-3 flex flex-col gap-2">
                <input autoFocus value={evtDraft.title} onChange={e => setEvtDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="Event title…"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-[#e0e0e0] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                <input value={evtDraft.notes} onChange={e => setEvtDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  className="w-full px-2.5 py-1.5 text-[11px] border border-[#e0e0e0] rounded-md focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={addCalEvent} disabled={!evtDraft.title.trim()}
                    className="flex-1 py-1.5 rounded-md bg-[#1d1d1f] text-white text-[11px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
                    Add
                  </button>
                  <button onClick={() => { setAddingEvent(false); setEvtDraft({ title: "", notes: "" }) }}
                    className="px-3 py-1.5 rounded-md border border-[#e0e0e0] text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {dayEvents.length === 0 && !addingEvent && (
              <p className="text-[11px] text-[#b0b0b0] text-center py-4">No events this day</p>
            )}
            <div className="flex flex-col gap-2">
              {dayEvents.map(e => {
                const linked = e.linkedType === "person"
                  ? people.find(p => p.id === e.linkedId)?.name
                  : orgs.find(o => o.id === e.linkedId)?.name
                return (
                  <div key={e.id} className="flex items-start gap-2 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b08a8a] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-[#1d1d1f] font-medium leading-snug">{e.title}</p>
                      {linked && <p className="text-[10px] text-[#7a7a7a]">{linked}</p>}
                      {e.notes && <p className="text-[10px] text-[#a0a0a0]">{e.notes}</p>}
                    </div>
                    <button onClick={() => removeCalEvent(e.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} className="text-[#c0c0c0] hover:text-[#1d1d1f]" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Add person modal ─────────────────────────────────────── */}
      {addingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAddingPerson(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add person</h2>
              <button onClick={() => setAddingPerson(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {(["name", "role", "organization", "email"] as const).map(field => (
                <div key={field}>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">{field}</label>
                  <input autoFocus={field === "name"}
                    value={personDraft[field]} onChange={e => setPersonDraft(d => ({ ...d, [field]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && field === "email" && addPerson()}
                    placeholder={field === "name" ? "Full name" : field === "role" ? "Job title" : field === "organization" ? "Company / School" : "Email address"}
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
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add organization</h2>
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
