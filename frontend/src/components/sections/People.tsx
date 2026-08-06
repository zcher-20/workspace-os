import { useState, useMemo } from "react"
import { Search, Plus, X, MessageSquare, Clock, CheckCircle, ChevronRight } from "lucide-react"

interface Interaction {
  id: string
  date: string
  summary: string
}

interface Person {
  id: string
  name: string
  role: string
  organization: string
  email: string
  needsFollowup: boolean
  interactions: Interaction[]
  createdAt: string
}

const LS_KEY = "workspace:people"
function load(): Person[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") } catch { return [] } }
function save(p: Person[]) { localStorage.setItem(LS_KEY, JSON.stringify(p)) }

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase() || "?"
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const AVATAR_COLORS = ["#4f7ab3", "#5b9b8a", "#c4856a", "#b8769a", "#9a8b6e", "#6b7fa8"]
function avatarColor(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const EMPTY_DRAFT = { name: "", role: "", organization: "", email: "" }

export default function People() {
  const [people, setPeople] = useState<Person[]>(load)
  const [search, setSearch] = useState("")
  const [filterFollowup, setFilterFollowup] = useState(false)
  const [selected, setSelected] = useState<Person | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [interactionText, setInteractionText] = useState("")

  const filtered = useMemo(() => people.filter(p => {
    if (filterFollowup && !p.needsFollowup) return false
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.organization.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
  }), [people, search, filterFollowup])

  // Keep selected in sync with state
  const selectedPerson = selected ? people.find(p => p.id === selected.id) ?? null : null

  function mutate(updated: Person[]) { setPeople(updated); save(updated) }

  function addPerson() {
    if (!draft.name.trim()) return
    const p: Person = { id: Date.now().toString(), ...draft, name: draft.name.trim(), needsFollowup: false, interactions: [], createdAt: new Date().toISOString() }
    mutate([p, ...people])
    setAdding(false); setDraft(EMPTY_DRAFT)
  }

  function logInteraction() {
    if (!selectedPerson || !interactionText.trim()) return
    const interaction: Interaction = { id: Date.now().toString(), date: new Date().toISOString(), summary: interactionText.trim() }
    mutate(people.map(p => p.id === selectedPerson.id ? { ...p, interactions: [interaction, ...p.interactions] } : p))
    setInteractionText("")
  }

  function toggleFollowup(id: string) {
    mutate(people.map(p => p.id === id ? { ...p, needsFollowup: !p.needsFollowup } : p))
  }

  function removePerson(id: string) {
    mutate(people.filter(p => p.id !== id))
    if (selectedPerson?.id === id) setSelected(null)
  }

  return (
    <div className="flex gap-5 h-full">
      {/* Left: list */}
      <div className="flex flex-col w-72 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
            />
          </div>
          <button
            onClick={() => setAdding(true)}
            className="p-1.5 rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        <button
          onClick={() => setFilterFollowup(f => !f)}
          className={`flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg text-[12px] font-medium border transition-colors ${filterFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "bg-white border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}
        >
          <Clock size={12} /> Needs follow-up
          {people.filter(p => p.needsFollowup).length > 0 && (
            <span className="ml-auto bg-[#92400e] text-white rounded-full text-[10px] px-1.5 py-0.5 leading-none">
              {people.filter(p => p.needsFollowup).length}
            </span>
          )}
        </button>

        <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[#7a7a7a]">
              <p className="text-[12px]">{people.length === 0 ? "No people yet." : "No results."}</p>
            </div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-colors ${selectedPerson?.id === p.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/60 border-transparent hover:border-[#e0e0e0]"}`}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{ background: avatarColor(p.id) }}>
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
        </div>
      </div>

      {/* Right: detail */}
      {selectedPerson ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-[#e0e0e0] p-6 overflow-y-auto">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: avatarColor(selectedPerson.id) }}>
                {initials(selectedPerson.name)}
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-[#1d1d1f]">{selectedPerson.name}</h2>
                <p className="text-[12px] text-[#7a7a7a]">{selectedPerson.role}{selectedPerson.organization ? ` · ${selectedPerson.organization}` : ""}</p>
                {selectedPerson.email && <p className="text-[11px] text-[#7a7a7a] mt-0.5">{selectedPerson.email}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFollowup(selectedPerson.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${selectedPerson.needsFollowup ? "bg-[#fef3e8] text-[#92400e] border-[#f5c89a]" : "border-[#e0e0e0] text-[#7a7a7a] hover:text-[#1d1d1f]"}`}
              >
                {selectedPerson.needsFollowup ? <><CheckCircle size={11} /> Following up</> : <><Clock size={11} /> Mark follow-up</>}
              </button>
              <button onClick={() => removePerson(selectedPerson.id)}>
                <X size={14} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
              </button>
            </div>
          </div>

          {/* Log interaction */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Log interaction</p>
            <div className="flex gap-2">
              <input
                value={interactionText}
                onChange={e => setInteractionText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && logInteraction()}
                placeholder="What happened? (met at conference, sent follow-up email…)"
                className="flex-1 px-3 py-2 text-[12px] rounded-lg border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
              />
              <button
                onClick={logInteraction}
                disabled={!interactionText.trim()}
                className="px-3 py-2 rounded-lg bg-[#1d1d1f] text-white text-[12px] hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                <MessageSquare size={12} /> Log
              </button>
            </div>
          </div>

          {/* Interaction history */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-3">Interaction history</p>
            {selectedPerson.interactions.length === 0 ? (
              <p className="text-[12px] text-[#7a7a7a] italic">No interactions recorded yet.</p>
            ) : (
              <div className="relative ml-2 pl-4 border-l-2 border-[#f0f0f0] flex flex-col gap-3">
                {selectedPerson.interactions.map(i => (
                  <div key={i.id} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#2c4470] ring-4 ring-white" />
                    <p className="text-[11px] text-[#7a7a7a] mb-0.5">{formatDate(i.date)}</p>
                    <p className="text-[13px] text-[#1d1d1f] bg-[#f8f8f8] rounded-lg px-3 py-2">{i.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center text-[#7a7a7a]">
          <div>
            <p className="text-[14px] font-medium text-[#1d1d1f]">Select a person</p>
            <p className="text-[12px] mt-1">View their profile and log interactions.</p>
          </div>
        </div>
      )}

      {/* Add person modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add person</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {(["name", "role", "organization", "email"] as const).map(field => (
                <div key={field}>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">{field}</label>
                  <input
                    autoFocus={field === "name"}
                    value={draft[field]}
                    onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && field === "email" && addPerson()}
                    placeholder={field === "name" ? "Full name" : field === "role" ? "Job title" : field === "organization" ? "Company / School" : "Email address"}
                    className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30"
                  />
                </div>
              ))}
              <button
                onClick={addPerson}
                disabled={!draft.name.trim()}
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
