import { useState, useRef, useEffect, useCallback } from "react"
import { Pencil, Upload, Move, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { TasksContent } from "@/components/sections/Tasks"

function navigate(section: string) {
  window.dispatchEvent(new CustomEvent("workspace:navigate", { detail: section }))
}

function ld<T>(k: string, d: T): T {
  try { return JSON.parse(localStorage.getItem(k) || "null") ?? d } catch { return d }
}
function sv(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)) }

// ── IndexedDB image store (no size limits unlike localStorage) ────────

const IDB_NAME  = "archive-os-images"
const IDB_STORE = "imgs"

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function idbSave(key: string, data: string): Promise<void> {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite")
    tx.objectStore(IDB_STORE).put(data, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function idbLoad(key: string): Promise<string | null> {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readonly")
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve((req.result as string) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// ── Image compression ─────────────────────────────────────────────────

function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const MAX_W = 1200
      const scale = Math.min(1, MAX_W / image.width)
      const canvas = document.createElement("canvas")
      canvas.width  = Math.round(image.width  * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL("image/jpeg", 0.82))
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); resolve("") }
    image.src = objectUrl
  })
}

// ── Image upload hook — persists to IndexedDB ─────────────────────────

function useImageUpload(storageKey: string) {
  const [img, setImg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load from IndexedDB on mount (with localStorage fallback for old data)
  useEffect(() => {
    idbLoad(storageKey)
      .then(data => {
        if (data) { setImg(data); return }
        // migrate any old localStorage value
        const legacy = ld<string | null>(storageKey, null)
        if (legacy) {
          setImg(legacy)
          idbSave(storageKey, legacy).catch(() => {})
        }
      })
      .catch(() => {
        const legacy = ld<string | null>(storageKey, null)
        if (legacy) setImg(legacy)
      })
  }, [storageKey])

  function trigger() { inputRef.current?.click() }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const data = await compressImage(file)
    if (!data) return
    setImg(data)
    idbSave(storageKey, data).catch(err => console.warn("IDB save failed:", err))
  }

  return { img, trigger, inputRef, onChange }
}

// ── Constants ─────────────────────────────────────────────────────────

const SECTIONS = [
  { num: "001", id: "collection",    scrollTo: null,    label: "Collection",       desc: "Images, notes, links, and references. Your visual archive board." },
  { num: "002", id: "projects",      scrollTo: null,    label: "Projects Canvas",  desc: "Free-form canvas for ideas, diagrams, and project blocks." },
  { num: "003", id: "opportunities", scrollTo: null,    label: "Opportunities",    desc: "Track applications, interviews, and offers." },
  { num: "004", id: "people",        scrollTo: null,    label: "Network",          desc: "Contacts, organizations, events, and outreach." },
  { num: "005", id: "degree",        scrollTo: null,    label: "Degree Planner",   desc: "Course planning, schedule, and requirements tracking." },
  { num: "006", id: "chat",          scrollTo: null,    label: "Chat",             desc: "AI assistant and conversation history." },
  { num: "007", id: null,            scrollTo: "home-tasks", label: "Tasks",       desc: "Weekly task tracker with links, checklists, and notes." },
]

function ImageUploadSlot({
  storageKey, aspect = "4/3", className = "",
  placeholder,
}: {
  storageKey: string
  aspect?: string
  className?: string
  placeholder?: React.ReactNode
}) {
  const { img, trigger, inputRef, onChange } = useImageUpload(storageKey)

  // object-position stored as {x, y} percentages
  const posKey = storageKey + "-pos"
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { return JSON.parse(localStorage.getItem(posKey) || "null") ?? { x: 50, y: 50 } }
    catch { return { x: 50, y: 50 } }
  })
  const [repositioning, setRepositioning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null)

  const savePos = useCallback((p: { x: number; y: number }) => {
    setPos(p)
    localStorage.setItem(posKey, JSON.stringify(p))
  }, [posKey])

  const onMoveMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y }
    const container = containerRef.current
    if (!container) return
    const { width, height } = container.getBoundingClientRect()

    function onMove(me: MouseEvent) {
      if (!dragStartRef.current) return
      const dx = me.clientX - dragStartRef.current.mouseX
      const dy = me.clientY - dragStartRef.current.mouseY
      // Moving right → image shifts left → focal point moves left (decrease x%)
      const newX = Math.max(0, Math.min(100, dragStartRef.current.posX - (dx / width) * 100))
      const newY = Math.max(0, Math.min(100, dragStartRef.current.posY - (dy / height) * 100))
      savePos({ x: newX, y: newY })
    }
    function onUp() {
      dragStartRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [pos, savePos])

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-xl bg-[#f5f5f7] ${className}`}
      style={{ aspectRatio: aspect }}
    >
      {img ? (
        <img
          src={img}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${pos.x}% ${pos.y}%`, userSelect: "none" }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {placeholder ?? <Upload size={16} className="text-[#d0d0d0]" />}
        </div>
      )}

      {/* Hover overlay — shown when image exists */}
      {img && (
        <div className="absolute inset-0 flex items-end justify-end gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
          {/* Move/reposition button */}
          <button
            onMouseDown={onMoveMouseDown}
            onClick={e => e.stopPropagation()}
            title="Drag to reposition"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 text-white text-[10px] cursor-move hover:bg-black/70 transition-colors"
          >
            <Move size={11} /> Move
          </button>
          {/* Replace image button */}
          <button
            onClick={e => { e.stopPropagation(); trigger() }}
            title="Replace image"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 text-white text-[10px] hover:bg-black/70 transition-colors"
          >
            <Upload size={11} /> Replace
          </button>
        </div>
      )}

      {/* Empty state upload button */}
      {!img && (
        <button
          onClick={e => { e.stopPropagation(); trigger() }}
          className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Upload size={15} className="text-white drop-shadow" />
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  )
}

const LS_NAME = "workspace:home-name"
const LS_ROLE = "workspace:home-role"

export default function ArchiveHome() {
  const [name, setName] = useState(() => ld<string>(LS_NAME, "Zayneb Cherif"))
  const [editName, setEditName] = useState(false)

  const [role, setRole] = useState(() => ld<string>(LS_ROLE, "Computer Science · Columbia University"))
  const [editRole, setEditRole] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(true)

  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })

  return (
    <div className="min-h-full bg-white">

      {/* Top section: sidebar + sections grid side by side */}
      <div className="flex">

      {/* Left sidebar — sticky full height so it never scrolls away */}
      <div className={`shrink-0 sticky top-0 h-screen overflow-y-auto flex flex-col gap-8 transition-all duration-300 ${sidebarOpen ? "w-[220px] px-6 pt-10 pb-8" : "w-10 pt-10 items-center"}`}>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="shrink-0 text-[#c0c0c0] hover:text-[#5a5a5a] transition-colors"
          title={sidebarOpen ? "Hide menu" : "Show menu"}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {sidebarOpen && (
          <>
            {/* User photo */}
            <ImageUploadSlot
              storageKey="workspace:home-user-photo"
              aspect="1/1"
              className="w-full !rounded-none"
              placeholder={
                <div className="flex flex-col items-center gap-2 text-[#c0c0c0]">
                  <Upload size={18} />
                  <span className="text-[10px]">Add photo</span>
                </div>
              }
            />

            {/* Sidebar nav */}
            <nav className="flex flex-col gap-0.5 border-r border-[#f0f0f0] pr-4">
              {SECTIONS.map(s => (
                <button
                  key={s.num}
                  onClick={s.scrollTo
                    ? () => document.getElementById(s.scrollTo!)?.scrollIntoView({ behavior: "smooth" })
                    : s.id ? () => navigate(s.id!) : undefined}
                  className="flex items-center gap-3 py-1.5 group text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d0d0d0] group-hover:bg-[#1d1d1f] transition-colors shrink-0" />
                  <span className="text-[12px] text-[#7a7a7a] group-hover:text-[#1d1d1f] transition-colors leading-tight">{s.label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </div>

      {/* Right column — sections grid only */}
      <div className="flex-1 min-w-0">
        <div className="px-10 pt-10 pb-16">

          {/* Header row */}
          <div className="flex items-start justify-between mb-12">
            <p className="text-[11px] text-[#b0b0b0] font-light pt-1">{dateStr}</p>

            {/* Name + role */}
            <div className="text-right">
              {editName ? (
                <input
                  autoFocus
                  value={name}
                  onChange={e => { setName(e.target.value); sv(LS_NAME, e.target.value) }}
                  onBlur={() => setEditName(false)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditName(false) }}
                  className="text-[28px] font-light tracking-tight text-[#1d1d1f] outline-none border-b border-[#c0c0c0] text-right bg-transparent w-72"
                />
              ) : (
                <button onClick={() => setEditName(true)} className="group flex items-center gap-2 justify-end w-full">
                  <h1 className="text-[28px] font-light tracking-tight text-[#1d1d1f] leading-none">{name}</h1>
                  <Pencil size={11} className="text-[#c0c0c0] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              {editRole ? (
                <input
                  autoFocus
                  value={role}
                  onChange={e => { setRole(e.target.value); sv(LS_ROLE, e.target.value) }}
                  onBlur={() => setEditRole(false)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditRole(false) }}
                  className="text-[12px] text-[#7a7a7a] outline-none border-b border-[#e0e0e0] text-right bg-transparent w-64 mt-1"
                />
              ) : (
                <button onClick={() => setEditRole(true)} className="group flex items-center gap-1.5 justify-end w-full mt-1">
                  <span className="text-[12px] text-[#7a7a7a]">{role}</span>
                  <Pencil size={9} className="text-[#c0c0c0] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>

          {/* Sections grid — 3 columns (scroll-only entries like Tasks are excluded) */}
          <div className="grid grid-cols-3 gap-x-8 gap-y-12">
            {SECTIONS.filter(s => s.scrollTo === null).map(s => (
              <div key={s.num} className="group flex flex-col gap-3">
                <div className="border-t border-[#e8e8e8] pt-3">
                  <span className="text-[11px] text-[#b0b0b0] font-light">{s.num}</span>
                </div>

                <ImageUploadSlot
                  storageKey={`workspace:home-img-${s.id}`}
                  aspect="4/3"
                  className="w-full hover:opacity-90 transition-opacity"
                />

                <button
                  onClick={() => navigate(s.id!)}
                  className="text-[13px] font-semibold text-[#1d1d1f] hover:underline text-left"
                >
                  {s.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      </div>{/* end flex row */}

      {/* Tasks — truly full width, outside the sidebar+grid flex row */}
      <div id="home-tasks" className="border-t border-[#e8e8e8] px-10 pt-12 pb-24">
        <h2 className="text-[22px] font-bold text-[#5a5a5a] tracking-tight mb-10">Tasks</h2>
        <TasksContent />
      </div>

    </div>
  )
}
