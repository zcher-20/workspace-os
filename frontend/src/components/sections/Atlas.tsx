import { useState, useEffect, useRef, useMemo } from "react"
import { ZoomIn, ZoomOut, Maximize2, ArrowRight, Tag, Type, SlidersHorizontal, Layers, Trash2, X } from "lucide-react"

// ── Colour palette ──────────────────────────────────────────────
const TYPE_PALETTE: Record<string, { fill: string; stroke: string; text: string; dot: string }> = {
  person:       { fill: "#f0eaea", stroke: "#c9a8a8", text: "#6b2e2e", dot: "#8b3a3a" },
  opportunity:  { fill: "#ece8e4", stroke: "#c4b8ad", text: "#5a4030", dot: "#7a5540" },
  project:      { fill: "#eae8ed", stroke: "#b8b0c4", text: "#3d3455", dot: "#524470" },
  organization: { fill: "#e8ecec", stroke: "#a8bcbc", text: "#2e4848", dot: "#3d6060" },
  event:        { fill: "#ece8ea", stroke: "#c4adb5", text: "#55303a", dot: "#723048" },
  idea:         { fill: "#eeebe6", stroke: "#c8bfb0", text: "#4a4030", dot: "#685840" },
  note:         { fill: "#eaeaea", stroke: "#bebebe", text: "#404040", dot: "#606060" },
}
const FALLBACK = { fill: "#eaeaea", stroke: "#bebebe", text: "#404040", dot: "#606060" }
function pal(type: string) { return TYPE_PALETTE[type] ?? FALLBACK }

function hexToRgba(hex: string, a: number) {
  const n = hex.replace("#", "")
  const full = n.length === 3 ? n.split("").map(c => c + c).join("") : n
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
function darkenHex(hex: string, amt = 0.35) {
  const n = hex.replace("#", "")
  const full = n.length === 3 ? n.split("").map(c => c + c).join("") : n
  const r = Math.round(parseInt(full.slice(0, 2), 16) * (1 - amt))
  const g = Math.round(parseInt(full.slice(2, 4), 16) * (1 - amt))
  const b = Math.round(parseInt(full.slice(4, 6), 16) * (1 - amt))
  return `rgb(${r},${g},${b})`
}

// ── Persistence ─────────────────────────────────────────────────
const LS_TYPE_CONFIG = "workspace:atlas-type-config"
const LS_CUSTOM      = "workspace:atlas-custom-nodes"
type TypeConfig = { label?: string; color?: string }
function loadTypeConfig(): Record<string, TypeConfig> {
  try { return JSON.parse(localStorage.getItem(LS_TYPE_CONFIG) || "null") ?? {} } catch { return {} }
}

// ── Types ────────────────────────────────────────────────────────
export interface AtlasItem { id: string; title: string; subtitle?: string; objectType: string }
interface AutoNode { id: string; label: string; subtitle: string; type: string; x: number; y: number }
export interface CustomNode {
  id: string; kind: "pill" | "title"; label: string; color: string; x: number; y: number
}

// ── Graph layout — radial dots ───────────────────────────────────
const HUB_CX = 500, HUB_CY = 320

function buildLayout(items: AtlasItem[]): AutoNode[] {
  if (!items.length) return []
  const capped = items.slice(0, 60)
  const total  = capped.length
  const byType: Record<string, AtlasItem[]> = {}
  for (const item of capped) {
    if (!byType[item.objectType]) byType[item.objectType] = []
    byType[item.objectType].push(item)
  }
  const types  = Object.keys(byType)
  const radius = Math.max(160, Math.min(300, (total * 28) / (2 * Math.PI)))
  const GAP    = types.length > 1 ? 0.15 : 0
  const totalArc = 2 * Math.PI - GAP * types.length
  let angle = -Math.PI / 2
  const nodes: AutoNode[] = []
  for (const type of types) {
    const typeItems = byType[type]
    const arc = (typeItems.length / total) * totalArc
    typeItems.forEach((item, i) => {
      const a = angle + ((i + 0.5) / typeItems.length) * arc
      nodes.push({ id: item.id, label: item.title, subtitle: item.subtitle ?? "", type,
        x: HUB_CX + radius * Math.cos(a), y: HUB_CY + radius * Math.sin(a) })
    })
    angle += arc + GAP
  }
  return nodes
}

// ── Navigation ───────────────────────────────────────────────────
const TYPE_SECTION: Record<string, string | null> = {
  person: "people", opportunity: "opportunities",
  project: "projects", idea: "projects",
  organization: "organizations", event: "organizations",
  note: null,
}
const TYPE_SECTION_LABEL: Record<string, string> = {
  person: "People", opportunity: "Opportunities",
  project: "Projects", idea: "Projects",
  organization: "Organizations", event: "Organizations",
}

// ── Helpers ──────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function labelWidth(text: string) { return Math.max(50, text.length * 6.5 + 20) }
const PILL_COLORS = ["#8b3a3a", "#524470", "#3d6060", "#723048", "#685840", "#7a5540"]
function loadCustomNodes(): CustomNode[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || "[]") } catch { return [] }
}
function saveCustomNodes(nodes: CustomNode[]) { localStorage.setItem(LS_CUSTOM, JSON.stringify(nodes)) }

interface HoverCard { node: AutoNode; screenX: number; screenY: number }

// ── Component ────────────────────────────────────────────────────
export default function Atlas({ items = [] }: { items?: AtlasItem[] }) {
  const safeItems = Array.isArray(items) ? items : []

  const initNodes = useMemo(() => buildLayout(safeItems), [safeItems.length])
  const [autoNodes,      setAutoNodes]      = useState<AutoNode[]>(initNodes)
  const [customNodes,    setCustomNodes]    = useState<CustomNode[]>(loadCustomNodes)
  const [zoom,           setZoom]           = useState(1)
  const [pan,            setPan]            = useState({ x: 0, y: 0 })
  const [enabledTypes,   setEnabledTypes]   = useState<Set<string> | null>(null)
  const [hovered,        setHovered]        = useState<string | null>(null)
  const [hoverCard,      setHoverCard]      = useState<HoverCard | null>(null)
  const [dragging,       setDragging]       = useState<{ kind: "auto" | "custom"; id: string; ox: number; oy: number } | null>(null)
  const [isPanning,      setIsPanning]      = useState(false)
  const [typeConfig,     setTypeConfig]     = useState<Record<string, TypeConfig>>(loadTypeConfig)
  const [openPanel,      setOpenPanel]      = useState<"nodes" | "types" | null>(null)
  const [isOverTrash,    setIsOverTrash]    = useState(false)

  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const trashRef     = useRef<HTMLDivElement>(null)
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panning      = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const customRef    = useRef<CustomNode[]>(customNodes)
  useEffect(() => { customRef.current = customNodes }, [customNodes])

  useEffect(() => { setAutoNodes(buildLayout(safeItems)) }, [items.length])

  // Center hub in viewport on mount
  useEffect(() => {
    if (!svgRef.current) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    if (width > 0 && height > 0) {
      setPan({ x: width / 2 - HUB_CX * zoom, y: height / 2 - HUB_CY * zoom })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allTypes = useMemo(() => [...new Set(autoNodes.map(n => n.type))], [autoNodes])
  const visibleIds = useMemo(() => new Set(
    autoNodes.filter(n => !enabledTypes || enabledTypes.has(n.type)).map(n => n.id)
  ), [autoNodes, enabledTypes])

  // ── Type config ──────────────────────────────────────────────
  function updateTypeConfig(t: string, patch: Partial<TypeConfig>) {
    setTypeConfig(prev => {
      const next = { ...prev, [t]: { ...prev[t], ...patch } }
      localStorage.setItem(LS_TYPE_CONFIG, JSON.stringify(next))
      return next
    })
  }
  function getTypePal(t: string) {
    const custom = typeConfig[t]?.color
    if (!custom) return pal(t)
    return { dot: custom, fill: hexToRgba(custom, 0.15), stroke: hexToRgba(custom, 0.5), text: darkenHex(custom, 0.35) }
  }
  function getTypeLabel(t: string) { return typeConfig[t]?.label || t }
  function toggleType(t: string) {
    setEnabledTypes(prev => {
      const base = prev ?? new Set(allTypes)
      const next = new Set(base)
      next.has(t) ? next.delete(t) : next.add(t)
      return next.size === allTypes.length ? null : next
    })
  }

  // ── Custom node management ───────────────────────────────────
  function mutateCN(next: CustomNode[]) { setCustomNodes(next); saveCustomNodes(next) }
  function addPill() {
    const color = PILL_COLORS[customNodes.length % PILL_COLORS.length]
    mutateCN([...customNodes, {
      id: uid(), kind: "pill", label: "Label", color,
      x: HUB_CX + (Math.random() - 0.5) * 120, y: HUB_CY + (Math.random() - 0.5) * 80,
    }])
  }
  function addTitle() {
    mutateCN([...customNodes, {
      id: uid(), kind: "title", label: "Title", color: "#1d1d1f",
      x: HUB_CX + (Math.random() - 0.5) * 160, y: HUB_CY + (Math.random() - 0.5) * 100,
    }])
  }
  function updateCN(id: string, patch: Partial<CustomNode>) {
    mutateCN(customNodes.map(n => n.id === id ? { ...n, ...patch } : n))
  }
  function removeCN(id: string) { mutateCN(customNodes.filter(n => n.id !== id)) }

  // ── Drag ─────────────────────────────────────────────────────
  function onAutoNodeDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const n = autoNodes.find(n => n.id === id)!
    setDragging({ kind: "auto", id, ox: (e.clientX - rect.left) / zoom - pan.x - n.x, oy: (e.clientY - rect.top) / zoom - pan.y - n.y })
  }
  function onCustomNodeDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const n = customNodes.find(n => n.id === id)!
    setDragging({ kind: "custom", id, ox: (e.clientX - rect.left) / zoom - pan.x - n.x, oy: (e.clientY - rect.top) / zoom - pan.y - n.y })
  }
  function onCanvasDown(e: React.MouseEvent) {
    if (dragging) return
    setOpenPanel(null)
    panning.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }
  function onSvgMove(e: React.MouseEvent) {
    if (dragging && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom - pan.x - dragging.ox
      const y = (e.clientY - rect.top) / zoom - pan.y - dragging.oy
      if (dragging.kind === "auto") {
        setAutoNodes(ns => ns.map(n => n.id === dragging.id ? { ...n, x, y } : n))
      } else {
        setCustomNodes(cn => cn.map(n => n.id === dragging.id ? { ...n, x, y } : n))
      }
      // Check if over trash
      if (trashRef.current) {
        const r = trashRef.current.getBoundingClientRect()
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (over !== isOverTrash) setIsOverTrash(over)
      }
      return
    }
    if (panning.current) {
      const dx = (e.clientX - panning.current.startX) / zoom
      const dy = (e.clientY - panning.current.startY) / zoom
      setPan({ x: panning.current.panX + dx, y: panning.current.panY + dy })
    }
  }
  function onSvgUp() {
    if (dragging && isOverTrash) {
      if (dragging.kind === "custom") removeCN(dragging.id)
      else setAutoNodes(ns => ns.filter(n => n.id !== dragging.id))
    } else if (dragging?.kind === "custom") {
      saveCustomNodes(customRef.current)
    }
    setDragging(null); panning.current = null; setIsPanning(false); setIsOverTrash(false)
  }

  // ── Hover card ───────────────────────────────────────────────
  function showCard(node: AutoNode, e: React.MouseEvent) {
    clearTimeout(hideTimer.current)
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setHoverCard({ node, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top })
  }
  function scheduleHide() { hideTimer.current = setTimeout(() => setHoverCard(null), 150) }
  function cancelHide()   { clearTimeout(hideTimer.current) }
  function navigateTo(section: string) {
    window.dispatchEvent(new CustomEvent("workspace:navigate", { detail: section })); setHoverCard(null)
  }

  function togglePanel(p: "nodes" | "types") {
    setOpenPanel(prev => prev === p ? null : p)
  }

  // ── Empty state ──────────────────────────────────────────────
  if (!items.length && customNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a]">
        <div className="text-[40px] mb-3 opacity-20">⬡</div>
        <p className="text-[13px] font-medium text-[#1d1d1f]">Atlas is empty</p>
        <p className="text-[11px] mt-1">Add items to the collection and they'll appear here.</p>
      </div>
    )
  }

  const isDragging = !!dragging

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="relative h-full overflow-hidden">

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomIn  size={12} className="text-[#7a7a7a]" /></button>
        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.25))} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomOut size={12} className="text-[#7a7a7a]" /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><Maximize2 size={12} className="text-[#7a7a7a]" /></button>
      </div>

      {/* SVG canvas */}
      <div ref={containerRef} className="absolute inset-0">
        <svg
          ref={svgRef}
          className="w-full h-full bg-white select-none"
          style={{ cursor: isPanning || dragging ? "grabbing" : "grab" }}
          onMouseDown={onCanvasDown}
          onMouseMove={onSvgMove}
          onMouseUp={onSvgUp}
          onMouseLeave={() => { onSvgUp(); scheduleHide() }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Hub glow + dot */}
            <circle cx={HUB_CX} cy={HUB_CY} r={48} fill="#1d1d1f" fillOpacity={0.025} />
            <circle cx={HUB_CX} cy={HUB_CY} r={22} fill="#1d1d1f" fillOpacity={0.05} />
            <circle cx={HUB_CX} cy={HUB_CY} r={6}  fill="#1d1d1f" fillOpacity={0.82} />

            {/* Spokes */}
            {autoNodes.filter(n => visibleIds.has(n.id)).map(n => {
              const ang = Math.atan2(n.y - HUB_CY, n.x - HUB_CX)
              return (
                <line key={`spoke-${n.id}`}
                  x1={HUB_CX + 7 * Math.cos(ang)} y1={HUB_CY + 7 * Math.sin(ang)}
                  x2={n.x - 5 * Math.cos(ang)}    y2={n.y - 5 * Math.sin(ang)}
                  stroke="#d4d8e4" strokeWidth={0.8 / zoom}
                />
              )
            })}

            {/* Auto-nodes — dots */}
            {autoNodes.map(n => {
              const visible = visibleIds.has(n.id)
              const p   = getTypePal(n.type)
              const isH = hovered === n.id
              const isDraggingThis = dragging?.id === n.id
              return (
                <circle key={n.id} cx={n.x} cy={n.y}
                  r={(isH ? 6 : 4) / zoom}
                  fill={isDraggingThis && isOverTrash ? "#ef4444" : p.dot}
                  fillOpacity={visible ? (isH ? 1 : 0.8) : 0.1}
                  style={{ cursor: "grab", transition: "r 0.12s, fill-opacity 0.12s, fill 0.1s" }}
                  onMouseEnter={e => { setHovered(n.id); showCard(n, e) }}
                  onMouseLeave={() => { setHovered(null); scheduleHide() }}
                  onMouseDown={e => onAutoNodeDown(e, n.id)}
                />
              )
            })}

            {/* Custom nodes — pills + titles */}
            {customNodes.map(cn => {
              const isH = hovered === cn.id
              const isDraggingThis = dragging?.id === cn.id
              const willDelete = isDraggingThis && isOverTrash
              if (cn.kind === "title") {
                return (
                  <text key={cn.id} x={cn.x} y={cn.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={16 / zoom} fontWeight={700}
                    fill={willDelete ? "#ef4444" : cn.color}
                    style={{ cursor: "move", fontFamily: "SF Pro, system-ui, sans-serif",
                             filter: isH ? "drop-shadow(0 1px 4px rgba(0,0,0,0.15))" : "none",
                             transition: "fill 0.1s" }}
                    onMouseEnter={() => setHovered(cn.id)}
                    onMouseLeave={() => setHovered(null)}
                    onMouseDown={e => onCustomNodeDown(e, cn.id)}
                  >
                    {cn.label}
                  </text>
                )
              }
              const w = labelWidth(cn.label), h = 22
              const pillColor = willDelete ? "#ef4444" : cn.color
              return (
                <g key={cn.id} transform={`translate(${cn.x},${cn.y})`}
                  style={{ cursor: "move" }}
                  onMouseEnter={() => setHovered(cn.id)}
                  onMouseLeave={() => setHovered(null)}
                  onMouseDown={e => onCustomNodeDown(e, cn.id)}
                >
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2}
                    fill={hexToRgba(pillColor, 0.15)}
                    stroke={hexToRgba(pillColor, isH ? 0.8 : 0.5)}
                    strokeWidth={isH ? 1.8 / zoom : 1.2 / zoom}
                    style={{ filter: isH ? "drop-shadow(0 2px 8px rgba(0,0,0,0.14))" : "none",
                             transition: "stroke-width 0.1s, fill 0.1s, stroke 0.1s" }}
                  />
                  <text textAnchor="middle" dominantBaseline="middle"
                    fontSize={10 / zoom} fontWeight={600}
                    fill={darkenHex(pillColor, 0.3)}
                    className="pointer-events-none"
                    style={{ fontFamily: "SF Pro, system-ui, sans-serif", transition: "fill 0.1s" }}
                  >
                    {cn.label.length > 22 ? cn.label.slice(0, 20) + "…" : cn.label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Hover card */}
        {hoverCard && (() => {
          const { node: n, screenX, screenY } = hoverCard
          const p = getTypePal(n.type)
          const cardW = 200
          const cw = containerRef.current?.clientWidth ?? 700
          const ch = containerRef.current?.clientHeight ?? 500
          const left = screenX + 16 + cardW > cw ? screenX - cardW - 8 : screenX + 16
          const top  = Math.min(screenY - 10, ch - 110)
          const targetSection = TYPE_SECTION[n.type]
          const targetLabel   = TYPE_SECTION_LABEL[n.type]
          return (
            <div className="absolute z-30 pointer-events-auto"
              style={{ left, top, width: cardW }}
              onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>
              <div className="bg-white rounded-2xl border border-[#e4e4e8] shadow-xl overflow-hidden">
                <div className="h-1" style={{ background: p.dot }} />
                <div className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-2"
                    style={{ background: p.fill, color: p.text, border: `1px solid ${p.stroke}` }}>
                    {getTypeLabel(n.type)}
                  </span>
                  <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug">{n.label}</p>
                  {n.subtitle && <p className="text-[11px] text-[#7a7a7a] mt-0.5 line-clamp-2">{n.subtitle}</p>}
                  {targetSection && (
                    <button onClick={() => navigateTo(targetSection)}
                      className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity"
                      style={{ color: p.text }}>
                      View in {targetLabel} <ArrowRight size={10} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Trash zone — bottom right ─────────────────────────────── */}
      <div
        ref={trashRef}
        className="absolute bottom-4 right-4 z-20 pointer-events-none"
        style={{ transition: "opacity 0.15s" }}
      >
        <div className={[
          "p-2.5 rounded-xl border transition-all duration-150",
          isDragging
            ? isOverTrash
              ? "border-red-400 bg-red-50 scale-110 shadow-lg shadow-red-100"
              : "border-[#ddd] bg-white/90 shadow"
            : "border-transparent bg-transparent"
        ].join(" ")}>
          <Trash2
            size={15}
            className={[
              "transition-colors duration-150",
              isDragging
                ? isOverTrash ? "text-red-500" : "text-[#c0c0c0]"
                : "text-[#d8d8d8]"
            ].join(" ")}
          />
        </div>
      </div>

      {/* ── Floating bottom bar ───────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">

        {/* Nodes panel */}
        {openPanel === "nodes" && customNodes.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#e4e4e8] shadow-xl px-3 py-3 min-w-[200px] max-w-[240px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#b0b0b0] mb-2 px-1">Your nodes</p>
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {customNodes.map(cn => (
                <div key={cn.id} className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-[#f8f8f8] group/cn">
                  {cn.kind === "pill" ? (
                    <label className="relative w-3 h-3 shrink-0 cursor-pointer">
                      <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: cn.color }} />
                      <input type="color" value={cn.color}
                        onChange={e => updateCN(cn.id, { color: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </label>
                  ) : (
                    <Type size={10} className="text-[#7a7a7a] shrink-0" />
                  )}
                  <input
                    value={cn.label}
                    onChange={e => updateCN(cn.id, { label: e.target.value })}
                    className="flex-1 min-w-0 text-[12px] text-[#1d1d1f] bg-transparent outline-none border-b border-transparent focus:border-[#d0d0d0] transition-colors"
                  />
                  <button onClick={() => removeCN(cn.id)}
                    className="opacity-0 group-hover/cn:opacity-100 transition-opacity shrink-0">
                    <X size={11} className="text-[#c0c0c0] hover:text-[#1d1d1f]" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Types panel */}
        {openPanel === "types" && (
          <div className="bg-white rounded-2xl border border-[#e4e4e8] shadow-xl px-3 py-3 min-w-[200px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#b0b0b0] mb-2 px-1">Type settings</p>
            <div className="flex flex-col gap-1">
              {allTypes.map(t => {
                const p  = getTypePal(t)
                const on = !enabledTypes || enabledTypes.has(t)
                return (
                  <div key={t} className="flex items-center gap-2 px-1 py-0.5">
                    <button onClick={() => toggleType(t)}
                      className="w-3 h-3 rounded-full shrink-0 border-2 transition-all"
                      style={{ background: on ? p.dot : "transparent", borderColor: p.dot }} />
                    <label className="relative w-3 h-3 shrink-0 cursor-pointer">
                      <div className="absolute inset-0 rounded-sm pointer-events-none border border-[#e0e0e0]" style={{ background: typeConfig[t]?.color ?? pal(t).dot }} />
                      <input type="color" value={typeConfig[t]?.color ?? pal(t).dot}
                        onChange={e => updateTypeConfig(t, { color: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </label>
                    <input value={getTypeLabel(t)}
                      onChange={e => updateTypeConfig(t, { label: e.target.value })}
                      className="flex-1 min-w-0 text-[12px] text-[#1d1d1f] bg-transparent outline-none border-b border-transparent focus:border-[#d0d0d0]"
                    />
                  </div>
                )
              })}
              {enabledTypes && (
                <button onClick={() => setEnabledTypes(null)}
                  className="mt-1 px-1 text-[10px] text-[#7a7a7a] hover:text-[#1d1d1f] text-left transition-colors">
                  Show all
                </button>
              )}
              <p className="mt-1 px-1 text-[10px] text-[#c0c0c0]">{autoNodes.length} items</p>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur border border-[#e4e4e8] rounded-2xl shadow-lg px-2.5 py-2">

          {/* Add pill */}
          <button onClick={addPill} title="Add pill label"
            className="p-1.5 rounded-lg hover:bg-[#f0f0f0] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
            <Tag size={14} />
          </button>

          {/* Add title */}
          <button onClick={addTitle} title="Add title text"
            className="p-1.5 rounded-lg hover:bg-[#f0f0f0] text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
            <Type size={14} />
          </button>

          {/* Divider */}
          {allTypes.length > 0 && <div className="w-px h-4 bg-[#ebebeb] mx-0.5" />}

          {/* Type filter dots */}
          {allTypes.map(t => {
            const p  = getTypePal(t)
            const on = !enabledTypes || enabledTypes.has(t)
            return (
              <button key={t} title={getTypeLabel(t)} onClick={() => toggleType(t)}
                className="w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:bg-[#f0f0f0]"
                style={{ opacity: on ? 1 : 0.25 }}>
                <div className="w-3 h-3 rounded-full" style={{ background: p.dot }} />
              </button>
            )
          })}

          {/* Divider */}
          <div className="w-px h-4 bg-[#ebebeb] mx-0.5" />

          {/* My nodes */}
          {customNodes.length > 0 && (
            <button onClick={() => togglePanel("nodes")} title="Manage nodes"
              className={[
                "p-1.5 rounded-lg transition-colors",
                openPanel === "nodes" ? "bg-[#f0f0f0] text-[#1d1d1f]" : "text-[#7a7a7a] hover:bg-[#f0f0f0] hover:text-[#1d1d1f]"
              ].join(" ")}>
              <Layers size={14} />
            </button>
          )}

          {/* Type settings */}
          <button onClick={() => togglePanel("types")} title="Type settings"
            className={[
              "p-1.5 rounded-lg transition-colors",
              openPanel === "types" ? "bg-[#f0f0f0] text-[#1d1d1f]" : "text-[#7a7a7a] hover:bg-[#f0f0f0] hover:text-[#1d1d1f]"
            ].join(" ")}>
            <SlidersHorizontal size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
