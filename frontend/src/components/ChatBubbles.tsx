import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types"

export function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2.5 text-[13px] leading-relaxed text-background">
        {msg.content}
      </div>
    )
  }
  return (
    <div className={cn(
      "self-start max-w-[92%] rounded-2xl rounded-bl-sm border bg-muted/50 px-3.5 py-2.5",
      "prose text-[13px] text-foreground"
    )}>
      <ReactMarkdown>{msg.content || "…"}</ReactMarkdown>
    </div>
  )
}

export function ToolPill({ label }: { label: string }) {
  return <div className="self-center text-[11px] text-muted-foreground py-0.5">{label}</div>
}
