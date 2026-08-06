import { useState, useMemo, useRef, useEffect } from "react"
import { Plus, X, Lightbulb, FolderOpen, ArrowRight, ZoomIn, ZoomOut, Maximize2, List } from "lucide-react"

type ProjectStatus = "Active" | "Paused" | "Complete" | "Archived"
const PROJECT_STATUSES: ProjectStatus[] = ["Active", "Paused", "Complete", "Archived"]

const STATUS_STYLES: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  Active:   { bg: "bg-[#ecfdf5]", text: "text-[#065f46]", dot: "#5b9b8a" },
  Paused:   { bg: "bg-[#fef3e8]", text: "text-[#92400e]", dot: "#c4856a" },
  Complete: { bg: "bg-[#eef1fb]", text: "text-[#1e3a8a]", dot: "#4f7ab3" },
  Archived: { bg: "bg-[#f5f5f7]", text: "text-[#7a7a7a]", dot: "#c0c0c0" },
}

interface Project { id: string; name: string; description: string; status: ProjectStatus; tags: string; dueDate: string; createdAt: string }
interface Idea    { id: string; title: string; description: string; tags: string; createdAt: string }
interface Pos     { x: number; y: number }

const LS_PROJECTS = "workspace:projects"
const LS_IDEAS    = "workspace:ideas"
const LS_POS      = "workspace:canvas-positions"

function loadProjects(): Project[] { try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || "[]") } catch { return [] } }
function loadIdeas(): Idea[]       { try { return JSON.parse(localStorage.getItem(LS_IDEAS)    || "[]") } catch { return [] } }
function loadPos(): Record<string, Pos> { try { return JSON.parse(localStorage.getItem(LS_POS) || "{}") } catch { return {} } }
function saveProjects(p: Project[]) { localStorage.setItem(LS_PROJECTS, JSON.stringify(p)) }
function saveIdeas(i: Idea[])       { localStorage.setItem(LS_IDEAS,    JSON.stringify(i)) }
function savePos(p: Record<string, Pos>) { localStorage.setItem(LS_POS, JSON.stringify(p)) }

function parseTags(s: string) { return s.split(",").map(t => t.trim()).filter(Boolean) }
function formatDate(iso: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
const TAG_PALETTE = ["#eef1fb text-[#1e3a8a]", "#ecfdf5 text-[#065f46]", "#f5f0ff text-[#4c1d95]", "#fef3e8 text-[#92400e]"]
function tagColor(tag: string) {
  let h = 0; for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  const pair = TAG_PALETTE[h % TAG_PALETTE.length].split(" ")
  return { bg: pair[0], text: pair[1] }
}
function randPos(seed: number): Pos {
  return { x: 80 + (seed * 137 % 700), y: 60 + (seed * 97 % 400) }
}

const EMPTY_PROJECT = { name: "", description: "", status: "Active" as ProjectStatus, tags: "", dueDate: "" }
const EMPTY_IDEA    = { title: "", description: "", tags: "" }

// ── Card components ──────────────────────────────────────────────

function ProjectCard({ project, selected, onClick }: { project: Project; selected: boolean; onClick: () => void }) {
  const s = STATUS_STYLES[project.status]
  const tags = parseTags(project.tags)
  return (
    <div
      onClick={onClick}
      className={`bg-white border shadow-sm w-52 cursor-pointer transition-shadow hover:shadow-md ${selected ? "border-[#2c4470]/40 shadow-md" : "border-[#e0e0e0]"}`}
      style={{ userSelect: "none" }}
    >
      {/* Status bar */}
      <div className="h-1" style={{ background: STATUS_STYLES[project.status].dot }} />
      <div className="px-3 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${s.text}`}>{project.status}</span>
          {project.dueDate && <span className="text-[9px] text-[#a0a0a0]">{formatDate(project.dueDate)}</span>}
        </div>
        <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug mb-1">{project.name}</p>
        {project.description && (
          <p className="text-[11px] text-[#7a7a7a] leading-relaxed line-clamp-3">{project.description}</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map(t => {
              const c = tagColor(t)
              return <span key={t} className={`px-1.5 py-0.5 text-[9px] font-medium ${c.text}`} style={{ background: c.bg }}>{t}</span>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function IdeaCard({ idea, selected, onClick }: { idea: Idea; selected: boolean; onClick: () => void }) {
  const tags = parseTags(idea.tags)
  return (
    <div
      onClick={onClick}
      className={`w-44 border cursor-pointer shadow-sm transition-shadow hover:shadow-md ${selected ? "border-[#c4a000]/60 shadow-md" : "border-[#e8d88a]/40"}`}
      style={{ background: "#fdfbe8", userSelect: "none" }}
    >
      <div className="px-3 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Lightbulb size={10} className="text-[#9a8b6e] shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#9a8b6e]">Idea</span>
        </div>
        <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug mb-1">{idea.title}</p>
        {idea.description && (
          <p className="text-[11px] text-[#7a7a7a] leading-relaxed line-clamp-3">{idea.description}</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map(t => {
              const c = tagColor(t)
              return <span key={t} className={`px-1.5 py-0.5 text-[9px] font-medium ${c.text}`} style={{ background: c.bg }}>{t}</span>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────

export default function Projects() {
  const [projects, setProjects]           = useState<Project[]>(loadProjects)
  const [ideas, setIdeas]                 = useState<Idea[]>(loadIdeas)
  const [positions, setPositions]         = useState<Record<string, Pos>>(loadPos)
  const [view, setView]                   = useState<"canvas" | "list">("canvas")
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [adding, setAdding]               = useState<"project" | "idea" | null>(null)
  const [projectDraft, setProjectDraft]   = useState(EMPTY_PROJECT)
  const [ideaDraft, setIdeaDraft]         = useState(EMPTY_IDEA)
  const [zoom, setZoom]                   = useState(1)
  const [pan, setPan]                     = useState({ x: 60, y: 40 })
  const [isPanning, setIsPanning]         = useState(false)

  const panRef      = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const dragRef     = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ensure every item has a canvas position
  useEffect(() => {
    const next = { ...positions }
    let changed = false
    projects.forEach((p, i) => { if (!next[p.id]) { next[p.id] = randPos(i); changed = true } })
    ideas.forEach((idea, i)  => { if (!next[idea.id]) { next[idea.id] = randPos(projects.length + i + 50); changed = true } })
    if (changed) { setPositions(next); savePos(next) }
  }, [projects, ideas])

  const selectedProject = selectedId ? projects.find(p => p.id === selectedId) ?? null : null
  const selectedIdea    = selectedId ? ideas.find(i => i.id === selectedId) ?? null : null

  function updatePos(id: string, pos: Pos) {
    setPositions(prev => { const next = { ...prev, [id]: pos }; savePos(next); return next })
  }

  // Canvas pointer events
  function onCanvasDown(e: React.MouseEvent) {
    if (dragRef.current) return
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }
  function onCardDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const pos = positions[id] ?? { x: 0, y: 0 }
    // offset = clientX - (pan.x + pos.x * zoom)  →  how far the pointer is from card origin in screen space
    dragRef.current = {
      id,
      ox: e.clientX - pan.x - pos.x * zoom,
      oy: e.clientY - pan.y - pos.y * zoom,
    }
  }
  function onCanvasMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const { id, ox, oy } = dragRef.current
      // canvas pos = (screenPos - pan - offset) / zoom
      updatePos(id, { x: (e.clientX - pan.x - ox) / zoom, y: (e.clientY - pan.y - oy) / zoom })
      return
    }
    if (panRef.current) {
      // pan is in screen pixels directly
      setPan({ x: panRef.current.panX + (e.clientX - panRef.current.startX), y: panRef.current.panY + (e.clientY - panRef.current.startY) })
    }
  }
  function onCanvasUp() {
    dragRef.current = null
    panRef.current = null
    setIsPanning(false)
  }

  // CRUD
  function addProject() {
    if (!projectDraft.name.trim()) return
    const p: Project = { id: Date.now().toString(), ...projectDraft, name: projectDraft.name.trim(), createdAt: new Date().toISOString() }
    const updated = [p, ...projects]; setProjects(updated); saveProjects(updated)
    const pos = { x: 80 + Math.random() * 600, y: 60 + Math.random() * 350 }
    updatePos(p.id, pos)
    setAdding(null); setProjectDraft(EMPTY_PROJECT); setSelectedId(p.id)
  }
  function addIdea() {
    if (!ideaDraft.title.trim()) return
    const i: Idea = { id: Date.now().toString(), ...ideaDraft, title: ideaDraft.title.trim(), createdAt: new Date().toISOString() }
    const updated = [i, ...ideas]; setIdeas(updated); saveIdeas(updated)
    const pos = { x: 80 + Math.random() * 600, y: 60 + Math.random() * 350 }
    updatePos(i.id, pos)
    setAdding(null); setIdeaDraft(EMPTY_IDEA); setSelectedId(i.id)
  }
  function convertToProject(idea: Idea) {
    const p: Project = { id: Date.now().toString(), name: idea.title, description: idea.description, status: "Active", tags: idea.tags, dueDate: "", createdAt: new Date().toISOString() }
    const updatedP = [p, ...projects]; setProjects(updatedP); saveProjects(updatedP)
    const updatedI = ideas.filter(i => i.id !== idea.id); setIdeas(updatedI); saveIdeas(updatedI)
    updatePos(p.id, positions[idea.id] ?? { x: 200, y: 200 })
    setSelectedId(p.id)
  }
  function updateStatus(id: string, status: ProjectStatus) {
    const updated = projects.map(p => p.id === id ? { ...p, status } : p)
    setProjects(updated); saveProjects(updated)
  }
  function removeProject(id: string) {
    const updated = projects.filter(p => p.id !== id); setProjects(updated); saveProjects(updated)
    if (selectedId === id) setSelectedId(null)
  }
  function removeIdea(id: string) {
    const updated = ideas.filter(i => i.id !== id); setIdeas(updated); saveIdeas(updated)
    if (selectedId === id) setSelectedId(null)
  }

  // ── Canvas view ───────────────────────────────────────────────
  if (view === "canvas") {
    return (
      <div className="flex flex-col h-full w-full relative">

        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
          <button onClick={() => setAdding("project")} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#e0e0e0] shadow-sm text-[11px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
            <Plus size={11} className="text-[#4f7ab3]" /> Project
          </button>
          <button onClick={() => setAdding("idea")} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#e0e0e0] shadow-sm text-[11px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
            <Plus size={11} className="text-[#9a8b6e]" /> Idea
          </button>
          <button onClick={() => setView("list")} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#e0e0e0] shadow-sm text-[11px] text-[#7a7a7a] hover:bg-[#f5f5f7] transition-colors">
            <List size={11} /> List
          </button>
        </div>

        {/* Zoom */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.2))} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomIn size={11} className="text-[#7a7a7a]" /></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomOut size={11} className="text-[#7a7a7a]" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 60, y: 40 }) }} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><Maximize2 size={11} className="text-[#7a7a7a]" /></button>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-white"
          style={{
            cursor: isPanning || dragRef.current ? "grabbing" : "grab",
            backgroundImage: "radial-gradient(circle, #d8d8d8 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onMouseDown={onCanvasDown}
          onMouseMove={onCanvasMove}
          onMouseUp={onCanvasUp}
          onMouseLeave={onCanvasUp}
        >
          <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {projects.map(p => {
              const pos = positions[p.id]
              if (!pos) return null
              return (
                <div
                  key={p.id}
                  style={{ position: "absolute", left: pos.x, top: pos.y }}
                  onMouseDown={e => onCardDown(e, p.id)}
                >
                  <ProjectCard project={p} selected={selectedId === p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)} />
                </div>
              )
            })}
            {ideas.map(idea => {
              const pos = positions[idea.id]
              if (!pos) return null
              return (
                <div
                  key={idea.id}
                  style={{ position: "absolute", left: pos.x, top: pos.y }}
                  onMouseDown={e => onCardDown(e, idea.id)}
                >
                  <IdeaCard idea={idea} selected={selectedId === idea.id} onClick={() => setSelectedId(selectedId === idea.id ? null : idea.id)} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected detail panel */}
        {(selectedProject || selectedIdea) && (
          <div className="absolute right-3 top-3 bottom-3 z-20 w-60 bg-white border border-[#e0e0e0] shadow-lg flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0]">
              <p className="text-[12px] font-semibold text-[#1d1d1f] truncate flex-1 pr-2">
                {selectedProject?.name ?? selectedIdea?.title}
              </p>
              <button onClick={() => setSelectedId(null)}><X size={13} className="text-[#7a7a7a]" /></button>
            </div>

            <div className="flex flex-col gap-4 px-4 py-4 flex-1">
              {selectedProject && (
                <>
                  {selectedProject.description && <p className="text-[12px] text-[#7a7a7a] leading-relaxed">{selectedProject.description}</p>}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a0a0a0] mb-2">Status</p>
                    <div className="flex flex-col gap-1">
                      {PROJECT_STATUSES.map(s => (
                        <button key={s} onClick={() => updateStatus(selectedProject.id, s)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 text-[12px] transition-colors ${selectedProject.status === s ? `${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} font-semibold` : "hover:bg-[#f5f5f7] text-[#7a7a7a]"}`}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_STYLES[s].dot }} /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedProject.dueDate && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#a0a0a0] mb-1">Due</p>
                      <p className="text-[12px] text-[#1d1d1f]">{formatDate(selectedProject.dueDate)}</p>
                    </div>
                  )}
                  {selectedProject.tags && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#a0a0a0] mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {parseTags(selectedProject.tags).map(t => {
                          const c = tagColor(t)
                          return <span key={t} className={`px-2 py-0.5 text-[10px] font-medium ${c.text}`} style={{ background: c.bg }}>{t}</span>
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={() => removeProject(selectedProject.id)} className="mt-auto text-[11px] text-[#7a7a7a] hover:text-red-600 transition-colors text-left">Delete project</button>
                </>
              )}

              {selectedIdea && (
                <>
                  {selectedIdea.description && <p className="text-[12px] text-[#7a7a7a] leading-relaxed">{selectedIdea.description}</p>}
                  {selectedIdea.tags && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#a0a0a0] mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {parseTags(selectedIdea.tags).map(t => {
                          const c = tagColor(t)
                          return <span key={t} className={`px-2 py-0.5 text-[10px] font-medium ${c.text}`} style={{ background: c.bg }}>{t}</span>
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={() => convertToProject(selectedIdea)} className="flex items-center gap-1.5 px-3 py-2 bg-[#1d1d1f] text-white text-[11px] font-medium hover:bg-[#2d2d2f] transition-colors">
                    <ArrowRight size={11} /> Convert to project
                  </button>
                  <button onClick={() => removeIdea(selectedIdea.id)} className="mt-auto text-[11px] text-[#7a7a7a] hover:text-red-600 transition-colors text-left">Delete idea</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        {adding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(null)}>
            <div className="bg-white shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1d1d1f]">New {adding}</h2>
                <button onClick={() => setAdding(null)}><X size={15} className="text-[#7a7a7a]" /></button>
              </div>
              {adding === "project" ? (
                <div className="flex flex-col gap-3">
                  <input autoFocus value={projectDraft.name} onChange={e => setProjectDraft(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addProject()} placeholder="Project name"
                    className="w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                  <textarea value={projectDraft.description} onChange={e => setProjectDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Description (optional)" rows={3}
                    className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 resize-none" />
                  <select value={projectDraft.status} onChange={e => setProjectDraft(d => ({ ...d, status: e.target.value as ProjectStatus }))}
                    className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] bg-white focus:outline-none">
                    {PROJECT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <input value={projectDraft.tags} onChange={e => setProjectDraft(d => ({ ...d, tags: e.target.value }))}
                    placeholder="Tags (comma separated)" className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none" />
                  <input type="date" value={projectDraft.dueDate} onChange={e => setProjectDraft(d => ({ ...d, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none" />
                  <button onClick={addProject} disabled={!projectDraft.name.trim()}
                    className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
                    Add to canvas
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <input autoFocus value={ideaDraft.title} onChange={e => setIdeaDraft(d => ({ ...d, title: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addIdea()} placeholder="Idea title"
                    className="w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                  <textarea value={ideaDraft.description} onChange={e => setIdeaDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Describe it…" rows={3}
                    className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none resize-none" />
                  <input value={ideaDraft.tags} onChange={e => setIdeaDraft(d => ({ ...d, tags: e.target.value }))}
                    placeholder="Tags (comma separated)" className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none" />
                  <button onClick={addIdea} disabled={!ideaDraft.title.trim()}
                    className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">
                    Add to canvas
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── List view fallback ────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setView("canvas")} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-white border border-[#e0e0e0] hover:bg-[#f5f5f7] transition-colors">
          <FolderOpen size={12} /> Canvas
        </button>
        <button onClick={() => setAdding("project")} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors ml-auto">
          <Plus size={12} /> Add project
        </button>
        <button onClick={() => setAdding("idea")} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-white border border-[#e0e0e0] hover:bg-[#f5f5f7] transition-colors">
          <Plus size={12} /> Add idea
        </button>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-[#7a7a7a] mb-2">Projects</p>
          <div className="flex flex-col gap-2">
            {projects.map(p => {
              const s = STATUS_STYLES[p.status]
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 border border-[#e0e0e0] bg-white">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_STYLES[p.status].dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">{p.name}</p>
                    {p.description && <p className="text-[11px] text-[#7a7a7a] truncate">{p.description}</p>}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 ${s.bg} ${s.text}`}>{p.status}</span>
                  <button onClick={() => removeProject(p.id)}><X size={11} className="text-[#c0c0c0] hover:text-[#1d1d1f]" /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ideas */}
      {ideas.length > 0 && (
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-[#7a7a7a] mb-2">Ideas</p>
          <div className="flex flex-col gap-2">
            {ideas.map(i => (
              <div key={i.id} className="flex items-center gap-4 px-4 py-3 border border-[#e8d88a]/40 bg-[#fdfbe8]">
                <Lightbulb size={12} className="text-[#9a8b6e] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">{i.title}</p>
                  {i.description && <p className="text-[11px] text-[#7a7a7a] truncate">{i.description}</p>}
                </div>
                <button onClick={() => convertToProject(i)} className="text-[10px] font-medium px-2 py-1 bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] flex items-center gap-1">
                  <ArrowRight size={9} /> Project
                </button>
                <button onClick={() => removeIdea(i.id)}><X size={11} className="text-[#c0c0c0] hover:text-[#1d1d1f]" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && ideas.length === 0 && (
        <div className="text-center py-16 text-[#7a7a7a]">
          <FolderOpen size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px] font-medium text-[#1d1d1f]">Canvas is empty</p>
          <p className="text-[12px] mt-1">Add a project or idea to get started.</p>
        </div>
      )}

      {/* Modals */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(null)}>
          <div className="bg-white shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">New {adding}</h2>
              <button onClick={() => setAdding(null)}><X size={15} className="text-[#7a7a7a]" /></button>
            </div>
            {adding === "project" ? (
              <div className="flex flex-col gap-3">
                <input autoFocus value={projectDraft.name} onChange={e => setProjectDraft(d => ({ ...d, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addProject()} placeholder="Project name"
                  className="w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none" />
                <textarea value={projectDraft.description} onChange={e => setProjectDraft(d => ({ ...d, description: e.target.value }))}
                  placeholder="Description" rows={3} className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none resize-none" />
                <button onClick={addProject} disabled={!projectDraft.name.trim()}
                  className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium disabled:opacity-40">Add</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input autoFocus value={ideaDraft.title} onChange={e => setIdeaDraft(d => ({ ...d, title: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addIdea()} placeholder="Idea title"
                  className="w-full px-3 py-2 text-[13px] border border-[#e0e0e0] focus:outline-none" />
                <textarea value={ideaDraft.description} onChange={e => setIdeaDraft(d => ({ ...d, description: e.target.value }))}
                  placeholder="Describe it…" rows={3} className="w-full px-3 py-2 text-[12px] border border-[#e0e0e0] focus:outline-none resize-none" />
                <button onClick={addIdea} disabled={!ideaDraft.title.trim()}
                  className="py-2 bg-[#1d1d1f] text-white text-[13px] font-medium disabled:opacity-40">Add</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
