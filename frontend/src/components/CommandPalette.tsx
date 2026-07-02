import { useEffect, useState, useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Search, Mail, FileText, Clock, MessageSquare, Calendar, Zap, ArrowRight } from "lucide-react"

const COMMANDS = [
  { icon: Zap,           label: "Ask AI",              hint: "Chat with your assistant",        group: "AI" },
  { icon: Mail,          label: "Find email",           hint: "Search your inbox",               group: "Email" },
  { icon: MessageSquare, label: "Draft reply",          hint: "AI-drafted response to an email", group: "Email" },
  { icon: FileText,      label: "Search documents",     hint: "Find files in your workspace",    group: "Documents" },
  { icon: Calendar,      label: "Schedule meeting",     hint: "Book time on your calendar",      group: "Calendar" },
  { icon: Clock,         label: "Create reminder",      hint: "Set a task or reminder",          group: "Tasks" },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const filtered = COMMANDS.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.hint.toLowerCase().includes(query.toLowerCase()) ||
    c.group.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setSelected(0) }, [query])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === "Enter" && filtered[selected]) { close() }
  }

  function close() { setOpen(false); setQuery("") }

  return (
    <Dialog.Root open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery("") }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/25 backdrop-blur-[3px] z-50 animate-in fade-in-0 duration-150" />
        <Dialog.Content
          className="fixed top-[22%] left-1/2 -translate-x-1/2 w-[560px] max-w-[90vw] rounded-[18px] bg-white border border-[#e0e0e0] shadow-[0_24px_64px_rgba(0,0,0,0.15)] z-50 overflow-hidden"
          onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus() }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f0f0]">
            <Search size={16} className="text-[#7a7a7a] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search commands, emails, documents…"
              className="flex-1 bg-transparent text-[15px] text-[#1d1d1f] placeholder:text-[#b0b0b0] outline-none"
            />
            <kbd className="text-[11px] text-[#7a7a7a] bg-[#f5f5f7] border border-[#e8e8e8] rounded-[5px] px-1.5 py-0.5 font-mono shrink-0">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="py-1.5 max-h-[340px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[#7a7a7a]">
                No results for "<span className="text-[#1d1d1f]">{query}</span>"
              </p>
            ) : (
              filtered.map((cmd, i) => (
                <button
                  key={cmd.label}
                  onClick={close}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full flex items-center gap-3.5 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? "bg-[#f5f5f7]" : "hover:bg-[#fafafa]"
                  }`}
                >
                  <div className={`p-1.5 rounded-[8px] shrink-0 ${i === selected ? "bg-[#2c4470]/10" : "bg-[#f0f0f0]"}`}>
                    <cmd.icon size={14} className={i === selected ? "text-[#2c4470]" : "text-[#7a7a7a]"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1d1d1f] leading-snug">{cmd.label}</p>
                    <p className="text-[12px] text-[#7a7a7a]">{cmd.hint}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-medium text-[#7a7a7a] bg-[#f0f0f0] rounded-full px-2 py-0.5 uppercase tracking-wide">
                      {cmd.group}
                    </span>
                    {i === selected && <ArrowRight size={13} className="text-[#2c4470]" />}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#f0f0f0] bg-[#fafafa]">
            <div className="flex items-center gap-4 text-[11px] text-[#b0b0b0]">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> select</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#b0b0b0]">
              open with
              <kbd className="font-mono bg-[#f0f0f0] border border-[#e0e0e0] rounded-[4px] px-1.5 py-0.5 ml-1">⌘K</kbd>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
