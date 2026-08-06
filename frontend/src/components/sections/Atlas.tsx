import { useState, useEffect, useRef, useMemo } from "react"
import { Filter, ZoomIn, ZoomOut, Maximize2, ArrowRight, Check } from "lucide-react"

// ── Colour palette ──────────────────────────────────────────────
const TYPE_PALETTE: Record<string, { fill: string; stroke: string; text: string; dot: string }> = {
  person:       { fill: "#dce8f5", stroke: "#a8c4e0", text: "#2c5f8a", dot: "#4f7ab3" },
  opportunity:  { fill: "#d6f0e6", stroke: "#9dd4bc", text: "#2a7a56", dot: "#3fa876" },
  project:      { fill: "#fce8de", stroke: "#e8bba8", text: "#a0522d", dot: "#c4856a" },
  organization: { fill: "#dde2f5", stroke: "#a8b4e0", text: "#3a4d96", dot: "#6b7fa8" },
  event:        { fill: "#f5dff0", stroke: "#dba8d0", text: "#8a3a76", dot: "#b8769a" },
  idea:         { fill: "#ede8d8", stroke: "#cfc4a0", text: "#6e5c2e", dot: "#9a8b6e" },
  note:         { fill: "#e8e8e8", stroke: "#c8c8c8", text: "#5a5a5a", dot: "#8a8a8a" },
}

const FALLBACK = { fill: "#e8e8e8", stroke: "#c8c8c8", text: "#5a5a5a", dot: "#8a8a8a" }

function pal(type: string) { return TYPE_PALETTE[type] ?? FALLBACK }

// ── Types ────────────────────────────────────────────────────────
export interface AtlasItem {
  id: string
  title: string
  subtitle?: string
  objectType: string
}

interface Node {
  id: string
  label: string
  subtitle: string
  type: string
  x: number
  y: number
  vx: number
  vy: number
  connections: number   // edge count, determines size
}

interface Edge { source: string; target: string }

// ── Graph builder ────────────────────────────────────────────────
function buildGraph(items: AtlasItem[]) {
  if (!items.length) return { nodes: [] as Node[], edges: [] as Edge[] }

  const cx = 500, cy = 320, radius = 220
  const nodes: Node[] = items.slice(0, 50).map((item, i) => {
    const angle = (i / Math.min(items.length, 50)) * 2 * Math.PI
    return {
      id: item.id,
      label: item.title,
      subtitle: item.subtitle ?? "",
      type: item.objectType,
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 80,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 80,
      vx: 0, vy: 0,
      connections: 0,
    }
  })

  const edges: Edge[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sameType = nodes[i].type === nodes[j].type
      if ((sameType && Math.random() < 0.28) || (!sameType && Math.random() < 0.07)) {
        edges.push({ source: nodes[i].id, target: nodes[j].id })
        nodes[i].connections++
        nodes[j].connections++
      }
    }
  }

  return { nodes, edges }
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

// ── Node sizing ──────────────────────────────────────────────────
function nodeRadius(connections: number) {
  if (connections >= 5) return 10
  if (connections >= 3) return 7
  if (connections >= 1) return 5
  return 3.5
}

function showLabel(connections: number) { return connections >= 3 }

// Approx text width for SVG rect sizing
function labelWidth(text: string) { return Math.max(60, text.length * 6.5 + 20) }

// ── Component ────────────────────────────────────────────────────
interface HoverCard { node: Node; screenX: number; screenY: number }

export default function Atlas({ items = [] }: { items?: AtlasItem[] }) {
  const safeItems = Array.isArray(items) ? items : []
  const { nodes: initNodes, edges } = useMemo(() => buildGraph(safeItems), [safeItems.length])

  const [nodes, setNodes]               = useState<Node[]>(initNodes)
  const [zoom, setZoom]                 = useState(1)
  const [pan, setPan]                   = useState({ x: 0, y: 0 })
  const [enabledTypes, setEnabledTypes] = useState<Set<string> | null>(null) // null = all
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const [hovered, setHovered]           = useState<string | null>(null)
  const [hoverCard, setHoverCard]       = useState<HoverCard | null>(null)
  const [dragging, setDragging]         = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [isPanning, setIsPanning]       = useState(false)
  const panning = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef      = useRef<number>()
  const hideTimer    = useRef<ReturnType<typeof setTimeout>>()

  // Re-init when item count changes
  useEffect(() => {
    const { nodes: fresh } = buildGraph(safeItems)
    setNodes(fresh)
  }, [items.length])

  // Force simulation
  useEffect(() => {
    if (!nodes.length) return
    let local = nodes.map(n => ({ ...n }))
    let frame = 0
    function tick() {
      if (frame++ > 150) return
      const cx = 500, cy = 320
      for (const n of local) {
        // Gravity to center
        n.vx += (cx - n.x) * 0.0018
        n.vy += (cy - n.y) * 0.0018
        // Repulsion
        for (const m of local) {
          if (m.id === n.id) continue
          const dx = n.x - m.x, dy = n.y - m.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = 900 / (d * d)
          n.vx += (dx / d) * f
          n.vy += (dy / d) * f
        }
        // Spring along edges
        for (const e of edges) {
          const other = e.source === n.id ? local.find(m => m.id === e.target)
                      : e.target === n.id ? local.find(m => m.id === e.source)
                      : null
          if (!other) continue
          const dx = other.x - n.x, dy = other.y - n.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          n.vx += (dx / d) * 0.35
          n.vy += (dy / d) * 0.35
        }
        n.vx *= 0.78; n.vy *= 0.78
        n.x += n.vx;  n.y += n.vy
      }
      setNodes(local.map(n => ({ ...n })))
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [initNodes.length])

  const allTypes = useMemo(() => [...new Set(nodes.map(n => n.type))], [nodes])
  const nodeMap  = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  const visibleIds = useMemo(() => new Set(
    nodes.filter(n => !enabledTypes || enabledTypes.has(n.type)).map(n => n.id)
  ), [nodes, enabledTypes])

  function toggleType(t: string) {
    setEnabledTypes(prev => {
      const base = prev ?? new Set(allTypes)
      const next = new Set(base)
      next.has(t) ? next.delete(t) : next.add(t)
      return next.size === allTypes.length ? null : next // null = all on
    })
  }

  // Node drag
  function onNodeDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const n = nodes.find(n => n.id === id)!
    setDragging({ id, ox: (e.clientX - rect.left) / zoom - pan.x - n.x, oy: (e.clientY - rect.top) / zoom - pan.y - n.y })
  }

  // Canvas pan start (background click)
  function onCanvasDown(e: React.MouseEvent) {
    if (dragging) return
    panning.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }

  function onSvgMove(e: React.MouseEvent) {
    if (dragging && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom - pan.x - dragging.ox
      const y = (e.clientY - rect.top) / zoom - pan.y - dragging.oy
      setNodes(ns => ns.map(n => n.id === dragging.id ? { ...n, x, y, vx: 0, vy: 0 } : n))
      return
    }
    if (panning.current) {
      const dx = (e.clientX - panning.current.startX) / zoom
      const dy = (e.clientY - panning.current.startY) / zoom
      setPan({ x: panning.current.panX + dx, y: panning.current.panY + dy })
    }
  }

  function onSvgUp() {
    setDragging(null)
    panning.current = null
    setIsPanning(false)
  }

  // Hover card
  function showCard(node: Node, e: React.MouseEvent) {
    clearTimeout(hideTimer.current)
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setHoverCard({ node, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top })
  }

  function scheduleHide() { hideTimer.current = setTimeout(() => setHoverCard(null), 150) }
  function cancelHide()   { clearTimeout(hideTimer.current) }

  function navigateTo(section: string) {
    window.dispatchEvent(new CustomEvent("workspace:navigate", { detail: section }))
    setHoverCard(null)
  }

  // ── Empty state ─────────────────────────────────────────────────
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a]">
        <div className="text-[40px] mb-3 opacity-20">⬡</div>
        <p className="text-[13px] font-medium text-[#1d1d1f]">Atlas is empty</p>
        <p className="text-[11px] mt-1">Add items to the collection and they'll appear here.</p>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full relative">

      {/* ── Floating filters button ── */}
      <div className="absolute top-3 left-3 z-10">
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-[#e0e0e0] shadow-sm text-[12px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
        >
          <Filter size={12} className="text-[#7a7a7a]" /> Filters
        </button>

        {filtersOpen && (
          <div className="mt-1.5 bg-white rounded-xl border border-[#e0e0e0] shadow-lg p-3 min-w-[160px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a7a] mb-2">Show types</p>
            <div className="flex flex-col gap-1.5">
              {allTypes.map(t => {
                const p = pal(t)
                const on = !enabledTypes || enabledTypes.has(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[#f5f5f7] transition-colors text-left"
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center border" style={{ background: on ? p.fill : "white", borderColor: p.stroke }}>
                      {on && <Check size={9} style={{ color: p.text }} strokeWidth={3} />}
                    </div>
                    <div className="w-2 h-2 rounded-full" style={{ background: p.dot }} />
                    <span className="text-[12px] text-[#1d1d1f] capitalize">{t}</span>
                  </button>
                )
              })}
            </div>
            {enabledTypes && (
              <button onClick={() => setEnabledTypes(null)} className="mt-2 w-full text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] text-center transition-colors">
                Show all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Zoom controls ── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomIn size={12} className="text-[#7a7a7a]" /></button>
        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.25))} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><ZoomOut size={12} className="text-[#7a7a7a]" /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-1.5 rounded-lg bg-white border border-[#e0e0e0] shadow-sm hover:bg-[#f5f5f7]"><Maximize2 size={12} className="text-[#7a7a7a]" /></button>
      </div>

      {/* ── Graph canvas + hover card ── */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden" onClick={() => setFiltersOpen(false)}>
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

            {/* Edges */}
            {edges.map((e, i) => {
              const s = nodeMap[e.source], t = nodeMap[e.target]
              if (!s || !t) return null
              const sV = visibleIds.has(s.id), tV = visibleIds.has(t.id)
              if (!sV && !tV) return null
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="#d8dce8"
                  strokeWidth={0.8 / zoom}
                  opacity={sV && tV ? 1 : 0.15}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const visible = visibleIds.has(n.id)
              const p   = pal(n.type)
              const r   = nodeRadius(n.connections)
              const big = showLabel(n.connections)
              const isH = hovered === n.id

              if (big) {
                // Label chip node
                const txt   = n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label
                const w     = labelWidth(txt)
                const h     = 22
                const scale = isH ? 1.06 : 1

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y}) scale(${scale})`}
                    style={{ opacity: visible ? 1 : 0.1, cursor: "pointer", transformOrigin: "0 0" }}
                    onMouseEnter={e => { setHovered(n.id); showCard(n, e) }}
                    onMouseLeave={() => { setHovered(null); scheduleHide() }}
                    onMouseDown={e => onNodeDown(e, n.id)}
                  >
                    <rect
                      x={-w / 2} y={-h / 2} width={w} height={h}
                      rx={h / 2}
                      fill={p.fill}
                      stroke={isH ? p.stroke : p.stroke}
                      strokeWidth={isH ? 1.5 / zoom : 1 / zoom}
                      style={{ filter: isH ? "drop-shadow(0 2px 6px rgba(0,0,0,0.12))" : "none" }}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10 / zoom}
                      fontWeight={500}
                      fill={p.text}
                      className="pointer-events-none"
                      style={{ fontFamily: "SF Pro, system-ui, sans-serif" }}
                    >
                      {txt}
                    </text>
                  </g>
                )
              }

              // Dot node
              return (
                <circle
                  key={n.id}
                  cx={n.x} cy={n.y}
                  r={isH ? r * 1.5 : r}
                  fill={p.dot}
                  fillOpacity={visible ? (isH ? 0.9 : 0.75) : 0.1}
                  style={{ cursor: "pointer", transition: "r 0.15s, fill-opacity 0.15s" }}
                  onMouseEnter={e => { setHovered(n.id); showCard(n, e) }}
                  onMouseLeave={() => { setHovered(null); scheduleHide() }}
                  onMouseDown={e => onNodeDown(e, n.id)}
                />
              )
            })}
          </g>
        </svg>

        {/* ── Hover card ── */}
        {hoverCard && (() => {
          const { node: n, screenX, screenY } = hoverCard
          const p = pal(n.type)
          const targetSection = TYPE_SECTION[n.type]
          const targetLabel   = TYPE_SECTION_LABEL[n.type]
          const cardW = 210

          const cw = containerRef.current?.clientWidth ?? 700
          const ch = containerRef.current?.clientHeight ?? 500
          const left = screenX + 16 + cardW > cw ? screenX - cardW - 8 : screenX + 16
          const top  = Math.min(screenY - 10, ch - 120)

          return (
            <div
              className="absolute z-30 pointer-events-auto"
              style={{ left, top, width: cardW }}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
            >
              <div className="bg-white rounded-2xl border border-[#e4e4e8] shadow-xl overflow-hidden">
                {/* Colour header stripe */}
                <div className="h-1.5" style={{ background: p.dot }} />

                <div className="px-4 py-3">
                  {/* Type chip */}
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-2"
                    style={{ background: p.fill, color: p.text, border: `1px solid ${p.stroke}` }}
                  >
                    {n.type}
                  </span>

                  {/* Title */}
                  <p className="text-[13px] font-semibold text-[#1d1d1f] leading-snug">
                    {n.label}
                  </p>

                  {/* Subtitle */}
                  {n.subtitle && (
                    <p className="text-[11px] text-[#7a7a7a] mt-0.5 line-clamp-2">{n.subtitle}</p>
                  )}

                  {/* Connections */}
                  <p className="text-[10px] text-[#b0b0b0] mt-1.5">
                    {n.connections} connection{n.connections !== 1 ? "s" : ""}
                  </p>

                  {/* Nav link */}
                  {targetSection && (
                    <button
                      onClick={() => navigateTo(targetSection)}
                      className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-70"
                      style={{ color: p.text }}
                    >
                      View in {targetLabel} <ArrowRight size={10} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Bottom legend ── */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-[#f0f0f0] bg-white shrink-0">
        {allTypes.map(t => {
          const p = pal(t)
          const on = !enabledTypes || enabledTypes.has(t)
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: on ? 1 : 0.35 }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.dot }} />
              <span className="text-[10px] text-[#7a7a7a] capitalize">{t}</span>
            </button>
          )
        })}
        <span className="ml-auto text-[10px] text-[#c0c0c0]">{nodes.length} nodes · {edges.length} edges</span>
      </div>
    </div>
  )
}
