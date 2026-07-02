import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatBubble, ToolPill } from "@/components/ChatBubbles"
import { GlassButton } from "@/components/GlassButton"
import { Clock, Play, RefreshCw, Zap, Bot } from "lucide-react"
import type { AgentRecord, ChatMessage } from "@/types"

// ── Types ──────────────────────────────────────────────────────

interface Automation {
  key: string
  name: string
  description: string
  enabled: boolean
  hour: number
  minute: number
  last_run: string | null
  last_status: string | null
}

// ── Helpers ────────────────────────────────────────────────────

function fmtTime(h: number, m: number) {
  const ampm = h >= 12 ? "PM" : "AM"
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`
}

function fmtLastRun(iso: string | null) {
  if (!iso) return "Never"
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " at " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// ── Automation card ────────────────────────────────────────────

function AutomationCard({ auto, onUpdate }: { auto: Automation; onUpdate: () => void }) {
  const [editingTime, setEditingTime] = useState(false)
  const [hour, setHour] = useState(auto.hour)
  const [minute, setMinute] = useState(auto.minute)
  const [running, setRunning] = useState(false)

  async function toggleEnabled() {
    await fetch(`/api/automations/${auto.key}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !auto.enabled }),
    })
    onUpdate()
  }

  async function saveTime() {
    await fetch(`/api/automations/${auto.key}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hour, minute }),
    })
    setEditingTime(false)
    onUpdate()
  }

  async function runNow() {
    setRunning(true)
    await fetch(`/api/automations/${auto.key}/run`, { method: "POST" })
    setTimeout(() => { setRunning(false); onUpdate() }, 3000)
  }

  const statusOk  = auto.last_status === "success"
  const statusErr = auto.last_status?.startsWith("error")

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${auto.enabled ? "bg-green-500" : "bg-[#d0d0d0]"}`} />
              <span className="text-[15px] font-semibold text-[#1d1d1f]">{auto.name}</span>
              <Badge variant={auto.enabled ? "secondary" : "outline"} className="text-[10px]">
                {auto.enabled ? "Active" : "Paused"}
              </Badge>
            </div>

            <p className="text-[13px] text-[#7a7a7a] leading-snug pl-[18px]">{auto.description}</p>

            {/* Schedule row */}
            <div className="pl-[18px] flex items-center gap-4 flex-wrap">
              {!editingTime ? (
                <button
                  onClick={() => setEditingTime(true)}
                  className="flex items-center gap-1.5 text-[13px] text-[#1d1d1f] hover:text-[#2c4470] transition-colors"
                >
                  <Clock size={13} className="text-[#7a7a7a]" />
                  <span>Daily at <span className="font-medium">{fmtTime(auto.hour, auto.minute)}</span></span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-[#7a7a7a]" />
                  <span className="text-[13px] text-[#7a7a7a]">Daily at</span>
                  <input
                    type="number" min={0} max={23}
                    value={hour}
                    onChange={e => setHour(Number(e.target.value))}
                    className="w-12 text-center text-[13px] border border-[#e0e0e0] rounded-[6px] px-1.5 py-1 outline-none focus:border-[#2c4470]"
                  />
                  <span className="text-[13px] text-[#7a7a7a]">:</span>
                  <input
                    type="number" min={0} max={59}
                    value={minute}
                    onChange={e => setMinute(Number(e.target.value))}
                    className="w-12 text-center text-[13px] border border-[#e0e0e0] rounded-[6px] px-1.5 py-1 outline-none focus:border-[#2c4470]"
                  />
                  <button onClick={saveTime} className="text-[12px] font-semibold text-[#2c4470] hover:text-[#1e3560]">Save</button>
                  <button onClick={() => setEditingTime(false)} className="text-[12px] text-[#7a7a7a] hover:text-[#1d1d1f]">Cancel</button>
                </div>
              )}

              {/* Last run */}
              <span className="flex items-center gap-1.5 text-[12px] text-[#7a7a7a]">
                <RefreshCw size={11} />
                Last run: <span className={statusOk ? "text-green-600" : statusErr ? "text-red-500" : ""}>{fmtLastRun(auto.last_run)}</span>
                {auto.last_status && !statusOk && (
                  <span className="text-[11px] text-[#7a7a7a]">({auto.last_status})</span>
                )}
              </span>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={toggleEnabled}>
              {auto.enabled ? "Pause" : "Enable"}
            </Button>
            <button
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-1.5 text-[12px] text-[#2c4470] hover:text-[#1e3560] disabled:text-[#b0b0b0] transition-colors"
            >
              <Play size={11} />
              {running ? "Running…" : "Run now"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = { web_search: "Web search", email: "Email access" }

export default function Agents() {
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [autoError, setAutoError] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [prompt, setPrompt] = useState("")
  const [toolWeb, setToolWeb] = useState(false); const [toolEmail, setToolEmail] = useState(false)

  const [chatAgentId, setChatAgentId] = useState<number | null>(null)
  const [chatAgentName, setChatAgentName] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState(""); const [sending, setSending] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const historyRef = useRef<ChatMessage[]>([])
  const msgsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, toolActivity])

  async function loadAll() {
    const [autoResp, agentResp] = await Promise.all([
      fetch("/api/automations"),
      fetch("/api/agents/list"),
    ])
    const [autoJson, agentJson] = await Promise.all([autoResp.json(), agentResp.json()])
    if (!autoResp.ok) {
      setAutoError(true)
      setAutomations([])
    } else {
      setAutoError(false)
      setAutomations(autoJson.automations ?? [])
    }
    setAgents(agentJson.agents ?? [])
  }

  async function create() {
    if (!name.trim()) return
    const tools: string[] = []
    if (toolWeb) tools.push("web_search")
    if (toolEmail) tools.push("email")
    await fetch("/api/agents/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: desc, tools, system_prompt: prompt }) })
    setName(""); setDesc(""); setPrompt(""); setToolWeb(false); setToolEmail(false); setShowForm(false)
    loadAll()
  }

  async function toggle(id: number, active: boolean) {
    await fetch(`/api/agents/${id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: active }) })
    loadAll()
  }

  async function remove(id: number) {
    if (id === chatAgentId) closeChat()
    await fetch(`/api/agents/${id}`, { method: "DELETE" })
    loadAll()
  }

  function openChat(id: number, agentName: string) {
    setChatAgentId(id); setChatAgentName(agentName)
    setMessages([]); historyRef.current = []; setInput("")
    setTimeout(() => msgsEndRef.current?.scrollIntoView(), 50)
  }

  function closeChat() { setChatAgentId(null) }

  async function send() {
    if (!input.trim() || sending || !chatAgentId) return
    const text = input; setInput(""); setSending(true)
    const userMsg: ChatMessage = { role: "user", content: text }
    historyRef.current = [...historyRef.current, userMsg]
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }])
    let aiText = ""
    try {
      const res = await fetch(`/api/agents/${chatAgentId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: historyRef.current }) })
      const reader = res.body!.getReader(), decoder = new TextDecoder()
      const TOOL_PILLS: Record<string, string> = { search_web: "🔍 Searching web…", get_recent_emails_a: "📬 Fetching emails…", get_email_content_a: "📧 Reading email…" }
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const m = JSON.parse(line.slice(6))
            if (m.done) break
            if (m.tool) setToolActivity(TOOL_PILLS[m.tool] ?? `⚙️ ${m.tool}…`)
            if (m.text) { setToolActivity(null); aiText += m.text; setMessages(prev => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: aiText }; return c }) }
          } catch {}
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setMessages(prev => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: `Error: ${err}` }; return c })
    }
    if (aiText) historyRef.current = [...historyRef.current, { role: "assistant", content: aiText }]
    setToolActivity(null); setSending(false)
  }

  return (
    <div className="space-y-8">

      {/* ── Scheduled Automations ── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Zap size={14} className="text-[#7a7a7a]" />
          Scheduled Automations
        </h2>
        {autoError ? (
          <div className="rounded-[10px] border border-[#e0e0e0] bg-[#fafafa] px-4 py-3.5 space-y-1">
            <p className="text-[13px] font-medium text-[#1d1d1f]">Backend restart required</p>
            <p className="text-[12px] text-[#7a7a7a]">New automation routes were added. Restart the server then refresh this page.</p>
          </div>
        ) : automations === null ? (
          <p className="text-[13px] text-[#7a7a7a] py-2 animate-pulse">Loading…</p>
        ) : automations.length === 0 ? (
          <p className="text-[13px] text-[#7a7a7a] py-2">No automations configured.</p>
        ) : (
          automations.map(a => <AutomationCard key={a.key} auto={a} onUpdate={loadAll} />)
        )}
      </div>

      <Separator />

      {/* ── Custom Agents ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Bot size={14} className="text-[#7a7a7a]" />
            Custom Agents
          </h2>
          <GlassButton onClick={() => setShowForm(v => !v)}>
            {showForm ? "Cancel" : "New Agent"}
          </GlassButton>
        </div>

        {showForm && (
          <Card>
            <CardHeader><CardTitle>Create Agent</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input placeholder="e.g. Research assistant" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description <span className="text-muted-foreground/50">(optional)</span></Label>
                  <Input placeholder="What this agent does" value={desc} onChange={e => setDesc(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tools</Label>
                <div className="flex gap-5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={toolWeb} onCheckedChange={v => setToolWeb(!!v)} />
                    Web search
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={toolEmail} onCheckedChange={v => setToolEmail(!!v)} />
                    Email access
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>System prompt <span className="text-muted-foreground/50">(optional)</span></Label>
                <Textarea placeholder="You are a helpful assistant that…" value={prompt} onChange={e => setPrompt(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <GlassButton onClick={create}>Create Agent</GlassButton>
              </div>
            </CardContent>
          </Card>
        )}

        {agents.length === 0 && !showForm && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No custom agents yet — click New Agent to create one.
          </p>
        )}

        <div className="space-y-2">
          {agents.map(ag => (
            <Card key={ag.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${ag.is_active ? "bg-foreground" : "bg-border"}`} />
                      <span className="text-[14px] font-semibold">{ag.name}</span>
                      <Badge variant={ag.is_active ? "secondary" : "outline"} className="text-[10px]">
                        {ag.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {ag.description && <p className="text-xs text-muted-foreground pl-4">{ag.description}</p>}
                    {ag.tools.length > 0 && (
                      <div className="flex gap-1.5 pl-4 flex-wrap">
                        {ag.tools.map(t => <Badge key={t} variant="outline" className="text-[10px]">{TOOL_LABELS[t] ?? t}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="ghost" onClick={() => toggle(ag.id, !ag.is_active)}>
                      {ag.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <GlassButton onClick={() => openChat(ag.id, ag.name)}>Chat</GlassButton>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(ag.id)}>Delete</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Agent chat */}
      {chatAgentId !== null && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold">Chat with {chatAgentName}</p>
              <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={closeChat}>Close</Button>
            </div>
            <Card>
              <CardContent className="p-3">
                <ScrollArea className="h-[260px]">
                  <div className="flex flex-col gap-2 p-1">
                    {messages.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-8">Send a message to start.</p>
                    )}
                    {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
                    {toolActivity && <ToolPill label={toolActivity} />}
                    <div ref={msgsEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Input
                placeholder="Message the agent…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                disabled={sending}
              />
              <GlassButton onClick={send} disabled={sending}>Send</GlassButton>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
