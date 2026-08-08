import { useState, useRef, useEffect } from "react"
import { Plus, X, Pencil, Check, ExternalLink, GripVertical, ChevronDown, ChevronRight, Send, Square, ArrowUpRight, RotateCcw } from "lucide-react"
import { useSSEChat } from "@/hooks/useSSEChat"

// ── Types ─────────────────────────────────────────────────────────────

type CourseStatus = "planned" | "in-progress" | "completed" | "dropped"

interface Course {
  id: string
  code: string
  name: string
  credits: number
  status: CourseStatus
  grade?: string
  professor?: string
  location?: string
  days?: string
  startTime?: string
  endTime?: string
  color?: string
  semesterId: string
  createdAt?: string
}

interface Semester {
  id: string
  label: string
  order: number
}

interface CalBlock {
  id: string
  title: string
  days: string   // space-separated: "Mon Wed Fri"
  start: number  // decimal hour e.g. 9.5 = 9:30am
  end: number
  color: string
  location?: string
}

interface CheckItem {
  id: string
  text: string
  checked: boolean
}

// ── Storage keys ──────────────────────────────────────────────────────

const LS_COURSES   = "workspace:degree-courses-v5"
const LS_SEMESTERS = "workspace:degree-semesters-v5"
const LS_MAJOR     = "workspace:degree-major-v5"
const LS_NOTES     = "workspace:degree-notes"
const LS_CAL       = "workspace:schedule-cal-v1"
const LS_CL_CORE   = "workspace:req-cl-core-v1"
const LS_CL_MATH   = "workspace:req-cl-math-v1"
const LS_CL_DESIGN = "workspace:req-cl-design-v1"
const LS_CL_SCHOOL = "workspace:req-cl-school-v1"

// ── Helpers ───────────────────────────────────────────────────────────

function ld<T>(k: string, d: T): T {
  try { return JSON.parse(localStorage.getItem(k) || "null") ?? d } catch { return d }
}
function sv(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function fmtTime(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ampm = hh >= 12 ? "pm" : "am"
  const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh
  return mm > 0 ? `${h12}:${mm.toString().padStart(2, "0")}${ampm}` : `${h12}${ampm}`
}

function snapH(h: number): number { return Math.round(h * 4) / 4 }

function hToTimeStr(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`
}

function timeStrToH(t: string): number {
  const [hh, mm] = t.split(":").map(Number)
  return hh + (mm || 0) / 60
}

// ── Constants ─────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
const CAL_DAYS_ALL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8) // 8am–9pm
const CELL_H = 64
const START_H = 8

const STATUS_COLOR: Record<CourseStatus, string> = {
  planned:       "#c8c8c8",
  "in-progress": "#8ab4d4",
  completed:     "#8ab89a",
  dropped:       "#e0b0b0",
}
const STATUS_LABEL: Record<CourseStatus, string> = {
  planned:       "Planned",
  "in-progress": "In Progress",
  completed:     "Completed",
  dropped:       "Dropped",
}

const COURSE_COLORS = ["#b5cde8","#b5d8c0","#e8d5b5","#dab5e8","#e8b5b5","#b5e8e0","#e8e8b5","#c8b5e8"]
const CAL_COLORS    = ["#b5cde8","#b5e8e0","#f5c0b8","#dab5e8","#b5d8c0","#e8d5b5","#c8d8e8","#e8b5c8"]

// ── Default data ──────────────────────────────────────────────────────

const DEFAULT_SEMESTERS: Semester[] = [
  { id: "s1",  label: "Fall 2024",    order: 0 },
  { id: "s2",  label: "Spring 2025",  order: 1 },
  { id: "s3",  label: "Fall 2025",    order: 2 },
  { id: "s4",  label: "Spring 2026",  order: 3 },
  { id: "s4b", label: "Summer 2026",  order: 4 },
  { id: "s5",  label: "Fall 2026",    order: 5 },
  { id: "s6",  label: "Spring 2027",  order: 6 },
  { id: "s7",  label: "Fall 2027",    order: 7 },
  { id: "s8",  label: "Spring 2028",  order: 8 },
]

const DEFAULT_COURSES: Course[] = [
  // ── FALL 2024 — NYU Florence ──
  { id: "f24_1",  code: "ACA-UF 9101",  name: "Arts and Cultures across Antiquity",              credits: 4, status: "completed", grade: "A-", semesterId: "s1", color: "#d4c5e8" },
  { id: "f24_2",  code: "GWA-UF 9101",  name: "Global Works and Society: Antiquity",             credits: 4, status: "completed", grade: "B+", semesterId: "s1", color: "#d4c5e8" },
  { id: "f24_3",  code: "ITAL-UA 9010", name: "Intensive Elementary Italian",                    credits: 6, status: "completed", grade: "A-", semesterId: "s1", color: "#d4c5e8" },
  { id: "f24_4",  code: "WREX-UF 9101", name: "Writing as Exploration",                          credits: 4, status: "completed", grade: "A-", semesterId: "s1", color: "#d4c5e8" },
  // ── SPRING 2025 — NYU Florence ──
  { id: "sp25_1", code: "ACC-UF 9102",  name: "Arts and Cultures towards the Crossroads",        credits: 4, status: "completed", grade: "A",  semesterId: "s2", color: "#d4c5e8" },
  { id: "sp25_2", code: "GWC-UF 9102",  name: "Global Works and Society in a Changing World",    credits: 4, status: "completed", grade: "A",  semesterId: "s2", color: "#d4c5e8" },
  { id: "sp25_3", code: "ITAL-UA 9020", name: "Intensive Intermediate Italian",                  credits: 6, status: "completed", grade: "A-", semesterId: "s2", color: "#d4c5e8" },
  { id: "sp25_4", code: "WRCI-UF 9102", name: "Writing as Critical Inquiry",                     credits: 4, status: "completed", grade: "A",  semesterId: "s2", color: "#d4c5e8" },
  // ── FALL 2025 — NYU ──
  { id: "f25_1",  code: "CSCI-UA 2",    name: "Introduction to Computer Programming",            credits: 4, status: "completed", grade: "",   semesterId: "s3", color: "#b5e8e0" },
  { id: "f25_2",  code: "DS-UA 111",    name: "Principles of Data Science I",                    credits: 4, status: "completed", grade: "",   semesterId: "s3", color: "#b5e8e0" },
  { id: "f25_3",  code: "ELEC-UF 103",  name: "Impact Scholars Program",                         credits: 0, status: "completed", grade: "",   semesterId: "s3", color: "#b5e8e0" },
  { id: "f25_4",  code: "GWM-UF 201",   name: "Global Works and Society: Modernity",             credits: 4, status: "completed", grade: "",   semesterId: "s3", color: "#b5e8e0" },
  { id: "f25_5",  code: "MATH-UA 121",  name: "Calculus I",                                      credits: 4, status: "completed", grade: "",   semesterId: "s3", color: "#b5e8e0" },
  // ── SPRING 2026 — Barnard / Columbia ──
  { id: "c01",    code: "COMS W1004",   name: "Intro to Computer Science / Programming in Java", credits: 3, status: "completed", grade: "",   semesterId: "s4", color: "#b5cde8" },
  { id: "c07",    code: "MATH UN1201",  name: "Calculus III",                                    credits: 3, status: "completed", grade: "",   semesterId: "s4", color: "#b5d8c0" },
  { id: "sp26_1", code: "ASTR BC1754",  name: "Stars, Galaxies & Cosmology",                     credits: 3, status: "completed", grade: "",   semesterId: "s4", color: "#e8e8b5" },
  { id: "sp26_2", code: "ASTR UN1904",  name: "Astronomy Lab II",                                credits: 1, status: "completed", grade: "",   semesterId: "s4", color: "#e8e8b5" },
  { id: "sp26_3", code: "PHIL UN2655",  name: "Cog Sci and Philosophy",                          credits: 3, status: "completed", grade: "",   semesterId: "s4", color: "#e8e8b5" },
  { id: "sp26_4", code: "PSYC BC2115",  name: "Cognitive Psychology",                            credits: 3, status: "completed", grade: "",   semesterId: "s4", color: "#e8e8b5" },
  { id: "sp26_5", code: "PHED BC1696",  name: "Yoga / Meditation",                               credits: 1, status: "completed", grade: "",   semesterId: "s4", color: "#e8e8b5" },
  // ── CS CORE (planned) ──
  { id: "c02", code: "COMS W3203",  name: "Discrete Mathematics",             credits: 4, status: "planned", semesterId: "s5",  color: "#b5cde8" },
  { id: "c03", code: "COMS W3134",  name: "Data Structures",                  credits: 3, status: "planned", semesterId: "s5",  color: "#b5cde8" },
  { id: "c04", code: "COMS W3157",  name: "Advanced Programming",             credits: 4, status: "planned", semesterId: "s7",  color: "#b5cde8" },
  { id: "c05", code: "COMS W3261",  name: "Computer Science Theory",          credits: 3, status: "planned", semesterId: "s7",  color: "#b5cde8" },
  { id: "c06", code: "CSEE W3827",  name: "Fundamentals of Computer Systems", credits: 3, status: "planned", semesterId: "s8",  color: "#b5cde8" },
  // ── MATH (planned) ──
  { id: "c08", code: "COMS W3251",  name: "Linear Algebra",                   credits: 3, status: "planned", semesterId: "s5",  color: "#b5d8c0" },
  { id: "c09", code: "STAT UN1201", name: "Probability",                      credits: 3, status: "planned", semesterId: "s6",  color: "#b5d8c0" },
  // ── AREA FOUNDATION (planned) ──
  { id: "c10", code: "COMS W4170",  name: "User Interface Design",            credits: 3, status: "planned", semesterId: "s7",  color: "#dab5e8" },
  { id: "c11", code: "COMS W4771",  name: "Machine Learning",                 credits: 3, status: "planned", semesterId: "s4b", color: "#dab5e8" },
  { id: "c12", code: "COMS BC3160", name: "Computer Graphics",                credits: 3, status: "planned", semesterId: "s8",  color: "#dab5e8" },
  // ── CS ELECTIVES (planned) ──
  { id: "c13", code: "",            name: "Human Computer Interaction",        credits: 3, status: "planned", semesterId: "s6",  color: "#e8d5b5" },
  { id: "c14", code: "COMS W4121",  name: "Computational Analysis of Big Data",credits: 3, status: "planned", semesterId: "s6", color: "#e8d5b5" },
  { id: "c15", code: "COMS W4118",  name: "Operating Systems",                credits: 3, status: "planned", semesterId: "s8",  color: "#e8d5b5" },
  // ── DESIGN MINOR (planned) ──
  { id: "c16", code: "ARCH 1010UN", name: "Design Futures NYC",               credits: 3, status: "planned", semesterId: "s7",  color: "#f5c0b8" },
  { id: "c17", code: "",            name: "Practices in Design and Innovation",credits: 3, status: "planned", semesterId: "s8",  color: "#f5c0b8" },
  { id: "c18", code: "",            name: "Intro Darkroom & Photography",      credits: 3, status: "planned", semesterId: "s5",  color: "#f5c0b8" },
]

const DEFAULT_CL_CORE: CheckItem[] = [
  { id: "cc1", text: "COMS W1004 — Introduction to Computer Science", checked: true },
  { id: "cc2", text: "COMS W3203 — Discrete Mathematics", checked: false },
  { id: "cc3", text: "COMS W3134 — Data Structures in Java", checked: false },
  { id: "cc4", text: "COMS W3157 — Advanced Programming", checked: false },
  { id: "cc5", text: "COMS W3261 — Computer Science Theory", checked: false },
  { id: "cc6", text: "CSEE W3827 — Fundamentals of Computer Systems", checked: false },
]

const DEFAULT_CL_MATH: CheckItem[] = [
  { id: "cm1", text: "MATH UN1201 — Calculus III", checked: true },
  { id: "cm2", text: "Linear Algebra (COMS W3251 or MATH UN2010)", checked: false },
  { id: "cm3", text: "Probability (STAT UN1201 or STAT W4203)", checked: false },
]

const DEFAULT_CL_DESIGN: CheckItem[] = [
  { id: "cd1", text: "COMS W4170 — User Interface Design", checked: false },
  { id: "cd2", text: "COMS BC3160 — Computer Graphics", checked: false },
  { id: "cd3", text: "ARCH 1010UN — Design Futures NYC", checked: false },
  { id: "cd4", text: "Practices in Design and Innovation", checked: false },
  { id: "cd5", text: "Intro to Darkroom & Photography", checked: false },
]

const DEFAULT_CL_SCHOOL: CheckItem[] = [
  { id: "cs1",  text: "First-Year Writing (FYW)", checked: false },
  { id: "cs2",  text: "Thinking Locally", checked: false },
  { id: "cs3",  text: "Foundations of Listening", checked: false },
  { id: "cs4",  text: "Quantitative & Deductive Reasoning", checked: true },
  { id: "cs5",  text: "Ways of Knowing: Science (1–2 courses)", checked: false },
  { id: "cs6",  text: "Ways of Knowing: Social Analysis", checked: false },
  { id: "cs7",  text: "Ways of Knowing: Visual Arts", checked: false },
  { id: "cs8",  text: "Distributional: Literature", checked: false },
  { id: "cs9",  text: "Distributional: Historical Studies", checked: false },
  { id: "cs10", text: "Physical Education (2 semesters)", checked: false },
]

// ── Sub-components — Course Plan ──────────────────────────────────────

function CourseRow({
  course, onEdit, onRemove, onDragStart, onDragEnd,
}: {
  course: Course
  onEdit: () => void
  onRemove: () => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(course.id) }}
      onDragEnd={onDragEnd}
      className="flex items-center gap-3 py-2 px-3 hover:bg-[#f5f5f7] rounded-lg group cursor-grab active:cursor-grabbing active:opacity-50"
    >
      <GripVertical size={12} className="text-[#c0c0c0] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: course.color || STATUS_COLOR[course.status] }} />
      <span className="text-[12px] font-semibold text-[#1d1d1f] w-28 shrink-0 truncate">{course.code}</span>
      <span className="text-[12px] text-[#3a3a3a] flex-1 truncate">{course.name}</span>
      <span className="text-[11px] text-[#7a7a7a] w-8 text-right shrink-0">{course.credits}</span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
        style={{ background: STATUS_COLOR[course.status] + "55", color: "#1d1d1f" }}
      >
        {STATUS_LABEL[course.status]}
      </span>
      {course.grade && <span className="text-[11px] font-semibold w-8 shrink-0 text-[#3a3a3a]">{course.grade}</span>}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-[#7a7a7a] hover:text-[#1d1d1f]"><Pencil size={11} /></button>
        <button onClick={onRemove} className="text-[#7a7a7a] hover:text-[#e05050]"><X size={11} /></button>
      </div>
    </div>
  )
}

function CourseModal({ initial, semesters, onSave, onClose }: {
  initial?: Partial<Course>
  semesters: Semester[]
  onSave: (c: Omit<Course, "id">) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Omit<Course, "id">>({
    code:      initial?.code      ?? "",
    name:      initial?.name      ?? "",
    credits:   initial?.credits   ?? 3,
    status:    initial?.status    ?? "planned",
    grade:     initial?.grade     ?? "",
    professor: initial?.professor ?? "",
    location:  initial?.location  ?? "",
    days:      initial?.days      ?? "",
    startTime: initial?.startTime ?? "",
    endTime:   initial?.endTime   ?? "",
    color:     initial?.color     ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)],
    semesterId: initial?.semesterId ?? semesters[0]?.id ?? "",
  })
  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-[#1d1d1f]">{initial?.code ? "Edit Course" : "Add Course"}</h2>
          <button onClick={onClose}><X size={16} className="text-[#7a7a7a]" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Course Code</label>
              <input value={form.code} onChange={e => set("code", e.target.value)} placeholder="COMS 4111"
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
            <div className="flex flex-col gap-1 w-20">
              <label className="text-[11px] text-[#7a7a7a]">Credits</label>
              <input type="number" min={0} max={6} value={form.credits} onChange={e => set("credits", Number(e.target.value))}
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#7a7a7a]">Course Name</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Database Systems"
              className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Semester</label>
              <select value={form.semesterId} onChange={e => set("semesterId", e.target.value)}
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40 bg-white">
                {semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value as CourseStatus)}
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40 bg-white">
                {(Object.keys(STATUS_LABEL) as CourseStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Professor</label>
              <input value={form.professor} onChange={e => set("professor", e.target.value)} placeholder="Prof. Smith"
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Mudd 633"
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#7a7a7a]">Days (e.g. Mon Wed)</label>
              <input value={form.days} onChange={e => set("days", e.target.value)} placeholder="Mon Wed"
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
            <div className="flex flex-col gap-1 w-24">
              <label className="text-[11px] text-[#7a7a7a]">Start</label>
              <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)}
                className="border border-[#e0e0e0] rounded-lg px-2 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
            <div className="flex flex-col gap-1 w-24">
              <label className="text-[11px] text-[#7a7a7a]">End</label>
              <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)}
                className="border border-[#e0e0e0] rounded-lg px-2 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
          </div>
          {form.status === "completed" && (
            <div className="flex flex-col gap-1 w-28">
              <label className="text-[11px] text-[#7a7a7a]">Grade</label>
              <input value={form.grade} onChange={e => set("grade", e.target.value)} placeholder="A"
                className="border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#7a7a7a]">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COURSE_COLORS.map(c => (
                <button key={c} onClick={() => set("color", c)}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: form.color === c ? "#1d1d1f" : "transparent" }} />
              ))}
            </div>
          </div>
          <button
            onClick={() => { if (form.name) onSave(form) }}
            className="mt-1 py-2.5 bg-[#1d1d1f] text-white rounded-xl text-[13px] font-semibold hover:bg-[#2d2d2f] transition-colors"
          >
            {initial?.code ? "Save Changes" : "Add Course"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components — Schedule ─────────────────────────────────────────

function CalBlockModal({ initial, onSave, onDelete, onClose }: {
  initial?: Partial<CalBlock> & { day?: string }
  onSave: (b: CalBlock) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const initDays = (initial?.days || initial?.day || "Mon").split(/\s+/).filter(Boolean)
  const [title,    setTitle]    = useState(initial?.title    ?? "")
  const [days,     setDays]     = useState<string[]>(initDays)
  const [start,    setStart]    = useState(initial?.start    ?? 9)
  const [end,      setEnd]      = useState(initial?.end      ?? 10)
  const [color,    setColor]    = useState(initial?.color    ?? CAL_COLORS[0])
  const [location, setLocation] = useState(initial?.location ?? "")

  function toggleDay(d: string) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function save() {
    if (!title.trim() || days.length === 0) return
    onSave({
      id:       initial?.id ?? uid(),
      title:    title.trim(),
      days:     days.join(" "),
      start,
      end:      Math.max(start + 0.25, end),
      color,
      location: location.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-[320px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-bold text-[#1d1d1f]">{initial?.id ? "Edit Event" : "New Event"}</h2>
          <button onClick={onClose}><X size={15} className="text-[#7a7a7a]" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save() }}
            placeholder="Event title…"
            className="border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#2c4470]/40"
          />
          {/* Day toggles */}
          <div className="flex gap-1.5 flex-wrap">
            {CAL_DAYS_ALL.map(d => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  days.includes(d) ? "bg-[#2c4470] text-white" : "bg-[#f0f0f0] text-[#7a7a7a] hover:bg-[#e8e8e8]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {/* Times */}
          <div className="flex items-center gap-2">
            <input type="time" value={hToTimeStr(start)} onChange={e => setStart(timeStrToH(e.target.value))}
              className="flex-1 border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px] outline-none" />
            <span className="text-[11px] text-[#b0b0b0]">→</span>
            <input type="time" value={hToTimeStr(end)} onChange={e => setEnd(timeStrToH(e.target.value))}
              className="flex-1 border border-[#e0e0e0] rounded-lg px-2 py-2 text-[12px] outline-none" />
          </div>
          <input
            value={location} onChange={e => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="border border-[#e0e0e0] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[#2c4470]/40"
          />
          {/* Colors */}
          <div className="flex gap-2">
            {CAL_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{ background: c, borderColor: color === c ? "#1d1d1f" : "transparent" }} />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {onDelete && (
              <button onClick={onDelete}
                className="flex-1 py-2 text-[12px] text-[#e05050] border border-[#f0f0f0] rounded-xl hover:bg-[#fff5f5] transition-colors">
                Delete
              </button>
            )}
            <button onClick={save}
              className="flex-1 py-2 text-[12px] font-semibold bg-[#1d1d1f] text-white rounded-xl hover:bg-[#2d2d2f] transition-colors">
              {initial?.id ? "Save" : "Add Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditableWeekCalendar() {
  const [blocks,   setBlocks]   = useState<CalBlock[]>(() => ld(LS_CAL, []))
  const [ghost,    setGhost]    = useState<{ day: string; start: number; end: number } | null>(null)
  const [showNew,  setShowNew]  = useState<{ day: string; start: number; end: number } | null>(null)
  const [editing,  setEditing]  = useState<CalBlock | null>(null)

  function saveBlocks(next: CalBlock[]) { setBlocks(next); sv(LS_CAL, next) }

  function onColDown(day: string, e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("[data-block='1']")) return
    if ((e.target as Element).closest("[data-resize='1']")) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const startH = snapH(START_H + (e.clientY - rect.top) / CELL_H)
    setGhost({ day, start: startH, end: startH + 1 })

    const onMove = (ev: MouseEvent) => {
      const newEnd = Math.max(startH + 0.25, snapH(START_H + (ev.clientY - rect.top) / CELL_H))
      setGhost({ day, start: startH, end: newEnd })
    }
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      const rawEnd = snapH(START_H + (ev.clientY - rect.top) / CELL_H)
      const endH = rawEnd <= startH + 0.5 ? startH + 1 : Math.max(startH + 0.25, rawEnd)
      setGhost(null)
      setShowNew({ day, start: startH, end: endH })
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  function onResizeDown(blk: CalBlock, e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault()
    const startY = e.clientY, origEnd = blk.end
    const onMove = (ev: MouseEvent) => {
      const newEnd = Math.max(blk.start + 0.25, snapH(origEnd + (ev.clientY - startY) / CELL_H))
      setBlocks(prev => prev.map(b => b.id === blk.id ? { ...b, end: newEnd } : b))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setBlocks(prev => { sv(LS_CAL, prev); return prev })
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  function onBlockDragDown(blk: CalBlock, e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("[data-resize='1']")) return
    e.preventDefault()
    const startY = e.clientY, origStart = blk.start, dur = blk.end - blk.start
    const onMove = (ev: MouseEvent) => {
      const dy = (ev.clientY - startY) / CELL_H
      const newStart = Math.max(START_H, Math.min(START_H + HOURS.length - dur, snapH(origStart + dy)))
      setBlocks(prev => prev.map(b => b.id === blk.id ? { ...b, start: newStart, end: newStart + dur } : b))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setBlocks(prev => { sv(LS_CAL, prev); return prev })
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const totalH = HOURS.length * CELL_H

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowNew({ day: "Mon", start: 9, end: 10 })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#1d1d1f] text-white rounded-xl hover:bg-[#2d2d2f] transition-colors"
        >
          <Plus size={12} /> Add Event
        </button>
        <span className="text-[11px] text-[#b0b0b0]">or click-drag on the grid to draw a block</span>
      </div>

      <div className="border border-[#e8e8e8] rounded-2xl overflow-hidden select-none">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Day headers */}
            <div className="flex border-b border-[#e8e8e8] bg-[#fafafa]">
              <div className="w-14 shrink-0" />
              {DAYS.map(d => (
                <div key={d} className="flex-1 flex items-center justify-between px-2 py-2.5 border-l border-[#f0f0f0]">
                  <span className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">{d}</span>
                  <button
                    onClick={() => setShowNew({ day: d, start: 9, end: 10 })}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[#c0c0c0] hover:bg-[#e8e8e8] hover:text-[#1d1d1f] transition-colors"
                  >
                    <Plus size={11} />
                  </button>
                </div>
              ))}
            </div>

            {/* Scrollable grid body */}
            <div className="overflow-y-auto" style={{ maxHeight: 600 }}>
              <div className="flex relative" style={{ height: totalH }}>
                {/* Hour labels */}
                <div className="w-14 shrink-0 relative bg-white">
                  {HOURS.map((h, i) => (
                    <div key={h} className="absolute right-3 text-[10px] text-[#b0b0b0] leading-none select-none"
                      style={{ top: i * CELL_H - 6 }}>
                      {fmtTime(h)}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {DAYS.map(day => (
                  <div
                    key={day}
                    className="flex-1 relative border-l border-[#f0f0f0] bg-white cursor-crosshair"
                    style={{ height: totalH }}
                    onMouseDown={e => onColDown(day, e)}
                  >
                    {/* Hour lines */}
                    {HOURS.map((_, i) => (
                      <div key={i} className="absolute w-full border-t border-[#f0f0f0]" style={{ top: i * CELL_H }} />
                    ))}
                    {/* Half-hour dashes */}
                    {HOURS.map((_, i) => (
                      <div key={`hh${i}`} className="absolute w-full border-t border-dashed border-[#f7f7f7]"
                        style={{ top: i * CELL_H + CELL_H / 2 }} />
                    ))}

                    {/* Ghost while drawing */}
                    {ghost?.day === day && (
                      <div
                        className="absolute left-1 right-1 rounded-xl pointer-events-none opacity-50 border-2 border-dashed border-[#2c4470]"
                        style={{
                          top: (ghost.start - START_H) * CELL_H,
                          height: Math.max(20, (ghost.end - ghost.start) * CELL_H),
                          background: CAL_COLORS[0],
                        }}
                      />
                    )}

                    {/* Blocks */}
                    {blocks
                      .filter(b => b.days.split(/\s+/).includes(day))
                      .map(b => {
                        const top = (b.start - START_H) * CELL_H
                        const height = Math.max(24, (b.end - b.start) * CELL_H)
                        return (
                          <div
                            key={b.id}
                            data-block="1"
                            className="absolute left-1 right-1 rounded-xl px-2 py-1 overflow-hidden group cursor-grab active:cursor-grabbing shadow-sm"
                            style={{ top, height, background: b.color }}
                            onMouseDown={e => onBlockDragDown(b, e)}
                            onClick={() => setEditing(b)}
                          >
                            <p className="text-[11px] font-semibold text-[#1d1d1f] leading-tight truncate pointer-events-none">{b.title}</p>
                            {height > 42 && (
                              <p className="text-[10px] text-[#3a3a3a] opacity-80 pointer-events-none">
                                {fmtTime(b.start)}–{fmtTime(b.end)}
                              </p>
                            )}
                            {height > 58 && b.location && (
                              <p className="text-[10px] text-[#3a3a3a] truncate pointer-events-none">{b.location}</p>
                            )}
                            {/* Resize handle */}
                            <div
                              data-resize="1"
                              className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onMouseDown={e => onResizeDown(b, e)}
                            >
                              <div className="w-8 h-1 bg-black/20 rounded-full" />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNew && (
        <CalBlockModal
          initial={showNew}
          onSave={b => { saveBlocks([...blocks, b]); setShowNew(null) }}
          onClose={() => setShowNew(null)}
        />
      )}
      {editing && (
        <CalBlockModal
          initial={editing}
          onSave={b => { saveBlocks(blocks.map(x => x.id === b.id ? b : x)); setEditing(null) }}
          onDelete={() => { saveBlocks(blocks.filter(x => x.id !== editing.id)); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components — Requirements ────────────────────────────────────

function MarkdownEditor({ value, onChange, placeholder, rows = 8 }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrapSel(before: string, after = before, def = "text") {
    const el = ref.current; if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = s === e ? def : value.slice(s, e)
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }

  function linePrefix(pfx: string) {
    const el = ref.current; if (!el) return
    const { selectionStart: s } = el
    const lineStart = value.lastIndexOf("\n", s - 1) + 1
    const alreadyHas = value.slice(lineStart).startsWith(pfx)
    const next = alreadyHas
      ? value.slice(0, lineStart) + value.slice(lineStart + pfx.length)
      : value.slice(0, lineStart) + pfx + value.slice(lineStart)
    onChange(next)
    const offset = alreadyHas ? -pfx.length : pfx.length
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + offset, s + offset) })
  }

  function insertDivider() {
    const el = ref.current; if (!el) return
    const { selectionStart: s } = el
    const ins = "\n---\n"
    onChange(value.slice(0, s) + ins + value.slice(s))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + ins.length, s + ins.length) })
  }

  const TB = ({ label, title, action, cls = "" }: { label: string; title: string; action: () => void; cls?: string }) => (
    <button
      title={title}
      onMouseDown={e => { e.preventDefault(); action() }}
      className={`px-2 py-0.5 text-[11px] rounded-md hover:bg-[#e8e8e8] text-[#5a5a5a] hover:text-[#1d1d1f] transition-colors min-w-[22px] text-center ${cls}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col overflow-hidden focus-within:ring-1 focus-within:ring-[#c0c0c0] rounded-br-2xl">
      <div className="flex items-center gap-0.5 px-3 py-1.5 bg-[#f8f8f8] border-b border-[#f0f0f0]">
        <TB label="B" title="Bold" action={() => wrapSel("**", "**")} cls="font-bold" />
        <TB label="I" title="Italic" action={() => wrapSel("_", "_")} cls="italic" />
        <TB label="`" title="Inline code" action={() => wrapSel("`", "`")} cls="font-mono" />
        <div className="w-px h-3.5 bg-[#e0e0e0] mx-1 shrink-0" />
        <TB label="H" title="Heading" action={() => linePrefix("## ")} />
        <TB label="•" title="Bullet list" action={() => linePrefix("- ")} />
        <TB label="☐" title="Checkbox" action={() => linePrefix("- [ ] ")} />
        <TB label="─" title="Divider" action={insertDivider} />
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-none outline-none text-[13px] px-4 py-3 bg-white leading-relaxed [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      />
    </div>
  )
}

function ReqSection({ title, listKey, defaultItems, val, onChange }: {
  title: string
  listKey: string
  defaultItems: CheckItem[]
  val: string
  onChange: (v: string) => void
}) {
  const [items,   setItems]   = useState<CheckItem[]>(() => ld(listKey, defaultItems))
  const [adding,  setAdding]  = useState(false)
  const [newText, setNewText] = useState("")

  function saveItems(next: CheckItem[]) { setItems(next); sv(listKey, next) }
  function toggle(id: string) { saveItems(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i)) }
  function remove(id: string) { saveItems(items.filter(i => i.id !== id)) }
  function commitNew() {
    const t = newText.trim()
    if (t) saveItems([...items, { id: uid(), text: t, checked: false }])
    setNewText(""); setAdding(false)
  }

  const done = items.filter(i => i.checked).length
  const pct  = items.length ? (done / items.length) * 100 : 0

  return (
    <div className="border border-[#e8e8e8] rounded-2xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#fafafa] border-b border-[#f0f0f0]">
        <h3 className="text-[13px] font-semibold text-[#1d1d1f]">{title}</h3>
        <span className="text-[11px] text-[#b0b0b0]">{done}/{items.length}</span>
        <div className="flex-1 h-1 bg-[#ebebeb] rounded-full overflow-hidden">
          <div className="h-full bg-[#8ab89a] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex min-h-[180px]">
        {/* Left: checkbox list */}
        <div className="w-[38%] shrink-0 border-r border-[#f0f0f0] px-3 py-3 flex flex-col gap-0.5">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-2 group py-1 pr-1">
              <button onClick={() => toggle(item.id)} className="shrink-0 mt-0.5">
                <div className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center transition-colors ${
                  item.checked ? "bg-[#3d6b4a] border-[#3d6b4a]" : "border-[#c0c0c0] hover:border-[#7a7a7a]"
                }`}>
                  {item.checked && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
              </button>
              <span className={`text-[12px] flex-1 leading-snug ${
                item.checked ? "text-[#3d6b4a]" : "text-[#1d1d1f]"
              }`}>
                {item.text}
              </span>
              <button
                onClick={() => remove(item.id)}
                className="opacity-0 group-hover:opacity-100 text-[#c0c0c0] hover:text-[#e05050] transition-all shrink-0 mt-0.5"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {adding ? (
            <div className="flex items-center gap-2 mt-1 pr-1">
              <div className="w-3.5 h-3.5 rounded border-[1.5px] border-[#c0c0c0] shrink-0" />
              <input
                autoFocus
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitNew(); if (e.key === "Escape") { setAdding(false); setNewText("") } }}
                onBlur={commitNew}
                placeholder="Add requirement…"
                className="flex-1 text-[12px] outline-none border-b border-[#e0e0e0] pb-0.5 bg-transparent"
              />
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 mt-2 text-[11px] text-[#b0b0b0] hover:text-[#7a7a7a] transition-colors"
            >
              <Plus size={11} /> Add
            </button>
          )}
        </div>

        {/* Right: markdown notes */}
        <div className="flex-1 min-w-0 flex flex-col">
          <MarkdownEditor
            value={val}
            onChange={onChange}
            placeholder="Notes, context, substitutions, advisor comments…"
            rows={7}
          />
        </div>
      </div>
    </div>
  )
}

// ── AI Sidebar ────────────────────────────────────────────────────────

function DegreeChatSidebar() {
  const { messages, streaming, send, stop, reset } = useSSEChat("/api/deep-chat")
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function submit() {
    if (!input.trim() || streaming) return
    send(input)
    setInput("")
  }

  const SUGGESTIONS = [
    "Which requirements am I missing?",
    "How many credits left to graduate?",
    "Suggest AI electives for spring",
  ]

  const isEmpty = messages.length === 0

  return (
    <aside
      className="w-[320px] shrink-0 flex flex-col border-l border-[#e8e8e8]"
      style={{ background: "linear-gradient(180deg, #fafafd 0%, #f2f2f9 100%)" }}
    >
      {/* Messages or empty state */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isEmpty ? (
          /* ── Empty state — centered title + suggestions ── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-[24px] font-bold tracking-tight text-[#1d1d1f]">AI Assistant</span>
                <ArrowUpRight size={18} className="text-[#1d1d1f] mt-0.5" />
              </div>
              <p className="text-[13px] text-[#9a9aaa] leading-relaxed">Ask anything about your degree plan.</p>
            </div>

            <ul className="list-disc list-inside flex flex-col gap-2">
              {SUGGESTIONS.map(s => (
                <li key={s} className="text-[#b0b0c0] text-[12px]">
                  <button
                    onClick={() => send(s)}
                    className="text-[#5a5a7a] hover:text-[#1d1d1f] text-left transition-colors"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* ── Conversation ── */
          <div className="flex flex-col gap-3 px-4 pt-5 pb-3 overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-[#9a9aaa]">AI Assistant</span>
              <button onClick={reset} className="flex items-center gap-1 text-[11px] text-[#b0b0c0] hover:text-[#1d1d1f] transition-colors">
                <RotateCcw size={10} /> Clear
              </button>
            </div>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-white/90 border border-[#e0e0ee] text-[#1d1d1f] shadow-sm"
                }`}>
                  <span className="whitespace-pre-wrap">{msg.content || "…"}</span>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input — large pill at bottom */}
      <div className="px-4 py-5">
        <div
          className="flex items-center gap-2 rounded-full px-4 py-3 shadow-sm"
          style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(200,200,220,0.6)" }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit() } }}
            placeholder="Ask anything..."
            disabled={streaming}
            className="flex-1 bg-transparent text-[13px] text-[#1d1d1f] placeholder:text-[#b0b0c0] outline-none"
          />
          {streaming ? (
            <button onClick={stop} className="shrink-0 text-[#9a9aaa] hover:text-[#1d1d1f] transition-colors">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="shrink-0 text-[#9a9aaa] hover:text-[#1d1d1f] disabled:opacity-30 transition-colors"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function Degree() {
  const [courses,    setCourses]    = useState<Course[]>(() => ld(LS_COURSES, DEFAULT_COURSES))
  const [semesters,  setSemesters]  = useState<Semester[]>(() => ld(LS_SEMESTERS, DEFAULT_SEMESTERS))
  const [major,      setMajor]      = useState<string>(() => ld(LS_MAJOR, "Computer Science, Barnard College · Columbia University"))
  const [notes,      setNotes]      = useState<string>(() => ld(LS_NOTES, "Transfer Credit — New York University 2024-25: 32.0 credits (pending final transcript)"))
  const [addingCourse,       setAddingCourse]       = useState(false)
  const [addingForSemester,  setAddingForSemester]  = useState<string | null>(null)
  const [editingCourse,      setEditingCourse]      = useState<Course | null>(null)
  const [collapsed,          setCollapsed]          = useState<Set<string>>(new Set())
  const [tab,                setTab]                = useState<"plan" | "schedule" | "requirements">("plan")
  const [reqNotes,   setReqNotes]   = useState<string>(() => ld("workspace:degree-req-notes", ""))
  const [reqCore,    setReqCore]    = useState<string>(() => ld("workspace:req-cs-core", ""))
  const [reqMath,    setReqMath]    = useState<string>(() => ld("workspace:req-math", ""))
  const [reqDesign,  setReqDesign]  = useState<string>(() => ld("workspace:req-design", ""))
  const [reqSchool,  setReqSchool]  = useState<string>(() => ld("workspace:req-school", ""))
  const [editingMajor,    setEditingMajor]    = useState(false)
  const [addingSemester,  setAddingSemester]  = useState(false)
  const [newSemesterLabel, setNewSemesterLabel] = useState("")
  const [draggingCourseId, setDraggingCourseId] = useState<string | null>(null)
  const [dragOverSemId,    setDragOverSemId]    = useState<string | null>(null)

  function saveCourses(next: Course[])     { setCourses(next);   sv(LS_COURSES, next) }
  function saveSemesters(next: Semester[]) { setSemesters(next); sv(LS_SEMESTERS, next) }

  function addCourse(draft: Omit<Course, "id">) {
    saveCourses([...courses, { ...draft, id: uid() }])
    setAddingCourse(false)
  }
  function updateCourse(id: string, draft: Omit<Course, "id">) {
    saveCourses(courses.map(c => c.id === id ? { ...draft, id } : c))
    setEditingCourse(null)
  }
  function removeCourse(id: string)  { saveCourses(courses.filter(c => c.id !== id)) }
  function moveCourse(courseId: string, toSemId: string) {
    saveCourses(courses.map(c => c.id === courseId ? { ...c, semesterId: toSemId } : c))
  }

  function addSemester() {
    const label = newSemesterLabel.trim(); if (!label) return
    saveSemesters([...semesters, { id: uid(), label, order: semesters.length }])
    setNewSemesterLabel(""); setAddingSemester(false)
  }
  function removeSemester(id: string) {
    saveSemesters(semesters.filter(s => s.id !== id))
    saveCourses(courses.filter(c => c.semesterId !== id))
  }
  function toggleCollapse(id: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const totalCredits     = courses.reduce((s, c) => s + (c.status !== "dropped" ? c.credits : 0), 0)
  const completedCredits = courses.filter(c => c.status === "completed").reduce((s, c) => s + c.credits, 0)
  const inProgressCredits = courses.filter(c => c.status === "in-progress").reduce((s, c) => s + c.credits, 0)
  const sortedSemesters  = [...semesters].sort((a, b) => a.order - b.order)

  const courseCount = courses.filter(c => c.status !== "dropped").length

  return (
    <div className="flex h-full">

    {/* ── LEFT: main scrollable content ── */}
    <div className="flex-1 flex flex-col overflow-y-auto min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#e8e8e8]">
        <div className="px-8 pt-14 pb-0">

          {/* Title row: logo + title left, VERGIL far right */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-3">
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR97zjlobRsIbqDOlOhLzrKUJB8AG17g_BHquDV4wmv8Q&s=10"
                alt="Columbia"
                className="h-7 w-auto"
              />
              <h1 className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">Degree Planner</h1>
            </div>
            <a
              href="https://vergil.columbia.edu"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] text-[#2c4470] font-medium hover:underline mt-1"
            >
              Columbia VERGIL <ExternalLink size={11} />
            </a>
          </div>

          {/* Major subtitle */}
          <div className="flex items-center gap-2 mb-10">
            {editingMajor ? (
              <input
                autoFocus
                value={major}
                onChange={e => { setMajor(e.target.value); sv(LS_MAJOR, e.target.value) }}
                onBlur={() => setEditingMajor(false)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingMajor(false) }}
                placeholder="e.g. Computer Science, Columbia University"
                className="text-[13px] text-[#7a7a7a] outline-none border-b border-[#2c4470]/40 w-80 bg-transparent pb-0.5"
              />
            ) : (
              <button
                onClick={() => setEditingMajor(true)}
                className="text-[13px] text-[#7a7a7a] hover:text-[#1d1d1f] flex items-center gap-1.5 group"
              >
                {major || <span className="text-[#c0c0c0]">Add your major…</span>}
                <Pencil size={10} className="opacity-0 group-hover:opacity-60" />
              </button>
            )}
          </div>

          {/* Tab bar left, stats pushed to far right */}
          <div className="flex items-center border-b border-[#e8e8e8] -mx-8 px-8">
            {(["plan", "schedule", "requirements"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                  tab === t ? "border-[#1d1d1f] text-[#1d1d1f]" : "border-transparent text-[#7a7a7a] hover:text-[#1d1d1f]"
                }`}
              >
                {t === "plan" ? "Course Plan" : t === "schedule" ? "Weekly Schedule" : "Requirements"}
              </button>
            ))}

            {/* Stats — far right of tab bar */}
            <div className="ml-auto flex items-center gap-5 pb-2">
              {[
                { label: "completed", value: completedCredits },
                { label: "in progress", value: inProgressCredits },
                { label: "total credits", value: totalCredits },
                { label: "courses", value: courseCount },
              ].map(s => (
                <div key={s.label} className="flex items-baseline gap-1">
                  <span className="text-[13px] font-semibold text-[#3a3a3a]">{s.value}</span>
                  <span className="text-[11px] text-[#b0b0b0]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLING CONTENT ── */}
      <div className="px-8 pt-6 pb-16 flex flex-col gap-6">

      {/* ── PLAN TAB ── */}
      {tab === "plan" && (
        <div className="flex flex-col gap-6">
          {sortedSemesters.map(sem => {
            const semCourses = courses.filter(c => c.semesterId === sem.id)
            const semCredits = semCourses.filter(c => c.status !== "dropped").reduce((s, c) => s + c.credits, 0)
            const isCollapsed = collapsed.has(sem.id)
            const isOver = dragOverSemId === sem.id
            return (
              <div
                key={sem.id}
                className={`border rounded-2xl overflow-hidden transition-colors ${isOver ? "border-[#2c4470]/40 bg-[#f0f5ff]" : "border-[#e8e8e8]"}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverSemId(sem.id) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSemId(null) }}
                onDrop={e => {
                  e.preventDefault()
                  if (draggingCourseId) moveCourse(draggingCourseId, sem.id)
                  setDragOverSemId(null); setDraggingCourseId(null)
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 bg-[#fafafa] cursor-pointer hover:bg-[#f5f5f7] transition-colors"
                  onClick={() => toggleCollapse(sem.id)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={14} className="text-[#7a7a7a]" /> : <ChevronDown size={14} className="text-[#7a7a7a]" />}
                    <span className="text-[13px] font-semibold text-[#1d1d1f]">{sem.label}</span>
                    <span className="text-[11px] text-[#b0b0b0]">{semCredits} credits · {semCourses.length} course{semCourses.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setAddingForSemester(sem.id) }}
                      className="flex items-center gap-1 text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] px-2 py-1 rounded-lg hover:bg-white transition-colors"
                    >
                      <Plus size={11} /> Course
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); removeSemester(sem.id) }}
                      className="text-[#b0b0b0] hover:text-[#e05050] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className={`divide-y divide-[#f0f0f0] ${isOver && semCourses.length === 0 ? "min-h-[56px]" : ""}`}>
                    {semCourses.length === 0 ? (
                      <div className={`px-4 py-5 text-center text-[12px] transition-colors ${isOver ? "text-[#2c4470]" : "text-[#c0c0c0]"}`}>
                        {isOver ? "Drop to move here" : "No courses yet."}
                      </div>
                    ) : (
                      semCourses.map(c => (
                        <CourseRow
                          key={c.id}
                          course={c}
                          onEdit={() => setEditingCourse(c)}
                          onRemove={() => removeCourse(c.id)}
                          onDragStart={id => setDraggingCourseId(id)}
                          onDragEnd={() => { setDraggingCourseId(null); setDragOverSemId(null) }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {sortedSemesters.length === 0 && (
            <div className="text-center py-12 text-[13px] text-[#b0b0b0]">Add a semester to get started.</div>
          )}
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {tab === "schedule" && <EditableWeekCalendar />}

      {/* ── REQUIREMENTS TAB ── */}
      {tab === "requirements" && (
        <div className="flex flex-col gap-5">
          <ReqSection
            title="CS Core Requirements"
            listKey={LS_CL_CORE}
            defaultItems={DEFAULT_CL_CORE}
            val={reqCore}
            onChange={v => { setReqCore(v); sv("workspace:req-cs-core", v) }}
          />
          <ReqSection
            title="Math Requirements"
            listKey={LS_CL_MATH}
            defaultItems={DEFAULT_CL_MATH}
            val={reqMath}
            onChange={v => { setReqMath(v); sv("workspace:req-math", v) }}
          />
          <ReqSection
            title="Design Minor"
            listKey={LS_CL_DESIGN}
            defaultItems={DEFAULT_CL_DESIGN}
            val={reqDesign}
            onChange={v => { setReqDesign(v); sv("workspace:req-design", v) }}
          />
          <ReqSection
            title="School / General Requirements"
            listKey={LS_CL_SCHOOL}
            defaultItems={DEFAULT_CL_SCHOOL}
            val={reqSchool}
            onChange={v => { setReqSchool(v); sv("workspace:req-school", v) }}
          />

          {/* Advising notes at the bottom */}
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-[#1d1d1f]">Fulfillment Plan & Advising Notes</h3>
            <MarkdownEditor
              value={reqNotes}
              onChange={v => { setReqNotes(v); sv("workspace:degree-req-notes", v) }}
              placeholder="Advising conversations, substitution requests, overall plan…"
              rows={6}
            />
          </div>
        </div>
      )}

      {/* Notes (always visible) */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[16px] font-bold text-[#1d1d1f] tracking-tight">Notes</h2>
        <MarkdownEditor
          value={notes}
          onChange={v => { setNotes(v); sv(LS_NOTES, v) }}
          placeholder="Notes on your degree plan, requirements, advising…"
          rows={5}
        />
      </div>

      {/* Modals */}
      {addingCourse && (
        <CourseModal semesters={semesters} onSave={addCourse} onClose={() => setAddingCourse(false)} />
      )}
      {addingForSemester && (
        <CourseModal
          initial={{ semesterId: addingForSemester }}
          semesters={semesters}
          onSave={draft => { addCourse(draft); setAddingForSemester(null) }}
          onClose={() => setAddingForSemester(null)}
        />
      )}
      {editingCourse && (
        <CourseModal
          initial={editingCourse}
          semesters={semesters}
          onSave={draft => updateCourse(editingCourse.id, draft)}
          onClose={() => setEditingCourse(null)}
        />
      )}
      </div>
    </div>{/* end left scroll column */}

    {/* ── RIGHT: AI assistant sidebar ── */}
    <DegreeChatSidebar />

    </div>
  )
}
