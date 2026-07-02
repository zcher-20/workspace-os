import { useState, useEffect, useRef, useCallback } from "react"
import {
  UploadCloud, FolderPlus, Folder, FolderOpen, FileText, FileSpreadsheet,
  Presentation, Image, File, ExternalLink, ChevronRight, Download,
  Trash2, AlignLeft, HardDrive, CalendarDays, Save, Archive,
} from "lucide-react"
import { GlassButton } from "@/components/GlassButton"
import { Input } from "@/components/ui/input"
import ReactMarkdown from "react-markdown"

// ── Types ──────────────────────────────────────────────────────

interface FileEntry { name: string; size: number; modified: number }
interface DirNode { files: FileEntry[]; folders: Record<string, DirNode> }
interface WorkspaceData { input: DirNode; output: DirNode }

// ── Helpers ────────────────────────────────────────────────────

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["pdf", "docx", "doc", "txt", "md"].includes(ext)) return <FileText size={size} className="text-[#2c4470]" />
  if (["xlsx", "xls", "csv"].includes(ext))              return <FileSpreadsheet size={size} className="text-[#065f46]" />
  if (["pptx", "ppt"].includes(ext))                     return <Presentation size={size} className="text-[#92400e]" />
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return <Image size={size} className="text-[#4c1d95]" />
  return <File size={size} className="text-[#7a7a7a]" />
}

// ── File node ──────────────────────────────────────────────────

function FileNode({
  name, size, prefix, onSelect, onDelete, selected,
}: FileEntry & { prefix: string; onSelect: (p: string) => void; onDelete?: (p: string) => void; selected: string | null }) {
  const path = `${prefix}${name}`
  const isSelected = selected === path
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-[7px] cursor-pointer transition-colors ${isSelected ? "bg-[#2c4470]/8 text-[#2c4470]" : "hover:bg-[#f5f5f7] text-[#1d1d1f]"}`}
      onClick={() => onSelect(path)}
    >
      <FileIcon name={name} />
      <span className="flex-1 text-[12px] truncate">{name}</span>
      <span className="text-[10px] text-[#b0b0b0] shrink-0 hidden group-hover:block">{fmt(size)}</span>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(path) }}
          className="shrink-0 hidden group-hover:block text-[#7a7a7a] hover:text-red-500 transition-colors ml-1">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

function FolderNode({
  name, node, prefix, onSelect, onDelete, selected, depth = 0,
}: { name: string; node: DirNode; prefix: string; onSelect: (p: string) => void; onDelete?: (p: string) => void; selected: string | null; depth?: number }) {
  const [open, setOpen] = useState(depth === 0)
  const hasContent = node.files.length > 0 || Object.keys(node.folders).length > 0
  const Icon = open ? FolderOpen : Folder
  return (
    <div>
      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[7px] hover:bg-[#f5f5f7] transition-colors" onClick={() => setOpen(v => !v)}>
        <ChevronRight size={11} className={`text-[#7a7a7a] transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
        <Icon size={13} className="text-[#7a7a7a] shrink-0" fill={open ? "rgba(124,124,124,0.15)" : "none"} />
        <span className="text-[12px] font-medium text-[#1d1d1f] flex-1 text-left truncate">{name}</span>
        {hasContent && <span className="text-[10px] text-[#b0b0b0]">{node.files.length}</span>}
      </button>
      {open && (
        <div className="ml-4 border-l border-[#f0f0f0] pl-2 space-y-0.5 mt-0.5">
          {Object.entries(node.folders).map(([n, child]) => (
            <FolderNode key={n} name={n} node={child} prefix={`${prefix}${name}/`} onSelect={onSelect} onDelete={onDelete} selected={selected} depth={depth + 1} />
          ))}
          {node.files.map(f => (
            <FileNode key={f.name} {...f} prefix={`${prefix}${name}/`} onSelect={onSelect} onDelete={onDelete} selected={selected} />
          ))}
          {!hasContent && <p className="px-2 py-1 text-[11px] text-[#b0b0b0] italic">Empty</p>}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────

const NOTES_KEY = "enterprise-agent:notes"
const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

export default function Documents() {
  const [ws, setWs] = useState<WorkspaceData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadInfo, setUploadInfo] = useState<string | null>(null)
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState("")
  const [resultLoading, setResultLoading] = useState(false)
  const [docReady, setDocReady] = useState(false)
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [notes, setNotes] = useState(() => localStorage.getItem(NOTES_KEY) ?? "")
  const [notesSaved, setNotesSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const loadWs = useCallback(async () => {
    const d = await fetch("/api/workspace/files").then(r => r.json())
    setWs(d)
  }, [])

  useEffect(() => { loadWs() }, [loadWs])

  // Auto-save notes to localStorage
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(NOTES_KEY, notes), 600)
    return () => clearTimeout(t)
  }, [notes])

  async function handleFile(file: File) {
    setUploading(true); setDocReady(false); setUploadInfo(null)
    const form = new FormData(); form.append("file", file)
    const d = await (await fetch("/api/upload", { method: "POST", body: form })).json()
    setUploading(false)
    if (d.ok) {
      setUploadInfo(`${d.parsed.word_count} words · ${d.parsed.page_count} pages · ${d.parsed.file_type}`)
      setDocReady(true); loadWs()
    } else { setUploadInfo(`Error: ${d.error}`) }
  }

  async function stream(url: string, body: object) {
    setResultLoading(true); setResult("")
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) { const d = await res.json(); setResult(d.content ?? d.error ?? ""); setResultLoading(false); return }
    let full = ""
    const reader = res.body!.getReader(), decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      for (const line of decoder.decode(value, { stream: true }).split("\n")) {
        if (!line.startsWith("data: ")) continue
        try { const m = JSON.parse(line.slice(6)); if (m.done) break; if (m.text) { full += m.text; setResult(full) } } catch {}
      }
    }
    setResultLoading(false)
  }

  async function deleteFile(path: string) {
    await fetch(`/api/workspace/file/input/${path}`, { method: "DELETE" })
    if (selected === path) setSelected(null)
    loadWs()
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    await fetch("/api/workspace/folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    setNewFolderMode(false); setNewFolderName(""); loadWs()
  }

  async function saveNotesToFile() {
    if (!notes.trim()) return
    const filename = `notes-${new Date().toISOString().slice(0, 10)}.txt`
    const blob = new Blob([notes], { type: "text/plain" })
    const form = new FormData(); form.append("file", blob, filename)
    await fetch("/api/workspace/upload", { method: "POST", body: form })
    setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); loadWs()
  }

  const selectedName = selected?.split("/").pop() ?? ""

  return (
    <div className="space-y-6">
      {/* Date row (replaces "Documents" title) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-[#7a7a7a]">
          <CalendarDays size={14} strokeWidth={2.5} />
          {date}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setNewFolderMode(true); setTimeout(() => folderInputRef.current?.focus(), 50) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] text-[#7a7a7a] border border-[#e0e0e0] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
          >
            <FolderPlus size={12} /> New Folder
          </button>
          <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-white bg-[#2c4470] hover:bg-[#1e3560] transition-colors">
            <HardDrive size={12} /> Google Drive <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* New folder input */}
      {newFolderMode && (
        <div className="flex items-center gap-2">
          <input ref={folderInputRef}
            className="flex-1 rounded-[8px] border border-[#2c4470]/40 bg-white px-3 py-2 text-[13px] outline-none"
            placeholder="Folder name…" value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setNewFolderMode(false); setNewFolderName("") } }}
          />
          <GlassButton onClick={createFolder}>Create</GlassButton>
          <button onClick={() => { setNewFolderMode(false); setNewFolderName("") }} className="text-[12px] text-[#7a7a7a] hover:text-[#1d1d1f]">Cancel</button>
        </div>
      )}

      {/* Equal-width two-column: file tree | upload */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* ── File tree ── */}
        <div className="rounded-[12px] border border-[#ebebeb] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f0f0f0]">
            <p className="text-[15px] font-bold tracking-tight text-[#1d1d1f]">Workspace</p>
          </div>
          <div className="p-2 space-y-0.5 max-h-[420px] overflow-y-auto">
            {ws ? (
              <>
                <FolderNode name="Input" node={ws.input} prefix="" onSelect={setSelected} onDelete={deleteFile} selected={selected} />
                <FolderNode name="Output" node={ws.output} prefix="output/" onSelect={setSelected} selected={selected} />
              </>
            ) : (
              <p className="px-2 py-3 text-[12px] text-[#b0b0b0]">Loading…</p>
            )}
          </div>
        </div>

        {/* ── Upload + actions ── */}
        <div className="space-y-4">
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${dragOver ? "border-[#2c4470] bg-[#f0f3fa]" : "border-[#d8d8d8] hover:border-[#2c4470]/40"}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <UploadCloud size={22} className="text-[#b0b0b0]" />
            <p className="text-[13px] text-[#7a7a7a]">{uploading ? "Uploading…" : "Drop a file or click to upload"}</p>
            {uploadInfo && <p className="text-[11px] text-[#7a7a7a]">{uploadInfo}</p>}
            <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          {selected && (
            <div className="rounded-[10px] border border-[#ebebeb] bg-[#fafafa] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon name={selectedName} size={15} />
                <span className="text-[13px] font-medium text-[#1d1d1f] truncate">{selectedName}</span>
              </div>
              <a href={`/api/workspace/file/input/${selected}`} download={selectedName}
                className="shrink-0 flex items-center gap-1 text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
                <Download size={11} /> Download
              </a>
            </div>
          )}

          {docReady && (
            <>
              <div className="flex gap-2">
                <GlassButton onClick={() => stream("/api/summarize", {})}>Summarize</GlassButton>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Ask a question about the document…" value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { stream("/api/ask", { question }); setQuestion("") } }} />
                <GlassButton onClick={() => { stream("/api/ask", { question }); setQuestion("") }}>Ask</GlassButton>
              </div>
            </>
          )}

          {(resultLoading || result) && (
            <div className="rounded-[12px] border border-[#ebebeb] bg-white px-5 py-4">
              {resultLoading && <p className="text-[12px] text-[#7a7a7a] animate-pulse">Thinking…</p>}
              {result && <div className="prose text-[13px]"><ReactMarkdown>{result}</ReactMarkdown></div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlignLeft size={14} className="text-[#7a7a7a]" />
            <h3 className="text-[15px] font-bold tracking-tight">Notes</h3>
          </div>
          <button
            onClick={saveNotesToFile}
            disabled={!notes.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] text-[#7a7a7a] border border-[#e0e0e0] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-40 transition-colors"
          >
            <Save size={11} />
            {notesSaved ? "Saved!" : "Save to files"}
          </button>
        </div>
        <textarea
          className="w-full min-h-[160px] rounded-[12px] border border-[#e0e0e0] bg-white px-4 py-3.5 text-[13px] text-[#1d1d1f] leading-relaxed placeholder:text-[#b0b0b0] outline-none focus:border-[#2c4470]/40 resize-none transition-colors"
          placeholder="Jot down notes, ideas, or links — auto-saved locally…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* ── Archive (full-width file tree) ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Archive size={14} className="text-[#7a7a7a]" />
          <h3 className="text-[15px] font-bold tracking-tight">Archive</h3>
        </div>
        <div className="rounded-[12px] border border-[#ebebeb] bg-white overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-[#f0f0f0]">
            {/* Input column */}
            <div>
              <div className="px-4 py-2.5 border-b border-[#f0f0f0]">
                <p className="text-[13px] font-bold tracking-tight text-[#7a7a7a]">Input</p>
              </div>
              <div className="p-2 space-y-0.5 max-h-[320px] overflow-y-auto">
                {ws ? (
                  <>
                    {Object.entries(ws.input.folders).map(([n, child]) => (
                      <FolderNode key={n} name={n} node={child} prefix="" onSelect={setSelected} onDelete={deleteFile} selected={selected} />
                    ))}
                    {ws.input.files.map(f => (
                      <FileNode key={f.name} {...f} prefix="" onSelect={setSelected} onDelete={deleteFile} selected={selected} />
                    ))}
                    {ws.input.files.length === 0 && Object.keys(ws.input.folders).length === 0 && (
                      <p className="px-2 py-4 text-[12px] text-[#b0b0b0] italic">No input files</p>
                    )}
                  </>
                ) : <p className="px-2 py-3 text-[12px] text-[#b0b0b0]">Loading…</p>}
              </div>
            </div>
            {/* Output column */}
            <div>
              <div className="px-4 py-2.5 border-b border-[#f0f0f0]">
                <p className="text-[13px] font-bold tracking-tight text-[#7a7a7a]">Output</p>
              </div>
              <div className="p-2 space-y-0.5 max-h-[320px] overflow-y-auto">
                {ws ? (
                  <>
                    {Object.entries(ws.output.folders).map(([n, child]) => (
                      <FolderNode key={n} name={n} node={child} prefix="output/" onSelect={setSelected} selected={selected} />
                    ))}
                    {ws.output.files.map(f => (
                      <FileNode key={f.name} {...f} prefix="output/" onSelect={setSelected} selected={selected} />
                    ))}
                    {ws.output.files.length === 0 && Object.keys(ws.output.folders).length === 0 && (
                      <p className="px-2 py-4 text-[12px] text-[#b0b0b0] italic">No output files</p>
                    )}
                  </>
                ) : <p className="px-2 py-3 text-[12px] text-[#b0b0b0]">Loading…</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
