import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  AlignLeft, Type, Image as ImageIcon, Lightbulb, FolderOpen,
  X, ZoomIn, ZoomOut, Maximize2, Upload, Pencil, Eraser,
  Link2, ChevronRight, FolderPlus,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

type ProjectStatus = "Active" | "Paused" | "Complete" | "Archived"
const STATUSES: ProjectStatus[] = ["Active", "Paused", "Complete", "Archived"]
const STATUS_DOT: Record<ProjectStatus, string> = {
  Active: "#b08a8a", Paused: "#a09080", Complete: "#8a8a9a", Archived: "#c0bdb8",
}

type BlockType = "title" | "note" | "image" | "idea" | "project"
type CanvasMode = "select" | "draw" | "arrow"

interface Block {
  id: string; type: BlockType
  x: number; y: number; w?: number; h?: number
  folderId?: string | null
  content?: string
  imageUrl?: string; caption?: string
  title?: string; body?: string
  name?: string; status?: ProjectStatus; desc?: string; tags?: string
  createdAt: string
}

interface CanvasFolder { id: string; name: string }
interface DrawStroke { id: string; path: string; folderId: string | null }
interface Connection { id: string; fromId: string; toId: string; folderId: string | null }

// Default sizes for arrow anchoring
const BDEF: Record<BlockType, [number, number]> = {
  title: [200, 36], note: [260, 100], image: [240, 200], idea: [200, 90], project: [220, 80],
}

// ── Storage ────────────────────────────────────────────────────────

const LS_BLOCKS = "workspace:canvas-v2"
const LS_FOLDERS = "workspace:canvas-folders"
const LS_STROKES = "workspace:canvas-strokes"
const LS_CONNS   = "workspace:canvas-connections"

function ld<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? def } catch { return def }
}
function sv(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

// ── InlineText ─────────────────────────────────────────────────────

function InlineText({ value, onChange, placeholder, className, multiline }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  className?: string; multiline?: boolean
}) {
  const ref = useRef<any>(null)
  useEffect(() => { ref.current?.focus(); if (!multiline) ref.current?.select?.() }, [])
  if (multiline) {
    return (
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={4}
        className={`w-full resize-none bg-transparent outline-none placeholder:text-[#c0c0c0] ${className ?? ""}`} />
    )
  }
  return (
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-transparent outline-none placeholder:text-[#c0c0c0] ${className ?? ""}`} />
  )
}

// ── Block renderers ────────────────────────────────────────────────

const SH = { boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }

function TitleBlock({ block, editing, onEdit, onChange }: {
  block: Block; editing: boolean; onEdit: () => void; onChange: (p: Partial<Block>) => void
}) {
  return (
    <div className="select-none" style={{ minWidth: block.w ?? 160 }}>
      {editing
        ? <InlineText value={block.content ?? ""} onChange={v => onChange({ content: v })}
            placeholder="Title…" className="text-[22px] font-bold text-[#1d1d1f] leading-tight tracking-tight" />
        : <p className="text-[22px] font-bold text-[#1d1d1f] leading-tight tracking-tight cursor-text whitespace-nowrap" onClick={onEdit}>
            {block.content || <span className="text-[#d0d0d0] font-normal text-[18px]">Title…</span>}
          </p>}
    </div>
  )
}

function NoteBlock({ block, editing, onEdit, onChange }: {
  block: Block; editing: boolean; onEdit: () => void; onChange: (p: Partial<Block>) => void
}) {
  return (
    <div className="bg-white select-none" style={{ ...SH, width: block.w ?? 260, minHeight: block.h ?? 72 }}>
      <div className="px-4 py-3">
        {editing
          ? <InlineText value={block.content ?? ""} onChange={v => onChange({ content: v })}
              placeholder="Write in markdown…" className="text-[13px] text-[#1d1d1f] leading-[1.7]" multiline />
          : <div className="cursor-text min-h-[48px]" onClick={onEdit}>
              {block.content
                ? <div className="text-[13px] leading-[1.7] text-[#1d1d1f] [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_strong]:font-semibold [&_em]:italic [&_code]:bg-[#f0f0f0] [&_code]:px-1 [&_code]:rounded [&_code]:text-[12px] [&_p]:mb-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
                  </div>
                : <p className="text-[#c0c0c0] text-[13px]">Click to write…</p>}
            </div>}
      </div>
    </div>
  )
}

function ImageBlock({ block, editing, onEdit, onChange }: {
  block: Block; editing: boolean; onEdit: () => void; onChange: (p: Partial<Block>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  function loadFile(file: File) {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = e => onChange({ imageUrl: e.target?.result as string })
    reader.readAsDataURL(file)
  }
  return (
    <div className="bg-white select-none" style={{ ...SH, width: block.w ?? 240 }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = "" }} />
      {block.imageUrl
        ? <>
            <img src={block.imageUrl} alt="" className="w-full block object-cover"
              style={block.h ? { height: block.h } : {}} />
            {(editing || block.caption) && (
              <div className="px-3 py-2 border-t border-[#f0f0f0]">
                {editing
                  ? <InlineText value={block.caption ?? ""} onChange={v => onChange({ caption: v })} placeholder="Caption…" className="text-[11px] text-[#7a7a7a]" />
                  : <p className="text-[11px] text-[#7a7a7a] cursor-text" onClick={onEdit}>{block.caption}</p>}
              </div>
            )}
          </>
        : <div className="flex flex-col items-center justify-center gap-2 py-10 cursor-pointer hover:bg-[#fafafa] transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f) }}>
            <Upload size={20} className="text-[#c0c0c0]" />
            <span className="text-[11px] text-[#a0a0a0]">Drop or click</span>
            {editing && (
              <input autoFocus placeholder="or paste URL…"
                className="text-[11px] border border-[#e0e0e0] px-2 py-1 outline-none w-40 mt-1"
                onKeyDown={e => { if (e.key === "Enter") onChange({ imageUrl: (e.target as HTMLInputElement).value }) }}
                onClick={ev => ev.stopPropagation()} />
            )}
          </div>}
    </div>
  )
}

function IdeaBlock({ block, editing, onEdit, onChange }: {
  block: Block; editing: boolean; onEdit: () => void; onChange: (p: Partial<Block>) => void
}) {
  return (
    <div className="select-none" style={{ ...SH, background: "#fefefb", width: block.w ?? 200, minHeight: block.h ?? 90 }}>
      <div className="px-4 py-3">
        <Lightbulb size={11} className="text-[#bfb090] mb-2" />
        {editing
          ? <>
              <InlineText value={block.title ?? ""} onChange={v => onChange({ title: v })}
                placeholder="Idea title…" className="text-[13px] font-semibold text-[#1d1d1f] mb-1 block" />
              <InlineText value={block.body ?? ""} onChange={v => onChange({ body: v })}
                placeholder="Describe it…" className="text-[11px] text-[#7a7a7a] leading-relaxed" multiline />
            </>
          : <div className="cursor-text" onClick={onEdit}>
              <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug mb-1 min-h-[18px]">
                {block.title || <span className="text-[#c8c8c8] font-normal">Idea…</span>}
              </p>
              {block.body && <p className="text-[11px] text-[#7a7a7a] leading-relaxed whitespace-pre-wrap break-words">{block.body}</p>}
            </div>}
      </div>
    </div>
  )
}

function ProjectBlock({ block, editing, onEdit, onChange }: {
  block: Block; editing: boolean; onEdit: () => void; onChange: (p: Partial<Block>) => void
}) {
  const status = block.status ?? "Active"
  return (
    <div className="bg-white select-none overflow-hidden" style={{ ...SH, width: block.w ?? 220 }}>
      <div className="h-1" style={{ background: STATUS_DOT[status] }} />
      <div className="px-3 py-3">
        {editing
          ? <>
              <div className="flex items-center gap-2 mb-2.5">
                {STATUSES.map(st => (
                  <button key={st} title={st} onClick={() => onChange({ status: st })}
                    className="w-3 h-3 rounded-full transition-transform hover:scale-125"
                    style={{ background: STATUS_DOT[st], outline: status === st ? `2px solid ${STATUS_DOT[st]}` : "none", outlineOffset: 2 }} />
                ))}
              </div>
              <InlineText value={block.name ?? ""} onChange={v => onChange({ name: v })}
                placeholder="Project name…" className="text-[13px] font-semibold text-[#1d1d1f] mb-1 block" />
              <InlineText value={block.desc ?? ""} onChange={v => onChange({ desc: v })}
                placeholder="Description…" className="text-[11px] text-[#7a7a7a]" multiline />
              <input value={block.tags ?? ""} onChange={e => onChange({ tags: e.target.value })}
                placeholder="Tags…"
                className="mt-2 w-full text-[10px] text-[#7a7a7a] bg-transparent outline-none border-b border-[#e8e8e8] pb-0.5" />
            </>
          : <div className="cursor-text" onClick={onEdit}>
              <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug min-h-[18px]">
                {block.name || <span className="text-[#c0c0c0] font-normal">Project name…</span>}
              </p>
              {block.desc && <p className="text-[11px] text-[#7a7a7a] mt-1 leading-relaxed whitespace-pre-wrap break-words">{block.desc}</p>}
            </div>}
      </div>
    </div>
  )
}

// ── Main canvas ────────────────────────────────────────────────────

export default function Projects() {
  const [blocks,      setBlocks]      = useState<Block[]>(() => ld(LS_BLOCKS, []))
  const [folders,     setFolders]     = useState<CanvasFolder[]>(() => ld(LS_FOLDERS, []))
  const [strokes,     setStrokes]     = useState<DrawStroke[]>(() => ld(LS_STROKES, []))
  const [connections, setConnections] = useState<Connection[]>(() => ld(LS_CONNS, []))

  const [editingId, setEditingId]   = useState<string | null>(null)
  const [mode,      setMode]        = useState<CanvasMode>("select")
  const [arrowFrom, setArrowFrom]   = useState<string | null>(null)
  const [zoom,      setZoom]        = useState(1)
  const [pan,       setPan]         = useState({ x: 80, y: 60 })
  const [isPanning, setIsPanning]   = useState(false)
  const [isDrawing, setIsDrawing]   = useState(false)
  const [liveStroke, setLiveStroke] = useState("")
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [creatingFolder,  setCreatingFolder]   = useState(false)
  const [folderName,      setFolderName]       = useState("")

  const containerRef = useRef<HTMLDivElement>(null)
  const panRef       = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const dragRef      = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const resizeRef    = useRef<{ id: string; sx: number; sw: number } | null>(null)
  const strokePts    = useRef<{ x: number; y: number }[]>([])

  const visibleBlocks  = blocks.filter(b => (b.folderId ?? null) === currentFolderId)
  const visibleStrokes = strokes.filter(s => s.folderId === currentFolderId)
  const visibleConns   = connections.filter(c => c.folderId === currentFolderId)
  const folderObj      = folders.find(f => f.id === currentFolderId) ?? null

  function mutateBlocks(next: Block[]) { setBlocks(next); sv(LS_BLOCKS, next) }
  function mutateStrokes(next: DrawStroke[]) { setStrokes(next); sv(LS_STROKES, next) }
  function mutateConns(next: Connection[]) { setConnections(next); sv(LS_CONNS, next) }
  function mutateFolders(next: CanvasFolder[]) { setFolders(next); sv(LS_FOLDERS, next) }

  function patch(id: string, p: Partial<Block>) {
    mutateBlocks(blocks.map(b => b.id === id ? { ...b, ...p } : b))
  }
  function removeBlock(id: string) {
    mutateBlocks(blocks.filter(b => b.id !== id))
    mutateConns(connections.filter(c => c.fromId !== id && c.toId !== id))
    if (editingId === id) setEditingId(null)
  }
  function addBlock(type: BlockType) {
    const cw = containerRef.current?.clientWidth ?? 800
    const ch = containerRef.current?.clientHeight ?? 600
    const x = (cw / 2 - pan.x) / zoom + (Math.random() - 0.5) * 80
    const y = (ch / 2 - pan.y) / zoom + (Math.random() - 0.5) * 60
    const b: Block = { id: uid(), type, x, y, folderId: currentFolderId, createdAt: new Date().toISOString() }
    if (type === "project") b.status = "Active"
    mutateBlocks([...blocks, b])
    setEditingId(b.id)
  }
  function createFolder() {
    if (!folderName.trim()) { setCreatingFolder(false); return }
    const f: CanvasFolder = { id: uid(), name: folderName.trim() }
    mutateFolders([...folders, f])
    setFolderName("")
    setCreatingFolder(false)
    setCurrentFolderId(f.id)
  }

  function screenToCanvas(cx: number, cy: number) {
    const r = containerRef.current!.getBoundingClientRect()
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom }
  }
  function ptPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return ""
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
    return d
  }
  function blockCenter(b: Block): [number, number] {
    const [dw, dh] = BDEF[b.type]
    return [b.x + (b.w ?? dw) / 2, b.y + (b.h ?? dh) / 2]
  }

  // ── Pointer events — drawing (Apple Pencil + mouse) ────────────
  function onPointerDown(e: React.PointerEvent) {
    if (mode !== "draw") return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    strokePts.current = [screenToCanvas(e.clientX, e.clientY)]
    setIsDrawing(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (mode !== "draw" || !isDrawing) return
    strokePts.current = [...strokePts.current, screenToCanvas(e.clientX, e.clientY)]
    setLiveStroke(ptPath(strokePts.current))
  }
  function onPointerUp() {
    if (mode !== "draw") return
    if (strokePts.current.length > 1) {
      mutateStrokes([...strokes, { id: uid(), path: ptPath(strokePts.current), folderId: currentFolderId }])
    }
    strokePts.current = []; setLiveStroke(""); setIsDrawing(false)
  }

  // ── Mouse events — select / pan / drag / resize ─────────────────
  function onCanvasDown(e: React.MouseEvent) {
    if (mode === "draw" || mode === "arrow") return
    if (editingId) { setEditingId(null); return }
    if ((e.target as HTMLElement).closest("[data-block]")) return
    panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
    setIsPanning(true)
  }
  function onCardDown(e: React.MouseEvent, id: string) {
    if (mode === "draw") return
    if (mode === "arrow") {
      e.stopPropagation()
      if (!arrowFrom) {
        setArrowFrom(id)
      } else if (arrowFrom !== id) {
        mutateConns([...connections, { id: uid(), fromId: arrowFrom, toId: id, folderId: currentFolderId }])
        setArrowFrom(null); setMode("select")
      }
      return
    }
    if (editingId === id) return
    e.stopPropagation()
    const pos = blocks.find(b => b.id === id)
    if (!pos) return
    dragRef.current = { id, ox: e.clientX - pan.x - pos.x * zoom, oy: e.clientY - pan.y - pos.y * zoom }
  }
  function onResizeDown(e: React.MouseEvent, block: Block) {
    e.stopPropagation()
    resizeRef.current = { id: block.id, sx: e.clientX, sw: block.w ?? BDEF[block.type][0] }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (mode === "draw") return
    if (resizeRef.current) {
      const { id, sx, sw } = resizeRef.current
      patch(id, { w: Math.max(80, sw + (e.clientX - sx) / zoom) })
      return
    }
    if (dragRef.current) {
      const { id, ox, oy } = dragRef.current
      patch(id, { x: (e.clientX - pan.x - ox) / zoom, y: (e.clientY - pan.y - oy) / zoom })
      return
    }
    if (panRef.current) {
      setPan({ x: panRef.current.px + (e.clientX - panRef.current.sx), y: panRef.current.py + (e.clientY - panRef.current.sy) })
    }
  }
  function onMouseUp() {
    dragRef.current = null; resizeRef.current = null; panRef.current = null; setIsPanning(false)
  }

  return (
    <div className="flex flex-col h-full w-full relative">

      {/* Breadcrumb / folder navigation */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-[#f0f0f0] text-[12px]">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`font-medium transition-colors ${currentFolderId ? "text-[#7a7a7a] hover:text-[#1d1d1f]" : "text-[#1d1d1f]"}`}
        >
          Projects
        </button>
        {folderObj && (
          <>
            <ChevronRight size={11} className="text-[#c0c0c0]" />
            <span className="font-medium text-[#1d1d1f]">{folderObj.name}</span>
          </>
        )}

        {folders.length > 0 && (
          <div className="flex items-center gap-1 ml-3 border-l border-[#f0f0f0] pl-3">
            {folders.map(f => (
              <button key={f.id} onClick={() => setCurrentFolderId(f.id)}
                className={`px-2.5 py-0.5 text-[11px] border transition-colors ${
                  currentFolderId === f.id
                    ? "bg-[#1d1d1f] text-white border-[#1d1d1f]"
                    : "text-[#7a7a7a] border-[#e0e0e0] hover:border-[#1d1d1f] hover:text-[#1d1d1f]"
                }`}>{f.name}</button>
            ))}
          </div>
        )}

        {creatingFolder
          ? <form className="ml-2" onSubmit={e => { e.preventDefault(); createFolder() }}>
              <input autoFocus value={folderName} onChange={e => setFolderName(e.target.value)}
                onBlur={createFolder} placeholder="Name…"
                className="text-[11px] border border-[#c0c0c0] px-2 py-0.5 outline-none w-24" />
            </form>
          : <button onClick={() => setCreatingFolder(true)}
              className="ml-2 flex items-center gap-1 text-[11px] text-[#b0b0b0] hover:text-[#1d1d1f] transition-colors">
              <FolderPlus size={11} /> New folder
            </button>}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-12 right-3 z-20 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(2.5, z + 0.2))} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomIn size={11} className="text-[#7a7a7a]" /></button>
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomOut size={11} className="text-[#7a7a7a]" /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 80, y: 60 }) }} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><Maximize2 size={11} className="text-[#7a7a7a]" /></button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-[#fafafa]"
        style={{ cursor: mode === "draw" ? "crosshair" : mode === "arrow" ? "cell" : isPanning ? "grabbing" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseDown={onCanvasDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle, #d0d0d0 1px, transparent 1px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
        }} />

        {/* Canvas transform */}
        <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>

          {/* SVG: connections + drawing strokes */}
          <svg className="absolute overflow-visible pointer-events-none"
            style={{ left: -5000, top: -5000, width: 10000, height: 10000 }}>
            <defs>
              <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0,8 3,0 6" fill="#a0a0b0" />
              </marker>
            </defs>

            {/* Strokes */}
            {visibleStrokes.map(s => (
              <path key={s.id} d={s.path} stroke="#5a5aaa" strokeWidth={2 / zoom} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            ))}
            {liveStroke && (
              <path d={liveStroke} stroke="#5a5aaa" strokeWidth={2 / zoom} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            )}

            {/* Connection arrows */}
            {visibleConns.map(conn => {
              const from = blocks.find(b => b.id === conn.fromId)
              const to   = blocks.find(b => b.id === conn.toId)
              if (!from || !to) return null
              const [x1, y1] = blockCenter(from)
              const [x2, y2] = blockCenter(to)
              const dx = (x2 - x1) * 0.5
              const d = `M ${x1} ${y1} C ${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`
              return (
                <g key={conn.id}>
                  <path d={d} stroke="#c0bdb8" strokeWidth={1.5 / zoom} fill="none" markerEnd="url(#ah)" />
                  {/* Transparent wider hit area for deletion */}
                  <path d={d} stroke="transparent" strokeWidth={10 / zoom} fill="none"
                    style={{ pointerEvents: "auto", cursor: "pointer" }}
                    onClick={() => mutateConns(connections.filter(c => c.id !== conn.id))} />
                </g>
              )
            })}
          </svg>

          {/* Blocks */}
          {visibleBlocks.map(block => {
            const isEditing = editingId === block.id
            const isFrom    = arrowFrom === block.id
            return (
              <div key={block.id} data-block="true" className="group"
                style={{
                  position: "absolute", left: block.x, top: block.y, zIndex: isEditing ? 10 : 1,
                  outline: isFrom ? "2px dashed #7070c0" : undefined, outlineOffset: 4,
                }}
                onMouseDown={e => onCardDown(e, block.id)}
              >
                <div
                  style={{ outline: isEditing ? "2px solid #2c4470" : "none", outlineOffset: 2 }}
                  onDoubleClick={() => !isEditing && mode === "select" && setEditingId(block.id)}
                >
                  {block.type === "title"   && <TitleBlock   block={block} editing={isEditing} onEdit={() => setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "note"    && <NoteBlock    block={block} editing={isEditing} onEdit={() => setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "image"   && <ImageBlock   block={block} editing={isEditing} onEdit={() => setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "idea"    && <IdeaBlock    block={block} editing={isEditing} onEdit={() => setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "project" && <ProjectBlock block={block} editing={isEditing} onEdit={() => setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                </div>

                {/* Delete */}
                <div className="absolute -top-2.5 -right-2.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={e => { e.stopPropagation(); removeBlock(block.id) }}>
                  <div className="w-5 h-5 rounded-full bg-[#1d1d1f] flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors">
                    <X size={9} className="text-white" />
                  </div>
                </div>

                {/* Resize handle */}
                {mode === "select" && block.type !== "title" && (
                  <div className="absolute bottom-0 right-0 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity cursor-se-resize flex items-end justify-end p-0.5"
                    onMouseDown={e => onResizeDown(e, block)}>
                    <svg viewBox="0 0 8 8" width="8" height="8">
                      <path d="M8 2L8 8L2 8" stroke="#b0b0b0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Empty state */}
        {visibleBlocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[14px] text-[#b8b8b8] font-medium">
              {folderObj ? `${folderObj.name} is empty` : "Add blocks from the toolbar below"}
            </p>
          </div>
        )}

        {/* Mode hint pill */}
        {mode !== "select" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#1d1d1f] text-white text-[11px] px-3 py-1.5 rounded-full pointer-events-none select-none">
            {mode === "draw"  && "Draw freely · click Draw again to exit"}
            {mode === "arrow" && (arrowFrom ? "Click another block to connect" : "Click a block to start an arrow")}
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-2 py-3 bg-white border-t border-[#e8e8e8]">
        {/* Block types */}
        <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl">
          {([
            { type: "title"   as BlockType, icon: <AlignLeft size={14} />, label: "Title"   },
            { type: "note"    as BlockType, icon: <Type size={14} />,       label: "Note"    },
            { type: "image"   as BlockType, icon: <ImageIcon size={14} />,  label: "Image"   },
            { type: "idea"    as BlockType, icon: <Lightbulb size={14} />,  label: "Idea"    },
            { type: "project" as BlockType, icon: <FolderOpen size={14} />, label: "Project" },
          ] as const).map(({ type, icon, label }) => (
            <button key={type}
              onClick={() => { setMode("select"); setArrowFrom(null); addBlock(type) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#1d1d1f] hover:bg-white hover:shadow-sm transition-all">
              <span className="text-[#7a7a7a]">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Tools */}
        <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl">
          <button
            onClick={() => { setMode(m => m === "draw" ? "select" : "draw"); setArrowFrom(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${mode === "draw" ? "bg-white shadow-sm text-[#1d1d1f]" : "text-[#7a7a7a] hover:bg-white hover:shadow-sm"}`}>
            <Pencil size={14} /> Draw
          </button>
          <button
            onClick={() => { setMode(m => m === "arrow" ? "select" : "arrow"); setArrowFrom(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${mode === "arrow" ? "bg-white shadow-sm text-[#1d1d1f]" : "text-[#7a7a7a] hover:bg-white hover:shadow-sm"}`}>
            <Link2 size={14} /> Arrow
          </button>
          {visibleStrokes.length > 0 && (
            <button
              onClick={() => mutateStrokes(strokes.filter(s => s.folderId !== currentFolderId))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#7a7a7a] hover:bg-white hover:shadow-sm transition-all">
              <Eraser size={14} /> Clear ink
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
