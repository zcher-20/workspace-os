import { useState, useEffect, useRef, useMemo } from "react"
import { ZoomIn, ZoomOut, Maximize2, Search } from "lucide-react"

const TYPE_COLORS: Record<string, string> = {
  person:       "#4f7ab3",
  opportunity:  "#5b9b8a",
  project:      "#c4856a",
  organization: "#6b7fa8",
  event:        "#b8769a",
  idea:         "#9a8b6e",
  note:         "#7a7a7a",
}

interface Node {
  id: string
  label: string
  type: string
  x: number
  y: number
  vx: number
  vy: number
}

interface Edge {
  source: string
  target: string
  label: string
}

export interface AtlasItem {
  id: string
  title: string
  objectType: string
}

function buildGraph(items: AtlasItem[]) {
  if (items.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] }
  const cx = 400, cy = 300, radius = 180
  const nodes: Node[] = items.slice(0, 40).map((item, i) => {
    const angle = (i / Math.min(items.length, 40)) * 2 * Math.PI
    return {
      id: item.id,
      label: item.title,
      type: item.objectType,
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 60,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 60,
      vx: 0, vy: 0,
    }
  })
  const edges: Edge[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].type === nodes[j].type && Math.random() < 0.3) {
        edges.push({ source: nodes[i].id, target: nodes[j].id, label: "related" })
      } else if (Math.random() < 0.08) {
        edges.push({ source: nodes[i].id, target: nodes[j].id, label: "linked" })
      }
    }
  }
  return { nodes, edges }
}

interface AtlasProps {
  items: AtlasItem[]
}

export default function Atlas({ items }: AtlasProps) {
  const { nodes: initNodes, edges } = useMemo(() => buildGraph(items), [items.length])

  const [nodes, setNodes] = useState<Node[]>(initNodes)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [search, setSearch] = useState("")
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const animRef = useRef<number>()

  // Re-sync nodes when items change
  useEffect(() => {
    const { nodes: fresh, edges: freshEdges } = buildGraph(items)
    setNodes(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return
    let localNodes = nodes.map(n => ({ ...n }))
    let frame = 0

    function tick() {
      if (frame > 120) return
      frame++
      const cx = 400, cy = 300
      for (const n of localNodes) {
        n.vx += (cx - n.x) * 0.002
        n.vy += (cy - n.y) * 0.002
        for (const m of localNodes) {
          if (m.id === n.id) continue
          const dx = n.x - m.x, dy = n.y - m.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          n.vx += (dx / dist) * (800 / (dist * dist))
          n.vy += (dy / dist) * (800 / (dist * dist))
        }
        for (const e of edges) {
          const other = e.source === n.id ? localNodes.find(m => m.id === e.target)
                      : e.target === n.id ? localNodes.find(m => m.id === e.source)
                      : null
          if (!other) continue
          const dx = other.x - n.x, dy = other.y - n.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          n.vx += (dx / dist) * 0.4
          n.vy += (dy / dist) * 0.4
        }
        n.vx *= 0.8; n.vy *= 0.8
        n.x += n.vx; n.y += n.vy
      }
      setNodes(localNodes.map(n => ({ ...n })))
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [initNodes.length])

  const types = [...new Set(nodes.map(n => n.type))]

  const visibleIds = useMemo(() => {
    const q = search.toLowerCase()
    return new Set(nodes
      .filter(n => (!selectedType || n.type === selectedType) && (!q || n.label.toLowerCase().includes(q)))
      .map(n => n.id))
  }, [nodes, search, selectedType])

  function handleNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const node = nodes.find(n => n.id === id)!
    setDragging({ id, ox: (e.clientX - rect.left) / zoom - pan.x - node.x, oy: (e.clientY - rect.top) / zoom - pan.y - node.y })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom - pan.x - dragging.ox
    const y = (e.clientY - rect.top) / zoom - pan.y - dragging.oy
    setNodes(ns => ns.map(n => n.id === dragging.id ? { ...n, x, y, vx: 0, vy: 0 } : n))
  }

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-[#7a7a7a]">
        <div className="text-[40px] mb-3 opacity-20">⬡</div>
        <p className="text-[13px] font-medium text-[#1d1d1f]">Atlas is empty</p>
        <p className="text-[11px] mt-1">Add items to the collection and they'll appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e0e0e0] bg-white shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#7a7a7a]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-6 pr-2 py-1 text-[11px] rounded border border-[#e0e0e0] bg-[#f8f8f8] focus:outline-none focus:ring-1 focus:ring-[#2c4470]/30 w-32"
          />
        </div>
        <div className="flex flex-wrap gap-1 flex-1">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setSelectedType(selectedType === t ? null : t)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors"
              style={selectedType === t
                ? { background: TYPE_COLORS[t] + "22", color: TYPE_COLORS[t], borderColor: TYPE_COLORS[t] }
                : { borderColor: "#e0e0e0", color: "#7a7a7a" }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 rounded border border-[#e0e0e0] bg-white hover:bg-[#f5f5f7]"><ZoomIn size={11} className="text-[#7a7a7a]" /></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.25))} className="p-1 rounded border border-[#e0e0e0] bg-white hover:bg-[#f5f5f7]"><ZoomOut size={11} className="text-[#7a7a7a]" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-1 rounded border border-[#e0e0e0] bg-white hover:bg-[#f5f5f7]"><Maximize2 size={11} className="text-[#7a7a7a]" /></button>
        </div>
      </div>

      {/* Graph */}
      <svg
        ref={svgRef}
        className="flex-1 bg-[#fafafa] cursor-default select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {edges.map((e, i) => {
            const s = nodeMap[e.source], t = nodeMap[e.target]
            if (!s || !t) return null
            const sVis = visibleIds.has(s.id), tVis = visibleIds.has(t.id)
            if (!sVis && !tVis) return null
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#e0e0e0" strokeWidth={1 / zoom} opacity={sVis && tVis ? 0.8 : 0.2} />
          })}
          {nodes.map(n => {
            const visible = visibleIds.has(n.id)
            const color = TYPE_COLORS[n.type] || "#7a7a7a"
            const isHovered = hovered === n.id
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ opacity: visible ? 1 : 0.12 }}>
                <circle
                  r={isHovered ? 9 : 6}
                  fill={color} fillOpacity={0.15}
                  stroke={color} strokeWidth={isHovered ? 2 : 1.5}
                  className="cursor-grab active:cursor-grabbing transition-all"
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onMouseDown={e => handleNodeMouseDown(e, n.id)}
                />
                {(isHovered || zoom > 1.4) && (
                  <text y={-11} textAnchor="middle" fontSize={9 / zoom} fill="#1d1d1f" className="pointer-events-none">
                    {n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#e0e0e0] bg-white shrink-0">
        {types.map(t => (
          <div key={t} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] || "#7a7a7a" }} />
            <span className="text-[10px] text-[#7a7a7a] capitalize">{t}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-[#c0c0c0]">{nodes.length} nodes</span>
      </div>
    </div>
  )
}
