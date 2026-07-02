import { useRef, useEffect, useState, useCallback, useId, Fragment } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import {
  Paperclip, X, FileText, File, Download, Eye, RotateCcw, Send, Square,
  Loader2, ChevronDown, ChevronRight, CheckCircle2, Mail, AlertTriangle,
  Copy, ThumbsUp, ThumbsDown, MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSSEChat, type InterruptData } from "@/hooks/useSSEChat"
import type { ChatMessage } from "@/types"

// ── Types ──────────────────────────────────────────────────────

interface WorkspaceFile { name: string; size: number }
interface MsgMeta { attachments?: string[] }
interface ToolEvent { tool: string; done: boolean; id: number; detail?: string }

// ── Tool labels ────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  execute: "Running code",
  read_file: "Reading file",
  write_file: "Writing file",
  edit_file: "Editing file",
  ls: "Listing files",
  glob: "Searching files",
  grep: "Searching content",
  write_todos: "Planning steps",
  task: "Running subtask",
  search_inbox: "Searching inbox",
  read_email: "Reading email",
  list_attachments: "Listing attachments",
  download_attachment: "Downloading attachment",
  draft_email: "Drafting email",
  send_email: "Sending email",
  search_web: "Searching the web",
}

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())
}

// ── File helpers ───────────────────────────────────────────────

const EXT_COLORS: Record<string, string> = {
  pdf: "text-red-500", docx: "text-blue-500", doc: "text-blue-500",
  xlsx: "text-green-600", xls: "text-green-600",
  pptx: "text-orange-500", ppt: "text-orange-500",
  png: "text-purple-500", jpg: "text-purple-500", jpeg: "text-purple-500",
}

function ext(name: string) { return name.split(".").pop()?.toLowerCase() ?? "" }
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const e = ext(name)
  const cls = EXT_COLORS[e] ?? "text-muted-foreground"
  return ["png","jpg","jpeg","gif","svg","webp"].includes(e)
    ? <File size={size} className={cls} />
    : <FileText size={size} className={cls} />
}

function isPreviewable(name: string) {
  return ["pdf","png","jpg","jpeg","gif","svg","webp"].includes(ext(name))
}

// ── File chip ──────────────────────────────────────────────────

function FileChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-white/70 px-2.5 py-1 text-[11px] font-medium text-foreground/80 shadow-sm">
      <FileIcon name={name} size={12} />
      {name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:text-red-500 transition-colors">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

// ── Tool trace — persists in the conversation after streaming ──

function ToolTrace({ tools, isActive }: { tools: ToolEvent[]; isActive: boolean }) {
  if (tools.length === 0 && !isActive) return null
  return (
    <div
      className="ml-1 my-0.5 pl-3 flex flex-col gap-1"
      style={{ borderLeft: "2px solid rgba(139,92,246,0.2)" }}
    >
      {tools.map(e => (
        <div key={e.id} className="flex items-start gap-2">
          <div className="mt-[3px] shrink-0">
            {e.done
              ? <CheckCircle2 size={13} className="text-emerald-500" />
              : <Loader2 size={13} className="animate-spin text-violet-500" />
            }
          </div>
          <div className="min-w-0">
            <span className={cn(
              "text-[13px] font-medium transition-colors",
              e.done ? "text-muted-foreground/55" : "text-violet-700"
            )}>
              {toolLabel(e.tool)}
            </span>
            {e.detail && (
              <p className={cn(
                "text-[11px] font-mono leading-snug truncate",
                e.done ? "text-muted-foreground/40" : "text-muted-foreground/70"
              )}>
                {e.detail}
              </p>
            )}
          </div>
        </div>
      ))}
      {isActive && (
        <div className="flex items-center gap-2">
          <div className="w-[13px] shrink-0 flex justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          </div>
          <span className="text-[13px] text-muted-foreground/40 italic">Thinking...</span>
        </div>
      )}
    </div>
  )
}

// ── Markdown component overrides ────────────────────────────────

const MD: Record<string, React.ComponentType<any>> = {
  h1: ({ children }) => <h1 className="text-[22px] font-bold mt-6 mb-2 leading-tight tracking-tight text-[#1d1d1f]">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[18px] font-bold mt-5 mb-2 leading-tight tracking-tight text-[#1d1d1f]">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-bold mt-4 mb-1.5 leading-tight text-[#1d1d1f]">{children}</h3>,
  p:  ({ children }) => <p className="mb-3 last:mb-0 leading-[1.65]">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-[#1d1d1f]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  u: ({ children }: any) => <u className="underline underline-offset-2">{children}</u>,
  del: ({ children }) => <del className="line-through text-[#7a7a7a]">{children}</del>,
  ul: ({ children }) => <ul className="list-disc ml-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-5 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.65]">{children}</li>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-[#2c4470] underline underline-offset-2 hover:text-[#1e3560]">{children}</a>,
  code: ({ inline, children }: any) => inline
    ? <code className="bg-[#f5f5f7] border border-[#e0e0e0] px-1.5 py-0.5 rounded text-[13px] font-mono text-[#1d1d1f]">{children}</code>
    : <code className="text-[13px] font-mono">{children}</code>,
  pre: ({ children }) => <pre className="bg-[#f5f5f7] border border-[#e0e0e0] rounded-[11px] px-4 py-3 overflow-x-auto text-[13px] font-mono mb-3 whitespace-pre">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="border-l-[3px] border-[#e0e0e0] pl-4 text-[#7a7a7a] my-3 italic">{children}</blockquote>,
  hr: () => <hr className="border-[#e0e0e0] my-4" />,
  table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full text-[14px] border-collapse">{children}</table></div>,
  th: ({ children }) => <th className="text-left font-bold px-3 py-2 border-b-2 border-[#e0e0e0] text-[#1d1d1f]">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-[#f0f0f0]">{children}</td>,
}

// ── Message bubble ─────────────────────────────────────────────

function Bubble({ msg, meta, isStreaming }: { msg: ChatMessage; meta?: MsgMeta; isStreaming?: boolean }) {
  const isUser = msg.role === "user"
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5 mt-2">
        {meta?.attachments && meta.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {meta.attachments.map(f => <FileChip key={f} name={f} />)}
          </div>
        )}
        <div className="max-w-[72%] rounded-3xl bg-[#f0f0ee] px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="text-[15px] text-[#1d1d1f]">
        <ReactMarkdown
          components={MD}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
        >{msg.content || "…"}</ReactMarkdown>
      </div>
      {!isStreaming && msg.content && (
        <div className="flex items-center gap-0.5 -ml-1.5 mt-0.5">
          <button onClick={copy} title="Copy" className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted transition-colors">
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
          <button title="Good response" className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted transition-colors">
            <ThumbsUp size={14} />
          </button>
          <button title="Bad response" className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted transition-colors">
            <ThumbsDown size={14} />
          </button>
          <button title="Regenerate" className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted transition-colors">
            <RotateCcw size={14} />
          </button>
          <button title="More" className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted transition-colors">
            <MoreHorizontal size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── File previewer modal ───────────────────────────────────────

function FilePreviewModal({ file, dir, onClose }: { file: WorkspaceFile; dir: string; onClose: () => void }) {
  const url = `/api/workspace/file/${dir}/${encodeURIComponent(file.name)}`
  const e = ext(file.name)
  const isImg = ["png","jpg","jpeg","gif","svg","webp"].includes(e)
  const isPdf = e === "pdf"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(90vw, 900px)", height: "min(90vh, 700px)" }}
        onClick={ev => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <FileIcon name={file.name} size={15} />
            <span className="text-[13px] font-semibold">{file.name}</span>
            <span className="text-[11px] text-muted-foreground">{fmtSize(file.size)}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} download={file.name}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted transition-colors"
              onClick={ev => ev.stopPropagation()}>
              <Download size={12} /> Download
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {isPdf && <iframe src={url} className="w-full h-full border-0" title={file.name} />}
          {isImg && (
            <div className="flex items-center justify-center h-full p-6 bg-muted/20">
              <img src={url} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
            </div>
          )}
          {!isPdf && !isImg && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <FileIcon name={file.name} size={48} />
              <p className="text-[14px] font-medium text-foreground">{file.name}</p>
              <p className="text-[12px]">{fmtSize(file.size)} · .{ext(file.name).toUpperCase()}</p>
              <a href={url} download={file.name}
                className="flex items-center gap-2 rounded-xl border bg-foreground text-background px-4 py-2 text-[13px] font-medium hover:opacity-90 transition-opacity">
                <Download size={14} /> Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Workspace panel ────────────────────────────────────────────

function WorkspacePanel({
  inputFiles, outputFiles, onPreview, onDeleteInput, onDeleteOutput, refreshing,
}: {
  inputFiles: WorkspaceFile[]
  outputFiles: WorkspaceFile[]
  onPreview: (f: WorkspaceFile, dir: string) => void
  onDeleteInput: (name: string) => void
  onDeleteOutput: (name: string) => void
  refreshing: boolean
}) {
  const [inputOpen, setInputOpen] = useState(true)
  const [outputOpen, setOutputOpen] = useState(true)

  function Section({ label, files, dir, open, toggle, onDelete }: {
    label: string; files: WorkspaceFile[]; dir: string; open: boolean; toggle: () => void; onDelete: (name: string) => void
  }) {
    return (
      <div>
        <button onClick={toggle}
          className="flex w-full items-center gap-2.5 px-6 py-2 text-[13px] font-semibold text-foreground/70 hover:text-foreground hover:bg-white/40 rounded-none transition-all duration-150">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {label}
          <span className="ml-auto text-[11px] font-normal">{files.length}</span>
        </button>
        {open && (
          <div className="flex flex-col gap-0.5 pb-2">
            {files.length === 0
              ? <p className="px-3 py-1.5 text-[11px] text-muted-foreground/60 italic">Empty</p>
              : files.map(f => (
                <div key={f.name}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 hover:bg-muted/60 transition-colors">
                  <FileIcon name={f.name} size={12} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtSize(f.size)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isPreviewable(f.name) && (
                      <button onClick={() => onPreview(f, dir)}
                        className="p-1 rounded hover:bg-background/80 transition-colors" title="Preview">
                        <Eye size={11} className="text-muted-foreground" />
                      </button>
                    )}
                    <a href={`/api/workspace/file/${dir}/${encodeURIComponent(f.name)}`} download={f.name}
                      className="p-1 rounded hover:bg-background/80 transition-colors" title="Download">
                      <Download size={11} className="text-muted-foreground" />
                    </a>
                    <button onClick={() => onDelete(f.name)}
                      className="p-1 rounded hover:bg-background/80 transition-colors" title="Remove">
                      <X size={11} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col w-[360px] shrink-0 border-l overflow-y-auto"
      style={{
        background: "linear-gradient(160deg, #ffffff 0%, rgba(238,236,255,0.55) 55%, rgba(220,225,255,0.45) 100%)",
        boxShadow: "inset -1px 0 0 rgba(210,205,240,0.3), inset 0 0 60px rgba(150,130,220,0.04)",
      }}
    >
      <div className="flex items-center justify-center px-6 pt-12 pb-10 shrink-0 relative">
        <p className="text-[22px] font-bold tracking-tight">Workspace</p>
        {refreshing && <Loader2 size={11} className="animate-spin text-muted-foreground absolute right-6" />}
      </div>
      <Section label="Input" files={inputFiles} dir="input" open={inputOpen} toggle={() => setInputOpen(o => !o)} onDelete={onDeleteInput} />
      <div className="border-t mx-2" />
      <Section label="Output" files={outputFiles} dir="output" open={outputOpen} toggle={() => setOutputOpen(o => !o)} onDelete={onDeleteOutput} />
    </div>
  )
}

// ── Send-email approval banner ─────────────────────────────────

function SendApprovalBanner({
  data, onApprove, onReject, disabled,
}: { data: InterruptData; onApprove: () => void; onReject: () => void; disabled: boolean }) {
  const raw = data.draft as Record<string, unknown>
  const args = (raw.args ?? raw) as Record<string, string | string[] | undefined>
  const to = args.to ? String(args.to) : ""
  const subject = args.subject ? String(args.subject) : ""
  const body = args.body ? String(args.body) : ""
  const attachments = Array.isArray(args.attachments) ? args.attachments as string[] : []
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-amber-900 mb-2">Send email — approval required</p>
          <div className="rounded-lg border border-amber-200/60 bg-white/70 px-3 py-2.5 space-y-1.5 text-[12px]">
            {to      && <p><span className="font-medium text-muted-foreground w-16 inline-block">To:</span> {to}</p>}
            {subject && <p><span className="font-medium text-muted-foreground w-16 inline-block">Subject:</span> {subject}</p>}
            {body    && (
              <div>
                <span className="font-medium text-muted-foreground">Body:</span>
                <p className="mt-1 text-foreground/80 whitespace-pre-wrap line-clamp-5">{body}</p>
              </div>
            )}
            {attachments.length > 0 && (
              <p><span className="font-medium text-muted-foreground w-16 inline-block">Files:</span> {attachments.join(", ")}</p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={onApprove}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-[12px] font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Mail size={11} /> Send email
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Chat component ────────────────────────────────────────

export default function Chat() {
  const inputId = useId()
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolIdRef = useRef(0)
  const activeTurnRef = useRef<number | null>(null)

  const [input, setInput] = useState("")
  const [pendingFiles, setPendingFiles] = useState<string[]>([])
  const [msgMeta, setMsgMeta] = useState<Record<number, MsgMeta>>({})

  // Per-turn tool history keyed by user message index — stays in the conversation permanently
  const [turnTools, setTurnTools] = useState<Record<number, ToolEvent[]>>({})
  const [activeTurn, setActiveTurn] = useState<number | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ file: WorkspaceFile; dir: string } | null>(null)
  const [wsFiles, setWsFiles] = useState<{ input: WorkspaceFile[]; output: WorkspaceFile[] }>({ input: [], output: [] })
  const [wsRefreshing, setWsRefreshing] = useState(false)
  const [pendingInterrupt, setPendingInterrupt] = useState<InterruptData | null>(null)

  // Per-request thread_id (refreshed each send, reused for interrupt resume)
  const threadIdRef = useRef("")

  const onTool = useCallback((tool: string, detail?: string) => {
    const turn = activeTurnRef.current
    if (turn === null) return
    const id = toolIdRef.current++
    setTurnTools(prev => ({
      ...prev,
      [turn]: [...(prev[turn] ?? []), { tool, done: false, id, detail }],
    }))
  }, [])

  const onToolDone = useCallback((tool: string) => {
    const turn = activeTurnRef.current
    if (turn === null) return
    setTurnTools(prev => ({
      ...prev,
      [turn]: (prev[turn] ?? []).map(e =>
        e.tool === tool && !e.done ? { ...e, done: true } : e
      ),
    }))
  }, [])

  const onInterrupt = useCallback((data: InterruptData) => {
    threadIdRef.current = data.thread_id
    setPendingInterrupt(data)
  }, [])

  const { messages, streaming, send, resume, stop, reset } = useSSEChat("/api/deep-chat", { onTool, onToolDone, onInterrupt })

  // When streaming ends, clear activeTurn (tool history stays in turnTools)
  useEffect(() => {
    if (!streaming && activeTurn !== null) {
      setActiveTurn(null)
      activeTurnRef.current = null
    }
  }, [streaming, activeTurn])

  const refreshWs = useCallback(async () => {
    setWsRefreshing(true)
    try {
      const d = await (await fetch("/api/workspace/files")).json()
      // API now returns nested {files, folders} — extract flat file arrays for WorkspacePanel
      setWsFiles({
        input:  Array.isArray(d.input)  ? d.input  : (d.input?.files  ?? []),
        output: Array.isArray(d.output) ? d.output : (d.output?.files ?? []),
      })
    } catch {}
    setWsRefreshing(false)
  }, [])

  useEffect(() => { refreshWs() }, [refreshWs])
  useEffect(() => {
    if (!streaming) { refreshWs(); return }
    const id = setInterval(refreshWs, 2500)
    return () => clearInterval(id)
  }, [streaming, refreshWs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, turnTools, streaming])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true)
    const names: string[] = []
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append("file", file)
      try {
        const d = await (await fetch("/api/workspace/upload", { method: "POST", body: form })).json()
        if (d.ok) names.push(d.filename)
      } catch {}
    }
    setPendingFiles(prev => [...new Set([...prev, ...names])])
    await refreshWs()
    setUploading(false)
  }, [refreshWs])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
  }

  async function deleteInput(name: string) {
    await fetch(`/api/workspace/file/input/${encodeURIComponent(name)}`, { method: "DELETE" })
    setPendingFiles(prev => prev.filter(f => f !== name))
    refreshWs()
  }

  async function deleteOutput(name: string) {
    await fetch(`/api/workspace/file/output/${encodeURIComponent(name)}`, { method: "DELETE" })
    refreshWs()
  }

  function submit() {
    if (!input.trim() || streaming) return
    const userMsgIdx = messages.length
    activeTurnRef.current = userMsgIdx
    setActiveTurn(userMsgIdx)
    setTurnTools(prev => ({ ...prev, [userMsgIdx]: [] }))
    setPendingInterrupt(null)

    // Generate a fresh thread_id for this request (reused if it gets interrupted)
    const tid = crypto.randomUUID()
    threadIdRef.current = tid

    if (pendingFiles.length > 0) {
      setMsgMeta(prev => ({ ...prev, [userMsgIdx]: { attachments: [...pendingFiles] } }))
    }
    send(input, pendingFiles, tid)
    setInput("")
    setPendingFiles([])
  }

  function handleApprove() {
    if (!pendingInterrupt || streaming) return
    const turn = messages.length - 1  // last message index (the interrupted assistant turn)
    activeTurnRef.current = turn > 0 ? turn - 1 : 0  // associate with the user message
    setPendingInterrupt(null)
    resume(pendingInterrupt.thread_id, true, onTool, onToolDone)
  }

  function handleReject() {
    if (!pendingInterrupt || streaming) return
    setPendingInterrupt(null)
    // Tell the graph not to send; it will respond with a cancellation message
    resume(pendingInterrupt.thread_id, false, onTool, onToolDone)
  }

  function handleReset() {
    reset()
    setTurnTools({})
    setMsgMeta({})
    setActiveTurn(null)
    activeTurnRef.current = null
    setPendingFiles([])
    setPendingInterrupt(null)
    threadIdRef.current = ""
  }

  const isEmpty = messages.length === 0

  return (
    <>
      <div
        className={cn("flex h-full overflow-hidden", isDragging && "ring-2 ring-violet-400 ring-inset")}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      >
        {/* ── Chat column ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between px-8 pt-12 pb-10 shrink-0">
            <div>
              <p className="text-[22px] font-bold tracking-tight">Executive Assistant</p>
            </div>
            <button
              onClick={handleReset}
              disabled={streaming || isEmpty}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={11} /> New chat
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-8 pb-4">
            {isEmpty ? (
              <div className="flex flex-col gap-4 max-w-2xl">
                <div className="self-start text-[15px] text-foreground/80 leading-[1.65]">
                  <p className="font-semibold text-[17px] mb-2">Hi! I'm your Executive Assistant.</p>
                  <ul className="list-disc ml-5 space-y-1 text-[15px]">
                    <li>Attach files and ask me to summarize, transform, or analyze them</li>
                    <li>I produce real PDF, Word, Excel, and PowerPoint files in your workspace</li>
                    <li>I can search and draft emails when connected</li>
                  </ul>
                  <p className="mt-2 text-[13px] text-muted-foreground">Drag & drop files anywhere to upload them.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Summarize the file I uploaded",
                    "Create a Word report from my PDF",
                    "Build a PowerPoint on AI trends",
                    "Draft a reply to my latest email",
                  ].map(p => (
                    <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus() }}
                      className="text-[12px] px-3 py-1.5 rounded-lg border border-violet-700/40 bg-muted/30 text-foreground/70 hover:bg-violet-50/40 transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 max-w-3xl">
                {messages.map((msg, i) => (
                  <Fragment key={i}>
                    <Bubble
                      msg={msg}
                      meta={msgMeta[i]}
                      isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
                    />
                    {msg.role === "user" && turnTools[i] !== undefined && (
                      <ToolTrace
                        tools={turnTools[i]}
                        isActive={activeTurn === i && streaming}
                      />
                    )}
                  </Fragment>
                ))}
                {/* Send-email approval banner — shown after the graph is interrupted */}
                {pendingInterrupt && (
                  <SendApprovalBanner
                    data={pendingInterrupt}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    disabled={streaming}
                  />
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 shrink-0">
            <div
              className={cn("rounded-2xl transition-all", isDragging ? "ring-2 ring-violet-400" : "")}
              style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(238,236,255,0.6) 100%)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(210,205,240,0.5)",
                boxShadow: "0 2px 16px rgba(120,100,200,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {pendingFiles.map(f => (
                    <FileChip key={f} name={f} onRemove={() => setPendingFiles(prev => prev.filter(x => x !== f))} />
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground resize-none outline-none px-3.5 pt-3 pb-1 min-h-[72px] max-h-[180px]"
                placeholder="Message the assistant… (Shift+Enter for new line)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
                disabled={streaming}
                rows={3}
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <label htmlFor={inputId} className={cn(
                    "flex items-center gap-1.5 cursor-pointer rounded-lg px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/60 transition-colors",
                    uploading && "opacity-50 pointer-events-none"
                  )}>
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                    Attach file
                  </label>
                  <input id={inputId} type="file" multiple className="hidden"
                    onChange={e => e.target.files && uploadFiles(e.target.files)} />
                </div>
                {streaming ? (
                  <button
                    onClick={stop}
                    className="flex items-center gap-1.5 rounded-xl bg-foreground text-background px-3.5 py-1.5 text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    <Square size={11} fill="currentColor" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={submit}
                    disabled={!input.trim() && pendingFiles.length === 0}
                    className="flex items-center gap-1.5 rounded-xl bg-foreground text-background px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    <Send size={12} />
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Workspace panel ── */}
        <WorkspacePanel
          inputFiles={wsFiles.input}
          outputFiles={wsFiles.output}
          onPreview={(f, dir) => setPreview({ file: f, dir })}
          onDeleteInput={deleteInput}
          onDeleteOutput={deleteOutput}
          refreshing={wsRefreshing}
        />
      </div>

      {preview && (
        <FilePreviewModal file={preview.file} dir={preview.dir} onClose={() => setPreview(null)} />
      )}
    </>
  )
}
