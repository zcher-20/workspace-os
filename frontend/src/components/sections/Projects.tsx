import { useState, useMemo } from "react"
import { Plus, X, Lightbulb, FolderOpen, ArrowRight, Search, Tag, ChevronRight } from "lucide-react"

type ProjectStatus = "Active" | "Paused" | "Complete" | "Archived"
const PROJECT_STATUSES: ProjectStatus[] = ["Active", "Paused", "Complete", "Archived"]

const STATUS_STYLES: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  Active:   { bg: "bg-[#ecfdf5]", text: "text-[#065f46]", dot: "bg-[#5b9b8a]" },
  Paused:   { bg: "bg-[#fef3e8]", text: "text-[#92400e]", dot: "bg-[#c4856a]" },
  Complete: { bg: "bg-[#eef1fb]", text: "text-[#1e3a8a]", dot: "bg-[#4f7ab3]" },
  Archived: { bg: "bg-[#f5f5f7]", text: "text-[#7a7a7a]", dot: "bg-[#c0c0c0]" },
}

interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  tags: string
  dueDate: string
  createdAt: string
}

interface Idea {
  id: string
  title: string
  description: string
  tags: string
  createdAt: string
}

const LS_PROJECTS = "workspace:projects"
const LS_IDEAS = "workspace:ideas"
function loadProjects(): Project[] { try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || "[]") } catch { return [] } }
function loadIdeas(): Idea[] { try { return JSON.parse(localStorage.getItem(LS_IDEAS) || "[]") } catch { return [] } }
function saveProjects(p: Project[]) { localStorage.setItem(LS_PROJECTS, JSON.stringify(p)) }
function saveIdeas(i: Idea[]) { localStorage.setItem(LS_IDEAS, JSON.stringify(i)) }

function parseTags(s: string) {
  return s.split(",").map(t => t.trim()).filter(Boolean)
}

function formatDate(iso: string) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const TAG_PALETTE = ["bg-[#eef1fb] text-[#1e3a8a]", "bg-[#ecfdf5] text-[#065f46]", "bg-[#f5f0ff] text-[#4c1d95]", "bg-[#fef3e8] text-[#92400e]", "bg-[#fce7f3] text-[#9d174d]"]
function tagColor(tag: string) {
  let h = 0; for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

const EMPTY_PROJECT = { name: "", description: "", status: "Active" as ProjectStatus, tags: "", dueDate: "" }
const EMPTY_IDEA = { title: "", description: "", tags: "" }

export default function Projects() {
  const [tab, setTab] = useState<"projects" | "ideas">("projects")
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [ideas, setIdeas] = useState<Idea[]>(loadIdeas)
  const [search, setSearch] = useState("")
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null)
  const [adding, setAdding] = useState(false)
  const [projectDraft, setProjectDraft] = useState(EMPTY_PROJECT)
  const [ideaDraft, setIdeaDraft] = useState(EMPTY_IDEA)

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter(p => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.toLowerCase().includes(q))
  }, [projects, search])

  const filteredIdeas = useMemo(() => {
    const q = search.toLowerCase()
    return ideas.filter(i => !q || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.toLowerCase().includes(q))
  }, [ideas, search])

  function addProject() {
    if (!projectDraft.name.trim()) return
    const p: Project = { id: Date.now().toString(), ...projectDraft, name: projectDraft.name.trim(), createdAt: new Date().toISOString() }
    const updated = [p, ...projects]; setProjects(updated); saveProjects(updated)
    setAdding(false); setProjectDraft(EMPTY_PROJECT)
  }

  function addIdea() {
    if (!ideaDraft.title.trim()) return
    const i: Idea = { id: Date.now().toString(), ...ideaDraft, title: ideaDraft.title.trim(), createdAt: new Date().toISOString() }
    const updated = [i, ...ideas]; setIdeas(updated); saveIdeas(updated)
    setAdding(false); setIdeaDraft(EMPTY_IDEA)
  }

  function convertIdeaToProject(idea: Idea) {
    const p: Project = {
      id: Date.now().toString(),
      name: idea.title, description: idea.description, status: "Active",
      tags: idea.tags, dueDate: "", createdAt: new Date().toISOString(),
    }
    const updatedProjects = [p, ...projects]; setProjects(updatedProjects); saveProjects(updatedProjects)
    const updatedIdeas = ideas.filter(i => i.id !== idea.id); setIdeas(updatedIdeas); saveIdeas(updatedIdeas)
    setTab("projects"); setSelectedProject(p); setSelectedIdea(null)
  }

  function updateProjectStatus(id: string, status: ProjectStatus) {
    const updated = projects.map(p => p.id === id ? { ...p, status } : p)
    setProjects(updated); saveProjects(updated)
    setSelectedProject(p => p?.id === id ? { ...p, status } : p)
  }

  function removeProject(id: string) {
    const updated = projects.filter(p => p.id !== id); setProjects(updated); saveProjects(updated)
    if (selectedProject?.id === id) setSelectedProject(null)
  }

  function removeIdea(id: string) {
    const updated = ideas.filter(i => i.id !== id); setIdeas(updated); saveIdeas(updated)
    if (selectedIdea?.id === id) setSelectedIdea(null)
  }

  const selectedProjectLive = selectedProject ? projects.find(p => p.id === selectedProject.id) ?? null : null

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + toolbar */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex gap-0.5 bg-[#f0f0f0] rounded-lg p-0.5">
          {(["projects", "ideas"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSearch(""); setSelectedProject(null); setSelectedIdea(null) }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${tab === t ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#7a7a7a] hover:text-[#1d1d1f]"}`}>
              {t === "projects" ? <FolderOpen size={12} /> : <Lightbulb size={12} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab}…`}
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-md border border-[#e0e0e0] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
        </div>
        <button onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#1d1d1f] text-white hover:bg-[#2d2d2f] transition-colors">
          <Plus size={13} /> Add {tab === "projects" ? "project" : "idea"}
        </button>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* List */}
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
          {tab === "projects" && (filteredProjects.length === 0 ? (
            <div className="text-center py-16 text-[#7a7a7a]">
              <FolderOpen size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-[13px] font-medium text-[#1d1d1f]">No projects yet</p>
              <p className="text-[12px] mt-1">Convert an idea or start a new project.</p>
            </div>
          ) : filteredProjects.map(p => {
            const s = STATUS_STYLES[p.status]
            const tags = parseTags(p.tags)
            return (
              <button key={p.id} onClick={() => setSelectedProject(p)}
                className={`group flex items-center gap-4 px-4 py-3.5 rounded-xl border text-left transition-colors ${selectedProjectLive?.id === p.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/70 border-[#e0e0e0] hover:border-[#2c4470]/20"}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">{p.name}</p>
                  {p.description && <p className="text-[11px] text-[#7a7a7a] truncate">{p.description}</p>}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {tags.slice(0, 4).map(t => (
                        <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColor(t)}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.dueDate && <span className="text-[11px] text-[#7a7a7a]">{formatDate(p.dueDate)}</span>}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{p.status}</span>
                  <ChevronRight size={12} className="text-[#c0c0c0]" />
                </div>
              </button>
            )
          }))}

          {tab === "ideas" && (filteredIdeas.length === 0 ? (
            <div className="text-center py-16 text-[#7a7a7a]">
              <Lightbulb size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-[13px] font-medium text-[#1d1d1f]">No ideas yet</p>
              <p className="text-[12px] mt-1">Capture ideas and convert them to projects when ready.</p>
            </div>
          ) : filteredIdeas.map(i => {
            const tags = parseTags(i.tags)
            return (
              <div key={i.id} className={`group flex items-start gap-4 px-4 py-3.5 rounded-xl border transition-colors cursor-pointer ${selectedIdea?.id === i.id ? "bg-white border-[#2c4470]/30 shadow-sm" : "bg-white/70 border-[#e0e0e0] hover:border-[#2c4470]/20"}`}
                onClick={() => setSelectedIdea(i)}>
                <Lightbulb size={15} className="text-[#9a8b6e] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">{i.title}</p>
                  {i.description && <p className="text-[11px] text-[#7a7a7a] line-clamp-1">{i.description}</p>}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {tags.slice(0, 4).map(t => <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColor(t)}`}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={e => { e.stopPropagation(); convertIdeaToProject(i) }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md bg-[#1d1d1f] text-white text-[10px] font-medium hover:bg-[#2d2d2f] transition-all">
                    <ArrowRight size={10} /> Project
                  </button>
                  <button onClick={e => { e.stopPropagation(); removeIdea(i.id) }} className="opacity-0 group-hover:opacity-100">
                    <X size={12} className="text-[#7a7a7a] hover:text-[#1d1d1f]" />
                  </button>
                </div>
              </div>
            )
          }))}
        </div>

        {/* Detail panel */}
        {(selectedProjectLive || selectedIdea) && (
          <div className="w-64 shrink-0 bg-white rounded-2xl border border-[#e0e0e0] p-5 flex flex-col gap-4 overflow-y-auto">
            {selectedProjectLive && (
              <>
                <div className="flex items-start justify-between">
                  <h3 className="text-[14px] font-semibold text-[#1d1d1f] leading-snug flex-1 pr-2">{selectedProjectLive.name}</h3>
                  <button onClick={() => setSelectedProject(null)}><X size={14} className="text-[#7a7a7a]" /></button>
                </div>
                {selectedProjectLive.description && <p className="text-[12px] text-[#7a7a7a] -mt-2">{selectedProjectLive.description}</p>}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Status</p>
                  <div className="flex flex-col gap-1">
                    {PROJECT_STATUSES.map(s => (
                      <button key={s} onClick={() => updateProjectStatus(selectedProjectLive.id, s)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${selectedProjectLive.status === s ? `${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} font-semibold` : "hover:bg-[#f5f5f7] text-[#7a7a7a]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} /> {s}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedProjectLive.dueDate && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-1">Due date</p>
                    <p className="text-[13px] text-[#1d1d1f]">{formatDate(selectedProjectLive.dueDate)}</p>
                  </div>
                )}
                {selectedProjectLive.tags && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {parseTags(selectedProjectLive.tags).map(t => <span key={t} className={`px-2 py-0.5 rounded text-[11px] font-medium ${tagColor(t)}`}>{t}</span>)}
                    </div>
                  </div>
                )}
                <button onClick={() => removeProject(selectedProjectLive.id)} className="mt-auto text-[11px] text-[#7a7a7a] hover:text-red-600 transition-colors text-left">Delete project</button>
              </>
            )}
            {selectedIdea && (
              <>
                <div className="flex items-start justify-between">
                  <h3 className="text-[14px] font-semibold text-[#1d1d1f] flex-1 pr-2">{selectedIdea.title}</h3>
                  <button onClick={() => setSelectedIdea(null)}><X size={14} className="text-[#7a7a7a]" /></button>
                </div>
                {selectedIdea.description && <p className="text-[12px] text-[#7a7a7a] -mt-2">{selectedIdea.description}</p>}
                {selectedIdea.tags && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {parseTags(selectedIdea.tags).map(t => <span key={t} className={`px-2 py-0.5 rounded text-[11px] font-medium ${tagColor(t)}`}>{t}</span>)}
                    </div>
                  </div>
                )}
                <button onClick={() => convertIdeaToProject(selectedIdea)}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1d1d1f] text-white text-[12px] font-medium hover:bg-[#2d2d2f] transition-colors">
                  <ArrowRight size={13} /> Convert to project
                </button>
                <button onClick={() => removeIdea(selectedIdea.id)} className="text-[11px] text-[#7a7a7a] hover:text-red-600 transition-colors text-left">Delete idea</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Add {tab === "projects" ? "project" : "idea"}</h2>
              <button onClick={() => setAdding(false)}><X size={16} className="text-[#7a7a7a]" /></button>
            </div>
            {tab === "projects" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Name</label>
                  <input autoFocus value={projectDraft.name} onChange={e => setProjectDraft(d => ({ ...d, name: e.target.value }))} placeholder="Project name" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Description</label>
                  <textarea value={projectDraft.description} onChange={e => setProjectDraft(d => ({ ...d, description: e.target.value }))} rows={2} placeholder="What is this about?" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Tags</label>
                  <input value={projectDraft.tags} onChange={e => setProjectDraft(d => ({ ...d, tags: e.target.value }))} placeholder="research, ML, design (comma-separated)" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Due date</label>
                  <input type="date" value={projectDraft.dueDate} onChange={e => setProjectDraft(d => ({ ...d, dueDate: e.target.value }))} className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none" />
                </div>
                <button onClick={addProject} disabled={!projectDraft.name.trim()} className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">Add</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Title</label>
                  <input autoFocus value={ideaDraft.title} onChange={e => setIdeaDraft(d => ({ ...d, title: e.target.value }))} placeholder="Idea title" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Description</label>
                  <textarea value={ideaDraft.description} onChange={e => setIdeaDraft(d => ({ ...d, description: e.target.value }))} rows={2} placeholder="Describe the idea…" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">Tags</label>
                  <input value={ideaDraft.tags} onChange={e => setIdeaDraft(d => ({ ...d, tags: e.target.value }))} placeholder="AI, research, startup (comma-separated)" className="mt-1 w-full px-3 py-1.5 text-[13px] rounded-md border border-[#e0e0e0] focus:outline-none" />
                </div>
                <button onClick={addIdea} disabled={!ideaDraft.title.trim()} className="mt-1 py-2 rounded-lg bg-[#1d1d1f] text-white text-[13px] font-medium hover:bg-[#2d2d2f] disabled:opacity-40 transition-colors">Add</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
