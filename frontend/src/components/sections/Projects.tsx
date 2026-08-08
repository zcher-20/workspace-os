import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  AlignLeft, AlignCenter, AlignRight,
  Type, Image as ImageIcon, Lightbulb, FolderOpen,
  X, ZoomIn, ZoomOut, Maximize2, Upload, Pencil, Eraser,
  Link2, ChevronRight, FolderPlus, Hand, Table2, Plus, Copy,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

type ProjectStatus = "Active" | "Paused" | "Complete" | "Archived"
const STATUSES: ProjectStatus[] = ["Active", "Paused", "Complete", "Archived"]
const STATUS_DOT: Record<ProjectStatus, string> = {
  Active: "#b08a8a", Paused: "#a09080", Complete: "#8a8a9a", Archived: "#c0bdb8",
}

type BlockType = "title" | "note" | "image" | "idea" | "project" | "table"
type CanvasMode = "select" | "hand" | "draw" | "arrow"

interface Block {
  id: string; type: BlockType
  x: number; y: number; w?: number; h?: number
  folderId?: string | null
  content?: string
  align?: "left" | "center" | "right"
  imageUrl?: string; caption?: string
  title?: string; body?: string
  name?: string; status?: ProjectStatus; desc?: string; tags?: string
  tableData?: string[][]; tableCols?: number; tableColWidths?: number[]
  createdAt: string
}

interface CanvasFolder { id: string; name: string }
interface DrawStroke { id: string; path: string; folderId: string | null }
interface Connection { id: string; fromId: string; toId: string; folderId: string | null }

const BDEF: Record<BlockType, [number, number]> = {
  title: [200, 36], note: [260, 100], image: [240, 200],
  idea: [200, 90], project: [220, 80], table: [340, 140],
}

// ── Storage ────────────────────────────────────────────────────────

const LS_BLOCKS  = "workspace:canvas-v2"
const LS_FOLDERS = "workspace:canvas-folders"
const LS_STROKES = "workspace:canvas-strokes"
const LS_CONNS   = "workspace:canvas-connections"
const LS_PAN     = "workspace:canvas-pan"

function ld<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? def } catch { return def }
}
function sv(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

// ── InlineText ─────────────────────────────────────────────────────

function InlineText({ value, onChange, placeholder, className, multiline, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  className?: string; multiline?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<any>(null)
  if (multiline) {
    return (
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={4} autoFocus onKeyDown={onKeyDown}
        className={`w-full h-full resize-none bg-transparent outline-none placeholder:text-[#c0c0c0] ${className ?? ""}`} />
    )
  }
  return (
    <input ref={ref} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} autoFocus
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

const ALIGN_OPTS = [
  { a: "left"   as const, icon: <AlignLeft   size={11} /> },
  { a: "center" as const, icon: <AlignCenter size={11} /> },
  { a: "right"  as const, icon: <AlignRight  size={11} /> },
]

function NoteBlock({ block, editing, onEdit, onChange, onResizeV }: {
  block: Block; editing: boolean; onEdit: () => void
  onChange: (p: Partial<Block>) => void
  onResizeV: (e: React.MouseEvent) => void
}) {
  const align = block.align ?? "left"
  const ta = { textAlign: align } as React.CSSProperties
  const ac = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      const ta = e.currentTarget
      const pos = ta.selectionStart
      const before = block.content?.slice(0, pos) ?? ""
      const lastNl = before.lastIndexOf("\n")
      const curLine = before.slice(lastNl + 1)
      const m = curLine.match(/^(\s*[-*]\s)/)
      if (m) {
        e.preventDefault()
        const prefix = m[1]
        const after = block.content?.slice(pos) ?? ""
        const next = before + "\n" + prefix + after
        onChange({ content: next })
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + 1 + prefix.length }, 0)
      }
    }
    // "-" + space at start of empty line → "- "
    if (e.key === " ") {
      const el = e.currentTarget
      const pos = el.selectionStart
      const before = block.content?.slice(0, pos) ?? ""
      const lastNl = before.lastIndexOf("\n")
      const curLine = before.slice(lastNl + 1)
      if (curLine === "-") {
        e.preventDefault()
        const after = block.content?.slice(pos) ?? ""
        onChange({ content: before + " " + after })
        setTimeout(() => { el.selectionStart = el.selectionEnd = pos + 1 }, 0)
      }
    }
  }

  return (
    <div className="bg-white select-none relative group" style={{ ...SH, width: block.w ?? 260, height: block.h ?? undefined, minHeight: block.h ?? 72 }}>
      <div className="px-4 py-3">
        {editing
          ? <InlineText value={block.content ?? ""} onChange={v => onChange({ content: v })}
              placeholder="Write in markdown… (- for bullets)"
              className={`text-[13px] text-[#1d1d1f] leading-[1.7] ${ac}`}
              multiline onKeyDown={handleKeyDown} />
          : <div className="cursor-text min-h-[48px]" style={ta} onClick={onEdit}>
              {block.content
                ? <div className={`text-[13px] leading-[1.7] text-[#1d1d1f] [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_strong]:font-semibold [&_em]:italic [&_code]:bg-[#f0f0f0] [&_code]:px-1 [&_code]:rounded [&_code]:text-[12px] [&_p]:mb-0.5 ${ac}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
                  </div>
                : <p className="text-[#c0c0c0] text-[13px]">Click to write…</p>}
            </div>}
      </div>

      {/* Alignment toolbar */}
      <div className="hidden group-hover:flex items-center justify-center gap-0.5 px-3 pb-2 border-t border-[#f4f4f4] pt-1.5"
        onMouseDown={e => e.stopPropagation()}>
        {ALIGN_OPTS.map(({ a, icon }) => (
          <button key={a} onClick={() => onChange({ align: a })}
            className={`p-1.5 rounded transition-colors ${align === a ? "bg-[#e8e8e8] text-[#1d1d1f]" : "text-[#c0c0c0] hover:text-[#7a7a7a] hover:bg-[#f0f0f0]"}`}>
            {icon}
          </button>
        ))}
      </div>

      {/* Vertical resize handle — bottom center */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-3 opacity-0 group-hover:opacity-100 cursor-s-resize flex items-center justify-center z-10"
        onMouseDown={e => { e.stopPropagation(); onResizeV(e) }}>
        <div className="w-7 h-1 rounded-full bg-[#c8c8c8]" />
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

function TableBlock({ block, editing, onChange }: {
  block: Block; editing: boolean; onChange: (p: Partial<Block>) => void
}) {
  const cols = block.tableCols ?? 3
  const data: string[][] = block.tableData ?? [
    Array(cols).fill(""), Array(cols).fill(""), Array(cols).fill(""),
  ]
  const defaultW = Math.floor((block.w ?? 340) / cols)
  const [colWidths, setColWidths] = useState<number[]>(
    () => block.tableColWidths ?? Array(cols).fill(defaultW)
  )
  const colWidthsRef = useRef(colWidths)
  const [editCell, setEditCell] = useState<[number, number] | null>(null)
  const colEls = useRef<Map<number, HTMLTableCellElement>>(new Map())
  const editingDivRef = useRef<HTMLDivElement | null>(null)

  // When editCell changes, populate the contentEditable div with current content
  useEffect(() => {
    if (!editCell || !editingDivRef.current) return
    const [r, c] = editCell
    const content = (block.tableData ?? [])[r]?.[c] ?? ""
    editingDivRef.current.innerHTML = content
    editingDivRef.current.focus()
    // Move cursor to end
    const range = document.createRange()
    range.selectNodeContents(editingDivRef.current)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  }, [editCell])

  // Sync widths if cols count changes externally
  useEffect(() => {
    if (block.tableColWidths && block.tableColWidths.length === cols) {
      setColWidths(block.tableColWidths)
      colWidthsRef.current = block.tableColWidths
    }
  }, [block.tableColWidths, cols])

  function setCell(r: number, c: number, v: string) {
    const next = data.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : [...row])
    onChange({ tableData: next })
  }
  function addRow() { onChange({ tableData: [...data, Array(cols).fill("")] }) }
  function addCol() {
    const newCols = cols + 1
    const newWidths = [...colWidthsRef.current, defaultW]
    colWidthsRef.current = newWidths
    setColWidths(newWidths)
    onChange({ tableData: data.map(row => [...row, ""]), tableCols: newCols, tableColWidths: newWidths })
  }
  function removeRow(ri: number) {
    if (data.length <= 1) return
    onChange({ tableData: data.filter((_, i) => i !== ri) })
  }

  function onResizeHandleDown(e: React.MouseEvent, ci: number) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = colWidthsRef.current[ci]

    function onMove(me: MouseEvent) {
      const newW = Math.max(40, startW + (me.clientX - startX))
      const el = colEls.current.get(ci)
      if (el) el.style.width = `${newW}px`
      colWidthsRef.current = colWidthsRef.current.map((w, i) => i === ci ? newW : w)
    }
    function onUp() {
      setColWidths([...colWidthsRef.current])
      onChange({ tableColWidths: [...colWidthsRef.current] })
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  function fmt(cmd: string) {
    editingDivRef.current?.focus()
    document.execCommand(cmd)
  }

  return (
    <div className="bg-white select-none group/table relative" style={{ ...SH, width: block.w ?? 340 }}>
      {/* Formatting toolbar — visible when a cell is being edited */}
      {editCell && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[#f0f0f0] bg-[#fafafa]"
          onMouseDown={e => e.preventDefault()}>
          <button onClick={() => fmt("bold")}
            className="w-6 h-6 flex items-center justify-center text-[12px] font-bold text-[#5a5a5a] hover:bg-[#e8e8e8] rounded transition-colors">B</button>
          <button onClick={() => fmt("italic")}
            className="w-6 h-6 flex items-center justify-center text-[12px] italic text-[#5a5a5a] hover:bg-[#e8e8e8] rounded transition-colors">I</button>
          <button onClick={() => fmt("underline")}
            className="w-6 h-6 flex items-center justify-center text-[12px] underline text-[#5a5a5a] hover:bg-[#e8e8e8] rounded transition-colors">U</button>
          <div className="w-px h-4 bg-[#e8e8e8] mx-1" />
          <button onClick={() => fmt("strikeThrough")}
            className="w-6 h-6 flex items-center justify-center text-[12px] line-through text-[#5a5a5a] hover:bg-[#e8e8e8] rounded transition-colors">S</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {Array(cols).fill(0).map((_, ci) => (
              <col key={ci} style={{ width: colWidths[ci] ?? defaultW }} />
            ))}
          </colgroup>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="group/row border-b border-[#f0f0f0] last:border-b-0">
                {row.map((cell, ci) => (
                  <td key={ci}
                    ref={ri === 0 ? el => { if (el) colEls.current.set(ci, el); else colEls.current.delete(ci) } : undefined}
                    className="border-r border-[#f0f0f0] last:border-r-0 p-0 relative overflow-hidden"
                    style={{ width: colWidths[ci] ?? defaultW, ...(ri === 0 ? { background: "#fafafa" } : {}) }}
                  >
                    {editCell?.[0] === ri && editCell?.[1] === ci
                      ? <div
                          key="editing"
                          ref={editingDivRef}
                          contentEditable
                          suppressContentEditableWarning
                          className="px-2 py-1.5 text-[12px] text-[#1d1d1f] min-h-[30px] outline-none bg-[#f0f4ff]"
                          style={ri === 0 ? { fontWeight: 500 } : {}}
                          onMouseDown={e => e.stopPropagation()}
                          onBlur={e => {
                            setCell(ri, ci, e.currentTarget.innerHTML)
                            setEditCell(null)
                          }}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); document.execCommand("bold") }
                            if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); document.execCommand("italic") }
                            if ((e.metaKey || e.ctrlKey) && e.key === "u") { e.preventDefault(); document.execCommand("underline") }
                            if (e.key === "Tab") {
                              e.preventDefault()
                              if (ci + 1 < cols) setEditCell([ri, ci + 1])
                              else if (ri + 1 < data.length) setEditCell([ri + 1, 0])
                            }
                            if (e.key === "Escape") (e.target as HTMLElement).blur()
                          }}
                        />
                      : <div
                          key="display"
                          className="px-2 py-1.5 text-[12px] text-[#1d1d1f] cursor-text min-h-[30px] hover:bg-[#f5f5f5]"
                          style={ri === 0 ? { fontWeight: 500 } : {}}
                          dangerouslySetInnerHTML={{ __html: cell || (ri === 0 ? '<span style="color:#c0c0c0;font-weight:400;font-size:11px">Header</span>' : "") }}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setEditCell([ri, ci]) }}
                        />
                    }
                    {/* Column resize handle on header row */}
                    {ri === 0 && ci < cols - 1 && (
                      <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-[#2c4470]/20 active:bg-[#2c4470]/40 transition-colors"
                        onMouseDown={e => onResizeHandleDown(e, ci)}
                      />
                    )}
                  </td>
                ))}
                {/* Row delete on hover */}
                <td className="p-0 w-5 border-0">
                  <button
                    onClick={() => removeRow(ri)}
                    onMouseDown={e => e.stopPropagation()}
                    className="opacity-0 group-hover/row:opacity-100 w-5 h-full flex items-center justify-center text-[#c0c0c0] hover:text-red-400 transition-opacity"
                  >
                    <X size={9} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row — bottom hover button */}
      <div
        className="flex items-center justify-center py-1 border-t border-[#f0f0f0] opacity-0 group-hover/table:opacity-100 transition-opacity cursor-pointer hover:bg-[#fafafa]"
        onMouseDown={e => e.stopPropagation()}
        onClick={addRow}
      >
        <Plus size={10} className="text-[#b0b0b0]" />
      </div>

      {/* Add col — right hover button */}
      <div
        className="absolute top-0 right-0 translate-x-full h-full flex items-center pl-1 opacity-0 group-hover/table:opacity-100 transition-opacity"
        onMouseDown={e => e.stopPropagation()}
      >
        <button
          onClick={addCol}
          className="w-5 h-full flex items-center justify-center text-[#b0b0b0] hover:text-[#1d1d1f] bg-white border border-[#f0f0f0] rounded-r transition-colors"
          style={{ ...SH, boxShadow: "none" }}
        >
          <Plus size={10} />
        </button>
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

  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [mode,           setMode]           = useState<CanvasMode>("select")
  const [arrowFrom,      setArrowFrom]      = useState<string | null>(null)
  const [zoom,           setZoom]           = useState(1)
  const hasSavedPan = !!localStorage.getItem(LS_PAN)
  const [pan,            setPan]            = useState<{ x: number; y: number }>(() => ld(LS_PAN, { x: 0, y: 0 }))
  const [isPanning,      setIsPanning]      = useState(false)
  const [isDrawing,      setIsDrawing]      = useState(false)
  const [liveStroke,     setLiveStroke]     = useState("")
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [creatingFolder,  setCreatingFolder]   = useState(false)
  const [folderName,      setFolderName]       = useState("")

  // Multi-select
  const [selIds,         setSelIds]         = useState<Set<string>>(new Set())
  const [selRect,        setSelRect]        = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null)
  const [copyDialog,     setCopyDialog]     = useState(false)
  const [copyingBlockId, setCopyingBlockId] = useState<string | null>(null)

  const containerRef  = useRef<HTMLDivElement>(null)
  const panRef        = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const dragRef       = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const dragPosRef    = useRef<{ x: number; y: number } | null>(null)
  const blockEls      = useRef<Map<string, HTMLDivElement>>(new Map())
  const resizeRef     = useRef<{ id: string; sx: number; sw: number; sy: number; sh: number } | null>(null)
  const resizeVRef    = useRef<{ id: string; sy: number; sh: number } | null>(null)
  const strokePts     = useRef<{ x: number; y: number }[]>([])
  const selStartRef   = useRef<{ x: number; y: number } | null>(null)
  const blocksRef     = useRef<Block[]>(blocks)

  useEffect(() => {
    if (hasSavedPan) return  // restore saved position
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const all = blocksRef.current
    if (all.length === 0) {
      setPan({ x: width / 2, y: height / 2 })
    } else {
      const cx = all.reduce((s, b) => s + b.x + (b.w ?? BDEF[b.type][0]) / 2, 0) / all.length
      const cy = all.reduce((s, b) => s + b.y + (b.h ?? BDEF[b.type][1]) / 2, 0) / all.length
      setPan({ x: width / 2 - cx * zoom, y: height / 2 - cy * zoom })
    }
  }, [])

  const visibleBlocks  = blocks.filter(b => (b.folderId ?? null) === currentFolderId)
  const visibleStrokes = strokes.filter(s => s.folderId === currentFolderId)
  const visibleConns   = connections.filter(c => c.folderId === currentFolderId)
  const folderObj      = folders.find(f => f.id === currentFolderId) ?? null

  function mutateBlocks(next: Block[], save = true) {
    setBlocks(next); blocksRef.current = next; if (save) sv(LS_BLOCKS, next)
  }
  function mutateStrokes(next: DrawStroke[]) { setStrokes(next); sv(LS_STROKES, next) }
  function mutateConns(next: Connection[]) { setConnections(next); sv(LS_CONNS, next) }
  function mutateFolders(next: CanvasFolder[]) { setFolders(next); sv(LS_FOLDERS, next) }

  function patch(id: string, p: Partial<Block>, save = true) {
    mutateBlocks(blocks.map(b => b.id === id ? { ...b, ...p } : b), save)
  }
  function removeBlock(id: string) {
    mutateBlocks(blocks.filter(b => b.id !== id))
    mutateConns(connections.filter(c => c.fromId !== id && c.toId !== id))
    if (editingId === id) setEditingId(null)
    setSelIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function addBlock(type: BlockType) {
    const cw = containerRef.current?.clientWidth ?? 800
    const ch = containerRef.current?.clientHeight ?? 600
    const x = (cw / 2 - pan.x) / zoom + (Math.random() - 0.5) * 80
    const y = (ch / 2 - pan.y) / zoom + (Math.random() - 0.5) * 60
    const b: Block = { id: uid(), type, x, y, folderId: currentFolderId, createdAt: new Date().toISOString() }
    if (type === "project") b.status = "Active"
    if (type === "table") { b.tableData = [Array(3).fill(""), Array(3).fill(""), Array(3).fill("")]; b.tableCols = 3 }
    mutateBlocks([...blocks, b])
    setEditingId(b.id)
    setSelIds(new Set())
  }
  function createFolder() {
    if (!folderName.trim()) { setCreatingFolder(false); return }
    const f: CanvasFolder = { id: uid(), name: folderName.trim() }
    mutateFolders([...folders, f])
    setFolderName(""); setCreatingFolder(false); setCurrentFolderId(f.id)
  }
  function copySelectedToFolder(targetFolderId: string | null) {
    const toCopy = blocks.filter(b => selIds.has(b.id))
    const copies = toCopy.map(b => ({ ...b, id: uid(), folderId: targetFolderId, x: b.x + 30, y: b.y + 30 }))
    mutateBlocks([...blocks, ...copies])
    setSelIds(new Set()); setCopyDialog(false)
  }
  function copyBlockToFolder(blockId: string, targetFolderId: string | null) {
    const b = blocks.find(bl => bl.id === blockId)
    if (!b) return
    mutateBlocks([...blocks, { ...b, id: uid(), folderId: targetFolderId, x: b.x + 30, y: b.y + 30 }])
    setCopyingBlockId(null)
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

  // ── Pointer events — drawing ──────────────────────────────────
  const isDrawingRef = useRef(false)
  function onPointerDown(e: React.PointerEvent) {
    if (mode !== "draw") return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    strokePts.current = [screenToCanvas(e.clientX, e.clientY)]
    isDrawingRef.current = true; setIsDrawing(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (mode !== "draw" || !isDrawingRef.current) return
    strokePts.current = [...strokePts.current, screenToCanvas(e.clientX, e.clientY)]
    setLiveStroke(ptPath(strokePts.current))
  }
  function onPointerUp() {
    if (mode !== "draw") return
    if (strokePts.current.length > 1) {
      mutateStrokes([...strokes, { id: uid(), path: ptPath(strokePts.current), folderId: currentFolderId }])
    }
    strokePts.current = []; setLiveStroke(""); isDrawingRef.current = false; setIsDrawing(false)
  }

  // ── Mouse events — select / hand / drag / resize ──────────────
  function onCanvasDown(e: React.MouseEvent) {
    if (mode === "draw" || mode === "arrow") return
    setCopyingBlockId(null)
    if (editingId) { setEditingId(null); return }
    if ((e.target as HTMLElement).closest("[data-block]")) return

    if (e.altKey) {
      // Alt+drag = rubber-band select
      const r = containerRef.current!.getBoundingClientRect()
      selStartRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
      setSelIds(new Set())
    } else {
      // Default: pan the canvas
      panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
      setIsPanning(true)
    }
  }
  function onCardDown(e: React.MouseEvent, id: string) {
    if (mode === "draw") return
    if (mode === "arrow") {
      e.stopPropagation()
      if (!arrowFrom) {
        setArrowFrom(id)
      } else if (arrowFrom !== id) {
        mutateConns([...connections, { id: uid(), fromId: arrowFrom, toId: id, folderId: currentFolderId }])
        setArrowFrom(null)
      }
      return
    }
    if (editingId === id) return
    e.stopPropagation()

    if (e.shiftKey) {
      setSelIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
      return
    }
    if (!selIds.has(id)) setSelIds(new Set())

    const pos = blocks.find(b => b.id === id)
    if (!pos) return
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    // Use native window events to bypass React's synthetic event overhead during drag
    const capturedZoom = zoom
    function nativeDragMove(ev: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const dx = (ev.clientX - drag.startX) / capturedZoom
      const dy = (ev.clientY - drag.startY) / capturedZoom
      dragPosRef.current = { x: drag.origX + dx, y: drag.origY + dy }
      const el = blockEls.current.get(drag.id)
      if (el) el.style.transform = `translate(${dx}px,${dy}px)`
    }
    function nativeDragEnd() {
      window.removeEventListener("mousemove", nativeDragMove)
      window.removeEventListener("mouseup", nativeDragEnd)
      const drag = dragRef.current
      const finalPos = dragPosRef.current
      dragRef.current = null
      dragPosRef.current = null
      if (!drag || !finalPos) return
      const el = blockEls.current.get(drag.id)
      if (el) { el.style.left = `${finalPos.x}px`; el.style.top = `${finalPos.y}px`; el.style.transform = "" }
      const next = blocksRef.current.map(b => b.id === drag.id ? { ...b, ...finalPos } : b)
      setBlocks(next); blocksRef.current = next; sv(LS_BLOCKS, next)
    }
    window.addEventListener("mousemove", nativeDragMove)
    window.addEventListener("mouseup", nativeDragEnd)
  }
  function onResizeDown(e: React.MouseEvent, block: Block) {
    e.stopPropagation()
    resizeRef.current = {
      id: block.id,
      sx: e.clientX, sw: block.w ?? BDEF[block.type][0],
      sy: e.clientY, sh: block.h ?? BDEF[block.type][1],
    }
  }
  function onResizeVDown(e: React.MouseEvent, block: Block) {
    e.stopPropagation()
    resizeVRef.current = { id: block.id, sy: e.clientY, sh: block.h ?? BDEF[block.type][1] }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (mode === "draw") return

    // Rubber-band selection
    if (selStartRef.current) {
      const r = containerRef.current!.getBoundingClientRect()
      const ex = e.clientX - r.left, ey = e.clientY - r.top
      const dx = ex - selStartRef.current.x, dy = ey - selStartRef.current.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setSelRect({ sx: selStartRef.current.x, sy: selStartRef.current.y, ex, ey })
      }
      return
    }
    if (selRect) {
      const r = containerRef.current!.getBoundingClientRect()
      setSelRect(prev => prev ? { ...prev, ex: e.clientX - r.left, ey: e.clientY - r.top } : null)
      return
    }

    if (resizeRef.current) {
      const { id, sx, sw, sy, sh } = resizeRef.current
      patch(id, {
        w: Math.max(80, sw + (e.clientX - sx) / zoom),
        h: Math.max(40, sh + (e.clientY - sy) / zoom),
      }, false)
      return
    }
    if (resizeVRef.current) {
      const { id, sy, sh } = resizeVRef.current
      patch(id, { h: Math.max(40, sh + (e.clientY - sy) / zoom) }, false)
      return
    }
    if (panRef.current) {
      setPan({ x: panRef.current.px + (e.clientX - panRef.current.sx), y: panRef.current.py + (e.clientY - panRef.current.sy) })
    }
  }
  function onMouseUp() {
    // Finalize rubber-band selection
    if (selStartRef.current) {
      if (selRect) {
        const cx1 = (Math.min(selRect.sx, selRect.ex) - pan.x) / zoom
        const cy1 = (Math.min(selRect.sy, selRect.ey) - pan.y) / zoom
        const cx2 = (Math.max(selRect.sx, selRect.ex) - pan.x) / zoom
        const cy2 = (Math.max(selRect.sy, selRect.ey) - pan.y) / zoom
        const selected = visibleBlocks.filter(b =>
          b.x + (b.w ?? BDEF[b.type][0]) > cx1 && b.x < cx2 &&
          b.y + (b.h ?? BDEF[b.type][1]) > cy1 && b.y < cy2
        )
        setSelIds(new Set(selected.map(b => b.id)))
      }
      selStartRef.current = null
      setSelRect(null)
    }
    if (resizeRef.current || resizeVRef.current) {
      sv(LS_BLOCKS, blocksRef.current)
    }
    resizeRef.current = null; resizeVRef.current = null
    if (panRef.current) sv(LS_PAN, pan)
    panRef.current = null; setIsPanning(false)
  }

  return (
    <div className="flex flex-col h-full w-full relative">

      {/* Breadcrumb */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-[#f0f0f0] text-[12px]">
        <button onClick={() => setCurrentFolderId(null)}
          className={`font-medium transition-colors ${currentFolderId ? "text-[#7a7a7a] hover:text-[#1d1d1f]" : "text-[#1d1d1f]"}`}>
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
                  currentFolderId === f.id ? "bg-[#1d1d1f] text-white border-[#1d1d1f]" : "text-[#7a7a7a] border-[#e0e0e0] hover:border-[#1d1d1f] hover:text-[#1d1d1f]"
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
        <button onClick={() => { setZoom(1); localStorage.removeItem(LS_PAN); const el = containerRef.current; if (el) { const { width, height } = el.getBoundingClientRect(); const all = blocksRef.current; if (all.length === 0) { setPan({ x: width/2, y: height/2 }) } else { const cx = all.reduce((s,b)=>s+b.x+(b.w??BDEF[b.type][0])/2,0)/all.length; const cy = all.reduce((s,b)=>s+b.y+(b.h??BDEF[b.type][1])/2,0)/all.length; setPan({ x: width/2-cx, y: height/2-cy }) } } }} className="p-1.5 bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><Maximize2 size={11} className="text-[#7a7a7a]" /></button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-[#fafafa]"
        style={{ cursor: mode === "draw" ? "crosshair" : mode === "arrow" ? "cell" : isPanning ? "grabbing" : selRect ? "crosshair" : "default" }}
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

        {/* Rubber-band selection rect */}
        {selRect && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            <div style={{
              position: "absolute",
              left: Math.min(selRect.sx, selRect.ex),
              top: Math.min(selRect.sy, selRect.ey),
              width: Math.abs(selRect.ex - selRect.sx),
              height: Math.abs(selRect.ey - selRect.sy),
              background: "rgba(44, 68, 112, 0.07)",
              border: "1px dashed rgba(44, 68, 112, 0.5)",
              borderRadius: 3,
            }} />
          </div>
        )}

        {/* Canvas transform */}
        <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>

          {/* SVG: connections + drawing strokes */}
          <svg className="absolute overflow-visible pointer-events-none"
            style={{ left: 0, top: 0, width: 0, height: 0 }}>
            <defs>
              <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0,8 3,0 6" fill="#a0a0b0" />
              </marker>
            </defs>

            {visibleStrokes.map(s => (
              <path key={s.id} d={s.path} stroke="#5a5aaa" strokeWidth={2 / zoom} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            ))}
            {liveStroke && (
              <path d={liveStroke} stroke="#5a5aaa" strokeWidth={2 / zoom} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            )}

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
            const isSel     = selIds.has(block.id)
            return (
              <div key={block.id} data-block="true" className="group"
                ref={el => { if (el) blockEls.current.set(block.id, el as HTMLDivElement); else blockEls.current.delete(block.id) }}
                style={{
                  position: "absolute", left: block.x, top: block.y, zIndex: isEditing ? 10 : 1,
                  outline: isSel ? "2px solid #2c4470" : isFrom ? "2px dashed #7070c0" : undefined,
                  outlineOffset: isSel ? "3px" : "4px",
                }}
                onMouseDown={e => onCardDown(e, block.id)}
              >
                <div
                  style={{ outline: isEditing ? "2px solid #2c4470" : "none", outlineOffset: 2 }}
                  onDoubleClick={() => !isEditing && mode === "select" && setEditingId(block.id)}
                >
                  {block.type === "title"   && <TitleBlock   block={block} editing={isEditing} onEdit={() => mode === "select" && setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "note"    && <NoteBlock    block={block} editing={isEditing} onEdit={() => mode === "select" && setEditingId(block.id)} onChange={p => patch(block.id, p)} onResizeV={e => onResizeVDown(e, block)} />}
                  {block.type === "image"   && <ImageBlock   block={block} editing={isEditing} onEdit={() => mode === "select" && setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "idea"    && <IdeaBlock    block={block} editing={isEditing} onEdit={() => mode === "select" && setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "project" && <ProjectBlock block={block} editing={isEditing} onEdit={() => mode === "select" && setEditingId(block.id)} onChange={p => patch(block.id, p)} />}
                  {block.type === "table"   && <TableBlock   block={block} editing={isEditing} onChange={p => patch(block.id, p)} />}
                </div>

                {/* Hover controls: copy + delete */}
                <div className="absolute -top-2.5 -right-2.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  {/* Copy to folder */}
                  {folders.length > 0 && (
                    <div className="relative">
                      <div
                        className="w-5 h-5 rounded-full bg-[#2c4470] flex items-center justify-center cursor-pointer hover:bg-[#3a5a8a] transition-colors"
                        onMouseDown={e => { e.stopPropagation(); setCopyingBlockId(id => id === block.id ? null : block.id) }}
                      >
                        <Copy size={8} className="text-white" />
                      </div>
                      {copyingBlockId === block.id && (
                        <div className="absolute top-6 right-0 bg-white rounded-lg border border-[#e0e0e0] shadow-xl py-1 min-w-[130px] z-50"
                          onMouseDown={e => e.stopPropagation()}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#a0a0a0] px-3 py-1">Copy to</p>
                          {currentFolderId !== null && (
                            <button onClick={() => copyBlockToFolder(block.id, null)}
                              className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#f5f5f7]">
                              Root canvas
                            </button>
                          )}
                          {folders.filter(f => f.id !== currentFolderId).map(f => (
                            <button key={f.id} onClick={() => copyBlockToFolder(block.id, f.id)}
                              className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#f5f5f7]">
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Delete */}
                  <div
                    className="w-5 h-5 rounded-full bg-[#1d1d1f] flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
                    onMouseDown={e => { e.stopPropagation(); removeBlock(block.id) }}
                  >
                    <X size={9} className="text-white" />
                  </div>
                </div>

                {/* Corner resize handle (width + height) */}
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

        {/* Mode hint */}
        {mode !== "select" && mode !== "hand" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#1d1d1f] text-white text-[11px] px-3 py-1.5 rounded-full pointer-events-none select-none">
            {mode === "draw"  && "Draw freely · click Draw again to exit"}
            {mode === "arrow" && (arrowFrom ? "Click another block to connect" : "Click a block to start an arrow")}
          </div>
        )}

        {/* Selection toolbar */}
        {selIds.size > 0 && !selRect && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#1d1d1f] text-white rounded-full px-4 py-2 shadow-xl">
            <span className="text-[11px] font-medium text-white/70">{selIds.size} selected</span>
            <div className="w-px h-4 bg-white/20" />
            <button onClick={() => setCopyDialog(c => !c)}
              className="text-[11px] hover:text-white/70 transition-colors">Copy to…</button>
            <button
              onClick={() => {
                mutateBlocks(blocks.filter(b => !selIds.has(b.id)))
                mutateConns(connections.filter(c => !selIds.has(c.fromId) && !selIds.has(c.toId)))
                setSelIds(new Set())
              }}
              className="text-[11px] text-red-300 hover:text-red-200 transition-colors">Delete</button>
            <button onClick={() => setSelIds(new Set())} className="text-white/40 hover:text-white ml-1">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Copy-to-folder dialog */}
        {copyDialog && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 bg-white rounded-xl border border-[#e0e0e0] shadow-xl p-3 min-w-[180px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Copy to canvas</p>
            <button onClick={() => copySelectedToFolder(null)}
              className={`block w-full text-left px-2 py-1.5 text-[12px] hover:bg-[#f5f5f7] rounded ${currentFolderId === null ? "font-semibold" : ""}`}>
              Root canvas
            </button>
            {folders.map(f => (
              <button key={f.id} onClick={() => copySelectedToFolder(f.id)}
                className={`block w-full text-left px-2 py-1.5 text-[12px] hover:bg-[#f5f5f7] rounded ${currentFolderId === f.id ? "font-semibold" : ""}`}>
                {f.name}
              </button>
            ))}
            <button onClick={() => setCopyDialog(false)}
              className="mt-1.5 w-full text-[10px] text-[#a0a0a0] hover:text-[#1d1d1f] text-center transition-colors">Cancel</button>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-2 py-3 bg-white border-t border-[#e8e8e8]">
        <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl">
          {([
            { type: "title"   as BlockType, icon: <AlignLeft size={14} />,  label: "Title"   },
            { type: "note"    as BlockType, icon: <Type size={14} />,        label: "Note"    },
            { type: "image"   as BlockType, icon: <ImageIcon size={14} />,   label: "Image"   },
            { type: "idea"    as BlockType, icon: <Lightbulb size={14} />,   label: "Idea"    },
            { type: "project" as BlockType, icon: <FolderOpen size={14} />,  label: "Project" },
            { type: "table"   as BlockType, icon: <Table2 size={14} />,      label: "Table"   },
          ] as const).map(({ type, icon, label }) => (
            <button key={type}
              onClick={() => { setMode("select"); setArrowFrom(null); addBlock(type) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#1d1d1f] hover:bg-white hover:shadow-sm transition-all">
              <span className="text-[#7a7a7a]">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl">
          <button
            onClick={() => { setMode(m => m === "hand" ? "select" : "hand"); setArrowFrom(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${mode === "hand" ? "bg-white shadow-sm text-[#1d1d1f]" : "text-[#7a7a7a] hover:bg-white hover:shadow-sm"}`}>
            <Hand size={14} /> Pan
          </button>
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
