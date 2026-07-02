import { useState, useRef, useCallback } from "react"
import type { ChatMessage } from "@/types"

const TOOL_LABELS: Record<string, string> = {
  search_web:           "🔍 Searching web…",
  get_recent_emails:    "📬 Fetching emails…",
  get_email_content:    "📧 Reading email…",
  search_inbox:         "📬 Searching inbox…",
  read_email:           "📧 Reading email…",
  list_attachments:     "📎 Listing attachments…",
  download_attachment:  "⬇️ Downloading attachment…",
  draft_email:          "✍️ Drafting email…",
  send_email:           "📤 Sending email…",
  execute:              "⚙️ Running code…",
  read_file:            "📄 Reading file…",
  write_file:           "💾 Writing file…",
  edit_file:            "✏️ Editing file…",
  ls:                   "📁 Listing files…",
  write_todos:          "📝 Planning…",
  glob:                 "🔎 Searching files…",
  grep:                 "🔎 Searching content…",
  task:                 "⚙️ Running subtask…",
}

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? `⚙️ ${name.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}…`
}

export interface InterruptData {
  tool: string
  thread_id: string
  draft: Record<string, unknown>
}

interface UseSSEChatOptions {
  onTool?: (tool: string, detail?: string) => void
  onToolDone?: (tool: string) => void
  onInterrupt?: (data: InterruptData) => void
  onContactCreated?: () => void
}

export function useSSEChat(
  endpoint: string | (() => string),
  options: UseSSEChatOptions = {},
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const historyRef = useRef<ChatMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string, attachments: string[] = [], thread_id = "") => {
    if (!text.trim() || streaming) return
    const url = typeof endpoint === "function" ? endpoint() : endpoint
    if (!url) return

    const userMsg: ChatMessage = { role: "user", content: text }
    historyRef.current = [...historyRef.current, userMsg]
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }])
    setStreaming(true)
    setToolActivity(null)

    let aiText = ""
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const body: Record<string, unknown> = { messages: historyRef.current }
      if (attachments.length > 0) body.attachments = attachments
      if (thread_id) body.thread_id = thread_id
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.done) break outer
            if (msg.tool) {
              setToolActivity(toolLabel(msg.tool))
              options.onTool?.(msg.tool, msg.detail)
            }
            if (msg.tool_done) {
              options.onToolDone?.(msg.tool_done)
            }
            if (msg.contact_created) {
              options.onContactCreated?.()
            }
            if (msg.interrupt) {
              options.onInterrupt?.({
                tool: msg.interrupt,
                thread_id: msg.thread_id,
                draft: msg.draft ?? {},
              })
              break outer
            }
            if (msg.text) {
              setToolActivity(null)
              aiText += msg.text
              setMessages(prev => {
                const copy = [...prev]
                copy[copy.length - 1] = { role: "assistant", content: aiText }
                return copy
              })
            }
          } catch {}
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // user stopped — keep whatever text was streamed, no error message
      } else {
        const err = e instanceof Error ? e.message : String(e)
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: "assistant", content: `Error: ${err}` }
          return copy
        })
      }
    } finally {
      abortRef.current = null
    }

    if (aiText) historyRef.current = [...historyRef.current, { role: "assistant", content: aiText }]
    setStreaming(false)
    setToolActivity(null)
  }, [endpoint, streaming, options])

  // Stream the resume response after user approves/rejects an interrupt
  const resume = useCallback(async (
    thread_id: string,
    approved: boolean,
    onTool: (t: string, detail?: string) => void,
    onToolDone: (t: string) => void,
  ) => {
    setStreaming(true)
    setToolActivity(null)
    let aiText = ""

    try {
      const res = await fetch("/api/deep-chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id, approved }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.done) break outer
            if (msg.tool) {
              setToolActivity(toolLabel(msg.tool))
              onTool(msg.tool, msg.detail)
            }
            if (msg.tool_done) onToolDone(msg.tool_done)
            if (msg.text) {
              setToolActivity(null)
              aiText += msg.text
              setMessages(prev => {
                const copy = [...prev]
                copy[copy.length - 1] = { role: "assistant", content: aiText }
                return copy
              })
            }
          } catch {}
        }
      }
    } catch {}

    if (aiText) historyRef.current = [...historyRef.current, { role: "assistant", content: aiText }]
    setStreaming(false)
    setToolActivity(null)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    historyRef.current = []
    setToolActivity(null)
  }, [])

  return { messages, streaming, toolActivity, send, resume, stop, reset }
}
