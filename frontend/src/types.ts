export type Section = "summary" | "chat" | "contacts" | "agents" | "email" | "upload"
  | "collection" | "atlas" | "people" | "organizations" | "opportunities" | "projects" | "degree" | "archive-home" | "tasks"

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface EmailItem {
  uid: string; subject: string; sender: string; date: string
  has_attachments: boolean; attachment_names: string[]
}

export interface AgentRecord {
  id: number; name: string; description: string
  tools: string[]; system_prompt: string
  is_active: boolean; created_at: string
}

export interface SummaryData {
  overview: string
  important_emails: { subject: string; from: string; reason: string }[]
  action_items: string[]
  deadlines: string[]
  needs_reply: { subject: string; from: string; why: string }[]
}

export interface Contact {
  id: number
  name: string
  organization: string
  role: string
  email: string
  linkedin: string
  last_contact: string
  notes: string
  app_count: number
  email_count: number
  created_at: string
}

