import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { BarChart2, Mail, FileText, Cpu, Users, MessageSquare, CalendarDays } from "lucide-react"
import Summary from "@/components/sections/Summary"
import EmailInbox from "@/components/sections/EmailInbox"
import Documents from "@/components/sections/Documents"
import Agents from "@/components/sections/Agents"
import Contacts from "@/components/sections/Contacts"
import Chat from "@/components/sections/Chat"
import RightPanel from "@/components/RightPanel"
import { CommandPalette } from "@/components/CommandPalette"
import type { Section } from "@/types"

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "summary",  label: "Summary",      icon: <BarChart2 size={15} /> },
  { id: "chat",     label: "Chat",         icon: <MessageSquare size={15} /> },
  { id: "email",    label: "Email Inbox",  icon: <Mail size={15} /> },
  { id: "agents",   label: "Agents",       icon: <Cpu size={15} /> },
  { id: "upload",   label: "Documents",    icon: <FileText size={15} /> },
  { id: "contacts", label: "Contacts",     icon: <Users size={15} /> },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening"
}

export default function App() {
  const [section, setSection] = useState<Section>("summary")
  const [userName, setUserName] = useState("")

  useEffect(() => {
    fetch("/api/email/status")
      .then(r => r.json())
      .then(d => { if (d.connected && d.name) setUserName(d.name) })
      .catch(() => {})
  }, [])

  const isChat = section === "chat"

  return (
    <div className="flex h-full">
      <CommandPalette />
      {/* Sidebar */}
      <aside className="flex flex-col w-[220px] shrink-0 border-r pt-4 pb-6 bg-[#f5f5f7]">
        <p className="px-4 pb-4 text-[14px] font-semibold tracking-tight text-[#1d1d1f]">Enterprise Agent</p>
        <nav className="flex flex-col gap-0.5 flex-1 px-1">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-[13px] transition-all duration-150 text-left w-full rounded-md",
                section === n.id
                  ? "text-[#2c4470] font-semibold bg-white"
                  : "text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-white/70"
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <Separator className="mb-4" />
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
          className="mx-3 flex items-center justify-between rounded-[8px] border border-[#e0e0e0] bg-white/60 px-3 py-2 text-[11px] text-[#7a7a7a] hover:bg-white hover:text-[#1d1d1f] transition-colors"
        >
          <span>Search & commands</span>
          <kbd className="font-mono text-[10px] bg-[#f0f0f0] border border-[#e0e0e0] rounded px-1 py-0.5">⌘K</kbd>
        </button>
      </aside>

      {/* Main */}
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {!isChat && section !== "upload" && (() => {
          if (section === "contacts") return (
            <div className="px-8 pt-12 pb-10 shrink-0 flex items-center justify-center">
              <h1 className="text-[22px] font-bold tracking-tight leading-none">Contacts</h1>
            </div>
          )
          const pageTitle =
            section === "agents"   ? "AI Agents" :
            section === "email"    ? "Email Inbox" :
            `${greeting()}${userName ? `, ${userName}` : ""}`
          return (
            <div className="flex items-start justify-between px-8 pt-12 pb-10 shrink-0">
              <h1 className="text-[22px] font-bold tracking-tight leading-none">{pageTitle}</h1>
              <div className="flex items-center gap-1.5 text-[22px] font-bold tracking-tight leading-none text-[#7a7a7a]">
                <CalendarDays size={18} strokeWidth={2.5} />
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
          )
        })()}
        {!isChat && section === "upload" && (
          <div className="px-8 pt-12 pb-10 shrink-0 flex items-center justify-center">
            <h1 className="text-[22px] font-bold tracking-tight leading-none">Document Processor</h1>
          </div>
        )}
        {isChat ? (
          <Chat />
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-8 pb-16">
              {section === "summary"  && <Summary />}
              {section === "contacts" && <Contacts />}
              {section === "agents"   && <Agents />}
              {/* EmailInbox stays mounted so it loads once and is instant on re-visit */}
              <div className={section === "email" ? undefined : "hidden"}>
                <EmailInbox />
              </div>
              {section === "upload"   && <Documents />}
            </div>
          </ScrollArea>
        )}
      </main>

      {/* Right panel — hidden on Chat page */}
      {!isChat && <RightPanel onOpenChat={() => setSection("chat")} />}
    </div>
  )
}
