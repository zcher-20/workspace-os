import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ChatBubble, ToolPill } from "@/components/ChatBubbles"
import { GlassButton } from "@/components/GlassButton"
import type { EmailItem, ChatMessage } from "@/types"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"

// Markdown components matching the chat style
const MD: Record<string, React.ComponentType<any>> = {
  h1: ({ children }) => <h1 className="text-[18px] font-bold mt-4 mb-2 leading-tight text-[#1d1d1f]">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[16px] font-bold mt-3 mb-1.5 leading-tight text-[#1d1d1f]">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[14px] font-bold mt-2 mb-1 leading-tight text-[#1d1d1f]">{children}</h3>,
  p:  ({ children }) => <p className="mb-2.5 last:mb-0 leading-[1.6] text-[14px]">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-[#1d1d1f]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  u: ({ children }: any) => <u className="underline underline-offset-2">{children}</u>,
  del: ({ children }) => <del className="line-through text-[#7a7a7a]">{children}</del>,
  ul: ({ children }) => <ul className="list-disc ml-5 mb-2.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-5 mb-2.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.6] text-[14px]">{children}</li>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-[#2c4470] underline underline-offset-2 hover:text-[#1e3560] break-all">{children}</a>,
  code: ({ inline, children }: any) => inline
    ? <code className="bg-[#f5f5f7] border border-[#e0e0e0] px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>
    : <code className="text-[12px] font-mono">{children}</code>,
  pre: ({ children }) => <pre className="bg-[#f5f5f7] border border-[#e0e0e0] rounded-lg px-4 py-3 overflow-x-auto text-[12px] font-mono mb-2.5 whitespace-pre">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="border-l-[3px] border-[#e0e0e0] pl-4 text-[#7a7a7a] my-2 italic">{children}</blockquote>,
}

export default function EmailInbox() {
  const [connected, setConnected] = useState(false)
  const [provider, setProvider] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [statusMsg, setStatusMsg] = useState("")
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [selected, setSelected] = useState<{ subject: string; sender: string; date: string; body: string } | null>(null)
  const [fetchingEmail, setFetchingEmail] = useState(false)
  const [result, setResult] = useState("")
  const [resultLoading, setResultLoading] = useState(false)
  const [question, setQuestion] = useState("")

  useEffect(() => {
    checkStatus()
    window.addEventListener("message", handleOAuthMsg)
    return () => window.removeEventListener("message", handleOAuthMsg)
  }, [])

  async function checkStatus() {
    const d = await (await fetch("/api/email/status")).json()
    if (d.connected) applyConnected(d)
  }

  function applyConnected(d: { provider: string; email: string }) {
    setConnected(true)
    setProvider(d.provider === "google" ? "Google" : "Microsoft")
    setUserEmail(d.email)
    setStatusMsg("")
    loadEmails()
  }

  async function handleOAuthMsg(e: MessageEvent) {
    if (e.data === "google_connected" || e.data === "microsoft_connected") {
      const d = await (await fetch("/api/email/status")).json()
      if (d.connected) applyConnected(d)
    }
  }

  async function signIn(provider: "google" | "microsoft") {
    setStatusMsg(`Opening ${provider === "google" ? "Google" : "Microsoft"} sign-in…`)
    const d = await (await fetch(`/api/email/${provider}/auth`)).json()
    if (d.ok) window.open(d.url, `${provider}_auth`, "width=500,height=600")
    else setStatusMsg(d.error)
  }

  async function disconnect() {
    await fetch("/api/email/disconnect", { method: "POST" })
    setConnected(false); setEmails([]); setSelected(null)
  }

  async function loadEmails() {
    setListLoading(true)
    const d = await (await fetch("/api/email/list?limit=15")).json()
    setListLoading(false)
    if (d.ok) setEmails(d.messages)
  }

  async function fetchEmail(uid: string) {
    if (fetchingEmail) return
    setFetchingEmail(true); setResult("")
    const d = await (await fetch(`/api/email/fetch/${uid}`, { method: "POST" })).json()
    setFetchingEmail(false)
    if (d.ok) setSelected({ subject: d.subject, sender: d.sender, date: d.date, body: d.body })
  }

  async function stream(url: string, body: object, label: string) {
    setResultLoading(true); setResult("")
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      const d = await res.json(); setResult(d.content ?? d.error ?? ""); setResultLoading(false); return
    }
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
    void label
  }

  return (
    <div className="space-y-6">
      {/* Connection card */}
      <Card>
        <CardContent className="py-5">
          {!connected ? (
            <div className="space-y-2">
              <button
                onClick={() => signIn("google")}
                className="flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.07 24.07 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in with Google
              </button>
              <button
                onClick={() => signIn("microsoft")}
                className="flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <svg width="16" height="16" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                Sign in with Microsoft
              </button>
              {statusMsg && <p className="text-xs text-muted-foreground">{statusMsg}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Connected via <span className="font-medium text-foreground">{provider}</span> — {userEmail}
              </p>
              <Button variant="outline" size="sm" onClick={disconnect}>Disconnect</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {connected && (
        <div className="grid grid-cols-[300px_1fr] gap-6 items-start mt-8">
          {/* Inbox list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-tight">Primary</span>
              <Button variant="ghost" size="sm" onClick={loadEmails} className="h-6 px-2 text-xs">
                Refresh
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-2 pr-2">
                {listLoading && <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>}
                {!listLoading && emails.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No emails</p>
                )}
                {emails.map(msg => (
                  <button
                    key={msg.uid}
                    onClick={() => fetchEmail(msg.uid)}
                    className="w-full text-left rounded-[11px] border bg-white px-4 py-4 transition-colors hover:bg-[#f5f5f7] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#1d1d1f] leading-snug">
                        {msg.subject || "(no subject)"}
                      </p>
                      <p className="truncate text-[12px] text-[#7a7a7a] mt-1">{msg.sender}</p>
                    </div>
                    {msg.has_attachments && (
                      <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{msg.attachment_names.length}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Email preview + actions */}
          <div className="space-y-4 min-w-0 overflow-hidden">
            {fetchingEmail && <p className="text-xs text-muted-foreground py-2">Loading email…</p>}

            {selected && (
              <>
                <Card>
                  <CardContent className="pt-5 pb-5 space-y-3">
                    <div>
                      <p className="text-[16px] font-bold text-[#1d1d1f] leading-snug">{selected.subject}</p>
                      <p className="text-[13px] text-[#7a7a7a] mt-1">{selected.sender} · {selected.date}</p>
                    </div>
                    <Separator />
                    <ScrollArea className="h-[320px]">
                      <div className="pr-2 text-[14px] text-[#1d1d1f] leading-[1.6] break-words overflow-wrap-anywhere">
                        <ReactMarkdown
                          components={MD}
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                        >
                          {selected.body}
                        </ReactMarkdown>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <GlassButton onClick={() => stream("/api/summarize", {}, "Summary")}>Summarize</GlassButton>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Ask a question about the email"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { stream("/api/ask", { question }, question); setQuestion("") } }}
                  />
                  <GlassButton onClick={() => { stream("/api/ask", { question }, question); setQuestion("") }}>Ask</GlassButton>
                </div>
              </>
            )}

            {(resultLoading || result) && (
              <Card>
                <CardContent className="pt-5 pb-5">
                  {resultLoading && <p className="text-xs text-muted-foreground animate-pulse">Thinking…</p>}
                  {result && (
                    <ReactMarkdown
                      components={MD}
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                    >
                      {result}
                    </ReactMarkdown>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// re-export so App can import ChatBubble etc.
export { ChatBubble, ToolPill }
