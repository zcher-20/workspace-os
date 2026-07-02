import { useRef, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatBubble, ToolPill } from "@/components/ChatBubbles"
import { useSSEChat } from "@/hooks/useSSEChat"
import { RotateCcw, Send, Square, ArrowUpRight } from "lucide-react"

const SUGGESTIONS = [
  "Summarize today's emails",
  "Draft a reply",
  "Find urgent messages",
]

export default function RightPanel({ onOpenChat }: { onOpenChat?: () => void }) {
  const [input, setInput] = useState("")
  const { messages, streaming, toolActivity, send, stop, reset } = useSSEChat("/api/chat", {
    onContactCreated: () => window.dispatchEvent(new CustomEvent("contact:created")),
  })
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, toolActivity])

  function submit(text?: string) {
    const msg = text ?? input
    if (msg.trim()) { send(msg); setInput("") }
  }

  const isEmpty = messages.length === 0

  return (
    <aside
      className="flex flex-col border-l w-[360px] shrink-0"
      style={{
        background: "linear-gradient(160deg, #ffffff 0%, rgba(238,236,255,0.55) 55%, rgba(220,225,255,0.45) 100%)",
        boxShadow: "inset -1px 0 0 rgba(210,205,240,0.3), inset 0 0 60px rgba(150,130,220,0.04)",
      }}
    >
      {/* Header — only shown when conversation is active */}
      {!isEmpty && (
        <div className="px-6 pt-12 pb-10 shrink-0 flex items-start justify-between">
          <p className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">AI Assistant</p>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenChat}
              title="Open full chat"
              className="p-1.5 rounded-lg text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-black/5 transition-colors"
            >
              <ArrowUpRight size={13} />
            </button>
            <button
              onClick={reset}
              disabled={streaming}
              title="New conversation"
              className="p-1.5 rounded-lg text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-black/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isEmpty ? (
        /* Hero empty state — vertically centered */
        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-4 gap-6">
          {/* Hero */}
          <div className="text-center space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <p className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">AI Assistant</p>
              <button
                onClick={onOpenChat}
                title="Open full chat"
                className="p-1 rounded-lg text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-black/5 transition-colors mt-0.5"
              >
                <ArrowUpRight size={15} />
              </button>
            </div>
            <p className="text-[13px] text-[#7a7a7a]">Ask anything about your inbox or workspace.</p>
          </div>

          {/* Suggestions — stacked, single-line pills, centered */}
          <div className="flex flex-col items-center gap-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => submit(s)}
                disabled={streaming}
                className="whitespace-nowrap text-[11px] font-medium text-foreground/60 px-3.5 py-1.5 rounded-full transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: "rgba(255,255,255,0.65)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.85)",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07), inset 0 0 0 0.5px rgba(255,255,255,0.75)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.88)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.65)")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-4">
            {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {toolActivity && <ToolPill label={toolActivity} />}
            <div ref={endRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input */}
      <div className="p-3 shrink-0">
        <div className="flex items-center gap-2 rounded-full bg-white border border-[#e0e0e0] px-4 py-2.5 h-11 focus-within:border-[#2c4470]/50 transition-colors">
          <input
            className="flex-1 bg-transparent text-[14px] text-[#1d1d1f] placeholder:text-[#b0b0b0] outline-none min-w-0"
            placeholder="Ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
            disabled={streaming}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="text-[#2c4470] hover:text-[#1e3560] transition-colors"
              title="Stop"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!input.trim()}
              className="text-[#2c4470] hover:text-[#1e3560] disabled:text-[#d0d0d0] transition-colors"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
