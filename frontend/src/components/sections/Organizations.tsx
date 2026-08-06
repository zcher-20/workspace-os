import { useState, useMemo } from "react"
import { Search, Plus, X, Building, Calendar, MapPin, Globe, ChevronRight } from "lucide-react"

interface Organization {
  id: string
  name: string
  type: string
  location: string
  website: string
  notes: string
  createdAt: string
}

interface OrgEvent {
  id: string
  name: string
  organizer: string
  date: string
  location: string
  notes: string
  createdAt: string
}

const LS_ORGS = "workspace:organizations"
const LS_EVENTS = "workspace:events"
function loadOrgs(): Organization[] { try { return JSON.parse(localStorage.getItem(LS_ORGS) || "[]") } catch { return [] } }
function loadEvents(): OrgEvent[] { try { return JSON.parse(localStorage.getItem(LS_EVENTS) || "[]") } catch { return [] } }
function saveOrgs(o: Organization[]) { localStorage.setItem(LS_ORGS, JSON.stringify(o)) }
function saveEvents(e: OrgEvent[]) { localStorage.setItem(LS_EVENTS, JSON.stringify(e)) }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const ORG_TYPES = ["Company", "University", "Nonprofit", "Government", "Research Lab", "Startup", "Other"]

export default function Organizations() {
  const [tab, setTab] = useState<"orgs" | "events">("orgs")
  const [orgs, setOrgs] = useState<Organization[]>(loadOrgs)
  const [events, setEvents] = useState<OrgEvent[]>(loadEvents)
  const [search, setSearch] = useState("")
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<OrgEvent | null>(null)
  const [adding, setAdding] = useState(false)
  const [orgDraft, setOrgDraft] = useState({ name: "", type: "Company", location: "", website: "", notes: "" })
  const [eventDraft, setEventDraft] = useState({ name: "", organizer: "", date: "", location: "", notes: "" })

  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase()
    return orgs.filter(o => !q || o.name.toLowerCase().includes(q) || o.location.toLowerCase().includes(q) || o.type.toLowerCase().includes(q))
  }, [orgs, search])

  const filteredEvents = useMemo(() => {
    const q = search.toLowerCase()
    return events.filter(e => !q || e.name.toLowerCase().includes(q) || e.organizer.toLowerCase().includes(q) || e.location.toLowerCase().includes(q))
  }, [events, search])

  function addOrg() {
    if (!orgDraft.name.trim()) return
    const o: Organization = { id: Date.now().toString(), ...orgDraft, name: orgDraft.name.trim(), createdAt: new Date().toISOString() }
    const updated = [o, ...orgs]; setOrgs(updated); saveOrgs(updated)
    setAdding(false); setOrgDraft({ name: "", type: "Company", location: "", website: "", notes: "" })
  }

  function addEvent() {
    if (!eventDraft.name.trim()) return
    const e: OrgEvent = { id: Date.now().toString(), ...eventDraft, name: eventDraft.name.trim(), createdAt: new Date().toISOString() }
    const updated = [e, ...events]; setEvents(updated); saveEvents(updated)
    setAdding(false); setEventDraft({ name: "", organizer: "", date: "", location: "", notes: "" })
  }

  function removeOrg(id: string) {
    const updated = orgs.filter(o => o.id !== id); setOrgs(updated); saveOrgs(updated)
    if (selectedOrg?.id === id) setSelectedOrg(null)
  }

  function removeEvent(id: string) {
    const updated = events.filter(e => e.id !== id); setEvents(updated); saveEvents(updated)
    if (selectedEvent?.id === id) setSelectedEvent(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + toolbar */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex gap-0.5 bg-[#f0f0f0] rounded-lg p-0.5">
          {(["orgs", "events"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); setSelectedOrg(null); setSelectedEvent(null) }}
              className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${tab === t ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#7a7a7a] hover:text-[#1d1d1f]"}`}
            >
              {t === "orgs" ? "Organizations" : "Events"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab === "orgs" ? "organizations" : "events"}…`}
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
          />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors"
        >
          <Plus size={13} /> Add {tab === "orgs" ? "organization" : "event"}
        </button>
      </div>

      {/* Content */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* List */}
        <div className="flex flex-col gap-2 w-72 shrink-0 overflow-y-auto">
          {tab === "orgs" && filteredOrgs.map(o => (
            <button
              key={o.id}
              onClick={() => setSelectedOrg(o)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left border transition-colors ${selectedOrg?.id === o.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}
            >
              <div className="w-9 h-9 rounded-lg bg-[#eef1fb] flex items-center justify-center shrink-0">
                <Building size={16} className="text-[#2c4470]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{o.name}</p>
                <p className="text-[11px] text-[#7a7a7a] truncate">{o.type}{o.location ? ` · ${o.location}` : ""}</p>
              </div>
              <ChevronRight size={12} className="text-[#c0c0c0] shrink-0" />
            </button>
          ))}
          {tab === "events" && filteredEvents.map(e => (
            <button
              key={e.id}
              onClick={() => setSelectedEvent(e)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left border transition-colors ${selectedEvent?.id === e.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}
            >
              <div className="w-9 h-9 rounded-lg bg-[#fce7f3] flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-[#9d174d]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{e.name}</p>
                <p className="text-[11px] text-[#7a7a7a] truncate">{e.organizer}{e.date ? ` · ${formatDate(e.date)}` : ""}</p>
              </div>
              <ChevronRight size={12} className="text-[#c0c0c0] shrink-0" />
            </button>
          ))}
          {((tab === "orgs" && filteredOrgs.length === 0) || (tab === "events" && filteredEvents.length === 0)) && (
            <div className="text-center py-12 text-[12px] text-[#7a7a7a]">Nothing here yet.</div>
          )}
        </div>

        {/* Detail */}
        {(selectedOrg || selectedEvent) ? (
          <div className="flex-1 bg-white rounded-2xl border border-[#e0e0e0] p-6 overflow-y-auto">
            {selectedOrg && (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#eef1fb] flex items-center justify-center">
                      <Building size={22} className="text-[#2c4470]" />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-semibold text-[#1d1d1f]">{selectedOrg.name}</h2>
                      <p className="text-[12px] text-[#7a7a7a]">{selectedOrg.type}</p>
                    </div>
                  </div>
                  <button onClick={() => removeOrg(selectedOrg.id)}><X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" /></button>
                </div>
                <div className="flex flex-col gap-3 text-[13px]">
                  {selectedOrg.location && <div className="flex items-center gap-2 text-[#7a7a7a]"><MapPin size={13} />{selectedOrg.location}</div>}
                  {selectedOrg.website && <div className="flex items-center gap-2 text-[#7a7a7a]"><Globe size={13} /><a href={selectedOrg.website} target="_blank" rel="noreferrer" className="hover:text-[#2c4470] underline">{selectedOrg.website}</a></div>}
                  {selectedOrg.notes && <p className="mt-2 text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2.5 text-[12px]">{selectedOrg.notes}</p>}
                </div>
              </>
            )}
            {selectedEvent && (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#fce7f3] flex items-center justify-center">
                      <Calendar size={22} className="text-[#9d174d]" />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-semibold text-[#1d1d1f]">{selectedEvent.name}</h2>
                      <p className="text-[12px] text-[#7a7a7a]">{selectedEvent.organizer}</p>
                    </div>
                  </div>
                  <button onClick={() => removeEvent(selectedEvent.id)}><X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" /></button>
                </div>
                <div className="flex flex-col gap-3 text-[13px]">
                  {selectedEvent.date && <div className="flex items-center gap-2 text-[#7a7a7a]"><Calendar size={13} />{formatDate(selectedEvent.date)}</div>}
                  {selectedEvent.location && <div className="flex items-center gap-2 text-[#7a7a7a]"><MapPin size={13} />{selectedEvent.location}</div>}
                  {selectedEvent.notes && <p className="mt-2 text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2.5 text-[12px]">{selectedEvent.notes}</p>}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-[#7a7a7a]">
            <p className="text-[13px]">Select an item to view details.</p>
          </div>
        )}
      </div>

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add {tab === "orgs" ? "organization" : "event"}</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            {tab === "orgs" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Name</label>
                  <input autoFocus value={orgDraft.name} onChange={e => setOrgDraft(d => ({ ...d, name: e.target.value }))} placeholder="Organization name" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Type</label>
                  <select value={orgDraft.type} onChange={e => setOrgDraft(d => ({ ...d, type: e.target.value }))} className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none">
                    {ORG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Location</label>
                  <input value={orgDraft.location} onChange={e => setOrgDraft(d => ({ ...d, location: e.target.value }))} placeholder="City, Country" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Website</label>
                  <input value={orgDraft.website} onChange={e => setOrgDraft(d => ({ ...d, website: e.target.value }))} placeholder="https://…" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Notes</label>
                  <textarea value={orgDraft.notes} onChange={e => setOrgDraft(d => ({ ...d, notes: e.target.value }))} rows={2} placeholder="Any notes…" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 resize-none" />
                </div>
                <button onClick={addOrg} disabled={!orgDraft.name.trim()} className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">Add</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Event name</label>
                  <input autoFocus value={eventDraft.name} onChange={e => setEventDraft(d => ({ ...d, name: e.target.value }))} placeholder="Event name" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Organizer</label>
                  <input value={eventDraft.organizer} onChange={e => setEventDraft(d => ({ ...d, organizer: e.target.value }))} placeholder="Organizing entity" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Date</label>
                  <input type="date" value={eventDraft.date} onChange={e => setEventDraft(d => ({ ...d, date: e.target.value }))} className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Location</label>
                  <input value={eventDraft.location} onChange={e => setEventDraft(d => ({ ...d, location: e.target.value }))} placeholder="Venue or virtual" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Notes</label>
                  <textarea value={eventDraft.notes} onChange={e => setEventDraft(d => ({ ...d, notes: e.target.value }))} rows={2} placeholder="Any notes…" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 resize-none" />
                </div>
                <button onClick={addEvent} disabled={!eventDraft.name.trim()} className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">Add</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
