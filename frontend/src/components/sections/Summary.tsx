import { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { LayoutGrid, CheckSquare, Inbox, Clock, Reply, Check, RefreshCw, Sparkles, Plus, X } from "lucide-react"
import type { SummaryData } from "@/types"

const CUSTOM_TASKS_KEY = "enterprise-agent:custom-tasks"

interface CustomTask {
  id: string
  text: string
  done: boolean
}

interface SummaryState {
  summary: SummaryData
  email_count: number
  created_at: string
}

// ── Semantic color classification ──────────────────────────────

type SemanticTag = "meeting" | "deadline" | "opportunity" | "financial" | null

function classify(text: string): SemanticTag {
  const t = text.toLowerCase()
  if (t.match(/zoom|meeting|interview|call|session|conference|webinar/)) return "meeting"
  if (t.match(/deadline|due|submit|apply|application|expire|urgent|asap/))   return "deadline"
  if (t.match(/opportunity|internship|job|offer|position|role|fellowship|program|career/)) return "opportunity"
  if (t.match(/refund|payment|invoice|bill|charge|transaction|money|finance|subscription/)) return "financial"
  return null
}

const SEMANTIC: Record<NonNullable<SemanticTag>, { dot: string; badge: string; label: string; ring: string }> = {
  meeting:     { dot: "bg-[#1e3a8a]", badge: "bg-[#eef1fb] text-[#1e3a8a]", label: "Meeting",     ring: "#1e3a8a" },
  deadline:    { dot: "bg-[#92400e]", badge: "bg-[#fef3e8] text-[#92400e]", label: "Deadline",    ring: "#92400e" },
  opportunity: { dot: "bg-[#065f46]", badge: "bg-[#ecfdf5] text-[#065f46]", label: "Opportunity", ring: "#065f46" },
  financial:   { dot: "bg-[#4c1d95]", badge: "bg-[#f5f0ff] text-[#4c1d95]", label: "Financial",   ring: "#4c1d95" },
}

function SemanticDot({ tag }: { tag: SemanticTag }) {
  if (!tag) return <span className="mt-[6px] h-[8px] w-[8px] rounded-full bg-[#d0d0d0] shrink-0" />
  return <span className={`mt-[6px] h-[8px] w-[8px] rounded-full shrink-0 ${SEMANTIC[tag].dot}`} />
}

function SemanticPill({ tag }: { tag: SemanticTag }) {
  if (!tag) return null
  const s = SEMANTIC[tag]
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${s.badge}`}>
      {s.label}
    </span>
  )
}

// ── Section header ─────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[#1d1d1f]">
      <span className="text-[#7a7a7a]">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────

export default function Summary() {
  const [data, setData] = useState<SummaryState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [customTasks, setCustomTasks] = useState<CustomTask[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_TASKS_KEY) ?? "[]") } catch { return [] }
  })
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskText, setNewTaskText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(CUSTOM_TASKS_KEY, JSON.stringify(customTasks))
  }, [customTasks])

  useEffect(() => {
    if (addingTask) inputRef.current?.focus()
  }, [addingTask])

  const toggleChecked = useCallback((i: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }, [])

  function addTask() {
    if (!newTaskText.trim()) return
    setCustomTasks(prev => [...prev, { id: Date.now().toString(), text: newTaskText.trim(), done: false }])
    setNewTaskText("")
    setAddingTask(false)
  }

  function toggleCustomTask(id: string) {
    setCustomTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  function deleteCustomTask(id: string) {
    setCustomTasks(prev => prev.filter(t => t.id !== id))
  }

  async function load() {
    const res = await fetch("/api/summary/daily/latest")
    const d = await res.json()
    if (d.ok) setData(d)
  }

  useEffect(() => { load() }, [])

  async function generate() {
    setLoading(true); setError("")
    const res = await fetch("/api/summary/daily/generate", { method: "POST" })
    const d = await res.json()
    setLoading(false)
    if (d.ok) setData(d)
    else setError(d.error ?? "Failed to generate summary.")
  }

  return (
    <div className="space-y-8">
      <h2 className="text-[22px] font-bold tracking-tight text-center py-4">Daily Summary</h2>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!data && !loading && (
        <button
          onClick={generate}
          className="group w-full py-10 flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-[#d0d0d0] hover:border-[#2c4470]/40 hover:bg-[#f9f9fb] transition-all duration-200"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[#f0f0f5] group-hover:bg-[#e8eaf6] transition-colors">
            <Sparkles size={15} className="text-[#7a7a7a] group-hover:text-[#2c4470] transition-colors" />
          </span>
          <span className="text-[13px] text-[#7a7a7a] group-hover:text-[#1d1d1f] transition-colors">Generate today's summary</span>
        </button>
      )}

      {loading && (
        <div className="py-10 flex flex-col items-center gap-3">
          <RefreshCw size={15} className="text-[#7a7a7a] animate-spin" />
          <span className="text-[13px] text-[#7a7a7a]">Generating…</span>
        </div>
      )}

      {data && (
        <div className="space-y-8">

          {/* Overview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<LayoutGrid size={14} />}>Overview</SectionTitle>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {data.email_count} emails · {new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  onClick={generate}
                  disabled={loading}
                  title="Regenerate summary"
                  className="p-1 rounded-md text-[#b0b0b0] hover:text-[#2c4470] hover:bg-[#f0f0f5] transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-foreground">{data.summary.overview}</p>
          </div>

          {/* Action Items */}
          <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle icon={<CheckSquare size={14} />}>Action Items</SectionTitle>
                <button
                  onClick={() => setAddingTask(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#7a7a7a] hover:text-[#2c4470] transition-colors"
                >
                  <Plus size={11} /> Add task
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* AI-generated tasks */}
                {data.summary.action_items?.map((a, i) => {
                  const tag      = classify(a)
                  const lower    = a.toLowerCase()
                  const isJoin   = lower.includes("zoom") || lower.includes("meeting") || lower.includes("call")
                  const isDraft  = lower.includes("reply") || lower.includes("respond") || lower.includes("email")
                  const isOpen   = lower.includes("submit") || lower.includes("apply") || lower.includes("application") || lower.includes("deadline")
                  const isDone   = checked.has(i)
                  const dotColor = tag ? SEMANTIC[tag].ring : "#d0d0d0"
                  return (
                    <div
                      key={i}
                      className={`rounded-[12px] border p-4 flex flex-col gap-2.5 transition-all ${isDone ? "opacity-50 bg-[#fafafa]" : "bg-white"}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          onClick={() => toggleChecked(i)}
                          className="h-[18px] w-[18px] rounded-full border-2 shrink-0 flex items-center justify-center mt-[2px] transition-all duration-150"
                          style={{ borderColor: dotColor, backgroundColor: isDone ? dotColor : "transparent" }}
                        >
                          {isDone && <Check size={10} color="white" strokeWidth={3} />}
                        </button>
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                          <p className={`text-[13px] leading-snug ${isDone ? "line-through text-[#7a7a7a]" : "text-[#1d1d1f]"}`}>{a}</p>
                          <SemanticPill tag={tag} />
                        </div>
                      </div>
                      {!isDone && (
                        <div className="flex items-center gap-2 flex-wrap pl-[26px]">
                          {isJoin  && <button className="text-[11px] font-semibold text-white bg-[#2c4470] rounded-full px-3 py-0.5 hover:bg-[#1e3560] transition-colors">Join</button>}
                          {isDraft && <button className="text-[11px] font-semibold text-[#2c4470] border border-[#2c4470]/30 rounded-full px-3 py-0.5 hover:bg-[#2c4470]/5 transition-colors">Draft</button>}
                          {isOpen  && <button className="text-[11px] font-semibold text-[#2c4470] border border-[#2c4470]/30 rounded-full px-3 py-0.5 hover:bg-[#2c4470]/5 transition-colors">Open</button>}
                          {!isJoin && !isDraft && !isOpen && <button className="text-[11px] font-semibold text-[#2c4470] border border-[#2c4470]/30 rounded-full px-3 py-0.5 hover:bg-[#2c4470]/5 transition-colors">View</button>}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* User-added tasks */}
                {customTasks.map(t => (
                  <div
                    key={t.id}
                    className={`rounded-[12px] border p-4 flex items-start gap-2.5 transition-all ${t.done ? "opacity-50 bg-[#fafafa]" : "bg-white"}`}
                  >
                    <button
                      onClick={() => toggleCustomTask(t.id)}
                      className="h-[18px] w-[18px] rounded-full border-2 shrink-0 flex items-center justify-center mt-[2px] transition-all duration-150"
                      style={{ borderColor: "#d0d0d0", backgroundColor: t.done ? "#d0d0d0" : "transparent" }}
                    >
                      {t.done && <Check size={10} color="white" strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                      <p className={`text-[13px] leading-snug ${t.done ? "line-through text-[#7a7a7a]" : "text-[#1d1d1f]"}`}>{t.text}</p>
                      <button onClick={() => deleteCustomTask(t.id)} className="text-[#d0d0d0] hover:text-[#7a7a7a] transition-colors shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Inline add card */}
                {addingTask && (
                  <div className="rounded-[12px] border border-dashed border-[#d0d0d0] p-4 flex flex-col gap-3 bg-white">
                    <input
                      ref={inputRef}
                      value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") addTask()
                        if (e.key === "Escape") { setAddingTask(false); setNewTaskText("") }
                      }}
                      placeholder="New task…"
                      className="text-[13px] outline-none text-[#1d1d1f] placeholder:text-[#b0b0b0] w-full"
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={addTask} className="text-[11px] font-semibold text-white bg-[#2c4470] rounded-full px-3 py-0.5 hover:bg-[#1e3560] transition-colors">Add</button>
                      <button onClick={() => { setAddingTask(false); setNewTaskText("") }} className="text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* Important Emails */}
          {data.summary.important_emails?.length > 0 && (
            <div className="space-y-3">
              <SectionTitle icon={<Inbox size={14} />}>Important Emails</SectionTitle>
              <div className="space-y-2">
                {data.summary.important_emails.map((e, i) => {
                  const tag = classify(`${e.subject} ${e.reason}`)
                  return (
                    <div key={i} className="rounded-[10px] border p-3.5 space-y-1.5">
                      <div className="flex items-start gap-2.5">
                        <SemanticDot tag={tag} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold text-[#1d1d1f]">{e.subject}</p>
                            <SemanticPill tag={tag} />
                          </div>
                          <p className="text-[12px] text-[#7a7a7a] mt-0.5">{e.from}</p>
                          <p className="text-[13px] text-foreground/80 mt-1">{e.reason}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Deadlines & Meetings */}
          {data.summary.deadlines?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitle icon={<Clock size={14} />}>Deadlines &amp; Meetings</SectionTitle>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.summary.deadlines.map((d, i) => {
                  const tag = classify(d)
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <SemanticDot tag={tag} />
                      <span className="text-[13px] text-[#1d1d1f] leading-snug">{d}</span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Needs Reply */}
          {data.summary.needs_reply?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitle icon={<Reply size={14} />}>Needs Reply</SectionTitle>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {data.summary.needs_reply.map((e, i) => {
                  const tag = classify(`${e.subject}`)
                  const isLast = i === data.summary.needs_reply.length - 1
                  return (
                    <div key={i} className={`flex items-start gap-2.5 px-5 py-3.5 ${!isLast ? "border-b border-[#f0f0f0]" : ""}`}>
                      <SemanticDot tag={tag} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-[#1d1d1f]">{e.subject}</p>
                          <SemanticPill tag={tag} />
                        </div>
                        <p className="text-[12px] text-[#7a7a7a] mt-0.5">{e.from}</p>
                        <p className="text-[13px] text-foreground/80 mt-1">{e.why}</p>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {data.summary.action_items?.length === 0 && customTasks.length === 0 && !addingTask && data.summary.important_emails?.length === 0 && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">Inbox clear</Badge>
              <Badge variant="secondary">No action items</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
