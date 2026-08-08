import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { BarChart2, Mail, FileText, Cpu, MessageSquare, CalendarDays, Archive, UserRound, Briefcase, FolderOpen, GraduationCap, CheckSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Summary from "@/components/sections/Summary"
import EmailInbox from "@/components/sections/EmailInbox"
import Documents from "@/components/sections/Documents"
import Agents from "@/components/sections/Agents"
import Contacts from "@/components/sections/Contacts"
import Chat from "@/components/sections/Chat"
import Collection from "@/components/sections/Collection"
import People from "@/components/sections/People"
import Opportunities from "@/components/sections/Opportunities"
import Projects from "@/components/sections/Projects"
import Degree from "@/components/sections/Degree"
import Tasks from "@/components/sections/Tasks"
import ArchiveHome from "@/components/sections/ArchiveHome"
import RightPanel from "@/components/RightPanel"
import { CommandPalette } from "@/components/CommandPalette"
import type { Section } from "@/types"

const WORKSPACE_NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "summary",  label: "Summary",      icon: <BarChart2 size={15} /> },
  { id: "email",    label: "Email Inbox",  icon: <Mail size={15} /> },
  { id: "chat",     label: "Chat",         icon: <MessageSquare size={15} /> },
]

const ARCHIVE_NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "archive-home",  label: "Home",           icon: <BarChart2 size={15} /> },
  { id: "collection",    label: "Collection",     icon: <Archive size={15} /> },
  { id: "projects",      label: "Projects",       icon: <FolderOpen size={15} /> },
  { id: "opportunities", label: "Opportunities",  icon: <Briefcase size={15} /> },
  { id: "people",        label: "Network",        icon: <UserRound size={15} /> },
  { id: "degree",        label: "Degree Planner", icon: <GraduationCap size={15} /> },
  { id: "chat",          label: "Chat",           icon: <MessageSquare size={15} /> },
]

const ARCHIVE_SECTIONS: Section[] = ["collection", "projects", "opportunities", "people", "degree", "archive-home", "tasks"]

const PAGE_TITLES: Partial<Record<Section, string>> = {
  agents:        "AI Agents",
  email:         "Email Inbox",
  contacts:      "Contacts",
  upload:        "Documents",
  people:        "People, Organizations, & Events",
  opportunities: "Opportunities",
  projects:      "Projects",
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening"
}

function NavButton({ id, label, icon, active, onClick }: { id: Section; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-[13px] transition-all duration-150 text-left w-full rounded-md",
        active
          ? "text-[#2c4470] font-semibold bg-white"
          : "text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-white/70"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export default function App() {
  const [section, setSection] = useState<Section>("archive-home")
  const [userName, setUserName] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    fetch("/api/email/status")
      .then(r => r.json())
      .then(d => { if (d.connected && d.name) setUserName(d.name) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onNavigate(e: Event) {
      const target = (e as CustomEvent<string>).detail as Section
      if (target) setSection(target)
    }
    window.addEventListener("workspace:navigate", onNavigate)
    return () => window.removeEventListener("workspace:navigate", onNavigate)
  }, [])

  const isChat = section === "chat"
  const isArchive = ARCHIVE_SECTIONS.includes(section)
  const isCollection    = section === "collection"
  const isProjects      = section === "projects"
  const isOpportunities = section === "opportunities"
  const isArchiveHome   = section === "archive-home"
  const isDegree        = section === "degree"
  const isTasks         = section === "tasks"
  const isFullBleed     = isCollection || isProjects || isOpportunities || isArchiveHome || isDegree || isTasks

  const pageTitle = section === "summary"
    ? `${greeting()}${userName ? `, ${userName}` : ""}`
    : PAGE_TITLES[section] ?? ""

  return (
    <div className="flex h-full">
      <CommandPalette />

      {/* Sidebar */}
      <aside className={`flex flex-col shrink-0 border-r pb-6 bg-[#f5f5f7] overflow-hidden transition-all duration-200 ${sidebarOpen ? "w-[220px] pt-4" : "w-12 pt-4 items-center"}`}>
        {sidebarOpen ? (
          <div className="flex items-center justify-between px-4 pb-4">
            <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f]">Zayneb's Workspace</p>
            <button onClick={() => setSidebarOpen(false)} className="text-[#c0c0c0] hover:text-[#5a5a5a] transition-colors">
              <PanelLeftClose size={15} />
            </button>
          </div>
        ) : (
          <button onClick={() => setSidebarOpen(true)} className="mb-4 text-[#c0c0c0] hover:text-[#5a5a5a] transition-colors">
            <PanelLeftOpen size={15} />
          </button>
        )}

        {sidebarOpen && <div className="h-3" />}

        {/* Nav */}
        {sidebarOpen && (
          <nav className="flex flex-col gap-0.5 px-1 flex-1">
            {ARCHIVE_NAV.map(n => (
              <NavButton key={n.id} {...n} active={section === n.id} onClick={() => setSection(n.id)} />
            ))}
          </nav>
        )}

        {sidebarOpen && (
          <>
            <Separator className="mb-4" />
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
              className="mx-3 flex items-center justify-between rounded-[8px] border border-[#e0e0e0] bg-white/60 px-3 py-2 text-[11px] text-[#7a7a7a] hover:bg-white hover:text-[#1d1d1f] transition-colors"
            >
              <span>Search & commands</span>
              <kbd className="font-mono text-[10px] bg-[#f0f0f0] border border-[#e0e0e0] rounded px-1 py-0.5">⌘K</kbd>
            </button>
          </>
        )}
      </aside>

      {/* Main */}
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Page header — hidden for chat and full-bleed sections (which have their own headers) */}
        {!isChat && !isFullBleed && (
          <div className="shrink-0 flex items-start justify-between px-8 pt-10 pb-8">
            <h1 className="text-[22px] font-bold tracking-tight leading-none">{pageTitle}</h1>
            {section === "summary" && (
              <div className="flex items-center gap-1.5 text-[22px] font-bold tracking-tight leading-none text-[#7a7a7a]">
                <CalendarDays size={18} strokeWidth={2.5} />
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        )}

        {isChat ? (
          <Chat />
        ) : isFullBleed ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {isCollection    && <Collection />}
            {isProjects      && <Projects />}
            {isOpportunities && <Opportunities />}
            {isArchiveHome   && (
              <div className="flex-1 overflow-y-auto">
                <ArchiveHome />
              </div>
            )}
            {isDegree && (
              <div className="flex-1 overflow-hidden">
                <Degree />
              </div>
            )}
            {isTasks && (
              <div className="flex-1 overflow-hidden">
                <Tasks />
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-8 pb-16">
              {section === "summary"       && <Summary />}
              {section === "contacts"      && <Contacts />}
              {section === "agents"        && <Agents />}
              {section === "upload"        && <Documents />}
              {section === "people"        && <People />}
              {/* degree, archive-home, collection, projects, opportunities are full-bleed — rendered above */}
              {/* EmailInbox stays mounted so it loads once */}
              <div className={section === "email" ? undefined : "hidden"}>
                <EmailInbox />
              </div>
            </div>
          </ScrollArea>
        )}
      </main>

      {/* Right panel — hidden on Chat and Archive pages */}
      {!isChat && !isArchive && <RightPanel onOpenChat={() => setSection("chat")} />}
    </div>
  )
}
