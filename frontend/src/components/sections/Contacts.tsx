import { useState, useEffect, useRef, useCallback } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { UserPlus, X, Globe, Mail, Pencil, Trash2, Camera, CalendarDays } from "lucide-react"

const IconLinkedIn = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
const IconTwitter  = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
const IconGitHub   = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>

interface Contact {
  id: number
  name: string
  email: string
  role: string
  organization: string
  photo: string
  tags: string[]
  notes: string
  linkedin: string
  twitter: string
  github: string
  website: string
}

const EMPTY: Omit<Contact, "id"> = {
  name: "", email: "", role: "", organization: "",
  photo: "", tags: [], notes: "",
  linkedin: "", twitter: "", github: "", website: "",
}

// Deterministic color per tag string
const TAG_PALETTE = [
  "bg-[#eef1fb] text-[#1e3a8a]",
  "bg-[#ecfdf5] text-[#065f46]",
  "bg-[#f5f0ff] text-[#4c1d95]",
  "bg-[#fef3e8] text-[#92400e]",
  "bg-[#fce7f3] text-[#9d174d]",
  "bg-[#e0f2fe] text-[#0369a1]",
]
function tagColor(tag: string) {
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

function Avatar({ name, photo, size = 64 }: { name: string; photo: string; size?: number }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase() || "?"
  const px = `${size}px`
  if (photo) {
    return <img src={photo} alt={name} style={{ width: px, height: px }} className="rounded-full object-cover shrink-0" />
  }
  return (
    <div
      style={{
        width: px, height: px, fontSize: size > 40 ? 20 : 13,
        background: "linear-gradient(135deg, #f3f0ff 0%, #ddd6fe 100%)",
        border: "1.5px solid rgba(210,205,240,0.6)",
      }}
      className="rounded-full flex items-center justify-center font-semibold text-violet-700 shrink-0 select-none"
    >
      {initials}
    </div>
  )
}

// ── Contact card ───────────────────────────────────────────────

function ContactCard({ contact, onEdit, onDelete }: {
  contact: Contact
  onEdit: (c: Contact) => void
  onDelete: (id: number) => void
}) {
  const socials = [
    { href: contact.linkedin, icon: <IconLinkedIn />, title: "LinkedIn" },
    { href: contact.twitter,  icon: <IconTwitter />,  title: "Twitter" },
    { href: contact.github,   icon: <IconGitHub />,   title: "GitHub" },
    { href: contact.website,  icon: <Globe size={13} />, title: "Website" },
  ].filter(s => s.href)

  return (
    <div className="group relative flex flex-col items-center text-center rounded-[16px] bg-white border border-[#ebebeb] px-5 pt-7 pb-5 gap-3 hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-shadow">
      {/* Edit / delete */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(contact)}
          className="p-1.5 rounded-lg text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
          <Pencil size={11} />
        </button>
        <button onClick={() => onDelete(contact.id)}
          className="p-1.5 rounded-lg text-[#7a7a7a] hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 size={11} />
        </button>
      </div>

      <Avatar name={contact.name} photo={contact.photo} size={60} />

      <div className="w-full space-y-0.5">
        <p className="text-[14px] font-semibold text-[#1d1d1f] truncate">{contact.name}</p>
        {(contact.role || contact.organization) && (
          <p className="text-[11px] text-[#7a7a7a] truncate">
            {[contact.role, contact.organization].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {contact.email && (
        <a href={`mailto:${contact.email}`}
          className="flex items-center gap-1 text-[11px] text-[#2c4470] hover:underline truncate max-w-full">
          <Mail size={10} className="shrink-0" />
          {contact.email}
        </a>
      )}

      {contact.tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {contact.tags.map(t => (
            <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tagColor(t)}`}>{t}</span>
          ))}
        </div>
      )}

      {socials.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          {socials.map(s => (
            <a key={s.title} href={s.href} target="_blank" rel="noopener noreferrer" title={s.title}
              className="text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors">
              {s.icon}
            </a>
          ))}
        </div>
      )}

      {contact.notes && (
        <p className="w-full text-left text-[11px] text-[#7a7a7a] leading-relaxed border-t border-[#f0f0f0] pt-3 mt-1 line-clamp-3">
          {contact.notes}
        </p>
      )}
    </div>
  )
}

// ── Add / Edit modal ───────────────────────────────────────────

function ContactModal({ open, initial, onClose, onSave }: {
  open: boolean
  initial: (Omit<Contact, "id"> & { id?: number }) | null
  onClose: () => void
  onSave: (data: Omit<Contact, "id"> & { id?: number }) => void
}) {
  const [form, setForm] = useState<Omit<Contact, "id"> & { id?: number }>(initial ?? EMPTY)
  const [tagInput, setTagInput] = useState("")
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm(initial ?? EMPTY)
    setTagInput("")
  }, [initial, open])

  function field(key: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }))
    setTagInput("")
  }

  function removeTag(t: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, photo: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  const inputCls = "w-full rounded-[8px] border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#b0b0b0] outline-none focus:border-[#2c4470]/50 focus:bg-white transition-colors"

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-[20px] bg-white border border-[#e8e8e8] shadow-[0_24px_64px_rgba(0,0,0,0.12)] z-50 p-7 space-y-5">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-[16px] font-bold tracking-tight text-[#1d1d1f]">
              {form.id ? "Edit Contact" : "New Contact"}
            </Dialog.Title>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#7a7a7a] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Photo upload */}
          <div className="flex justify-center">
            <button onClick={() => photoRef.current?.click()} className="relative group">
              <Avatar name={form.name || "?"} photo={form.photo} size={80} />
              <span className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={18} className="text-white" />
              </span>
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          {/* Name + email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Name</label>
              <input className={inputCls} placeholder="Full name" value={form.name} onChange={field("name")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Email</label>
              <input className={inputCls} placeholder="email@example.com" type="email" value={form.email} onChange={field("email")} />
            </div>
          </div>

          {/* Role + org */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Role</label>
              <input className={inputCls} placeholder="e.g. Designer" value={form.role} onChange={field("role")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Company</label>
              <input className={inputCls} placeholder="Organization" value={form.organization} onChange={field("organization")} />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Tags</label>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {form.tags.map(t => (
                <span key={t} className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${tagColor(t)}`}>
                  {t}
                  <button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100"><X size={9} /></button>
                </span>
              ))}
            </div>
            <input
              className={inputCls}
              placeholder="Type a tag and press Enter (e.g. Client, Friend)"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() } }}
            />
          </div>

          {/* Social links */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Links</label>
            <div className="space-y-2">
              {([
                { key: "linkedin", icon: <IconLinkedIn />, placeholder: "LinkedIn URL" },
                { key: "twitter",  icon: <IconTwitter />,  placeholder: "Twitter / X URL" },
                { key: "github",   icon: <IconGitHub />,   placeholder: "GitHub URL" },
                { key: "website",  icon: <Globe size={13} />, placeholder: "Website URL" },
              ] as const).map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-[#7a7a7a] shrink-0">{s.icon}</span>
                  <input className={inputCls} placeholder={s.placeholder} value={form[s.key]} onChange={field(s.key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#7a7a7a] uppercase tracking-wide">Notes</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Any notes about this contact…"
              value={form.notes}
              onChange={field("notes")}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[13px] text-[#7a7a7a] hover:bg-[#f5f5f7] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { if (form.name.trim()) onSave(form) }}
              disabled={!form.name.trim()}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[#2c4470] text-white hover:bg-[#1e3560] disabled:opacity-40 transition-colors"
            >
              {form.id ? "Save Changes" : "Add Contact"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Main ───────────────────────────────────────────────────────

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<(Omit<Contact, "id"> & { id?: number }) | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    load()
    window.addEventListener("contact:created", load)
    return () => window.removeEventListener("contact:created", load)
  }, [])

  async function load() {
    setLoading(true)
    const d = await fetch("/api/contacts/list").then(r => r.json())
    setLoading(false)
    if (d.ok) setContacts(d.contacts)
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(c: Contact) { setEditing(c); setModalOpen(true) }

  async function handleSave(data: Omit<Contact, "id"> & { id?: number }) {
    if (data.id) {
      await fetch(`/api/contacts/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    } else {
      await fetch("/api/contacts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    }
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: number) {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" })
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) ||
      c.organization.toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-[#7a7a7a]">
          <CalendarDays size={13} strokeWidth={2.5} />
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium bg-[#2c4470] text-white hover:bg-[#1e3560] transition-colors"
        >
          <UserPlus size={12} />
          Add Contact
        </button>
      </div>

      {/* Search */}
      {contacts.length > 0 && (
        <input
          className="w-full rounded-[10px] border border-[#e0e0e0] bg-[#fafafa] px-4 py-2.5 text-[13px] text-[#1d1d1f] placeholder:text-[#b0b0b0] outline-none focus:border-[#2c4470]/40 focus:bg-white transition-colors"
          placeholder="Search by name, email, company or tag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {loading && <p className="py-10 text-center text-[13px] text-[#7a7a7a]">Loading…</p>}

      {!loading && contacts.length === 0 && (
        <button
          onClick={openNew}
          className="group w-full py-14 flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-[#d0d0d0] hover:border-[#2c4470]/40 hover:bg-[#f9f9fb] transition-all duration-200"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#f0f0f5] group-hover:bg-[#e8eaf6] transition-colors">
            <UserPlus size={16} className="text-[#7a7a7a] group-hover:text-[#2c4470] transition-colors" />
          </span>
          <span className="text-[13px] text-[#7a7a7a] group-hover:text-[#1d1d1f] transition-colors">Add your first contact</span>
        </button>
      )}

      {!loading && contacts.length > 0 && filtered.length === 0 && (
        <p className="py-10 text-center text-[13px] text-[#7a7a7a]">No contacts match "{search}"</p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(c => (
          <ContactCard key={c.id} contact={c} onEdit={openEdit} onDelete={handleDelete} />
        ))}
      </div>

      <ContactModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}
