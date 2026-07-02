## Functionality — Document extraction

Turn each source document into clean text under `work/` — the core of your job.

- **Read the format's `SKILL.md` first**, every time, then use the skill's method:
  `skills/pdf/SKILL.md`, `skills/docx/SKILL.md`, `skills/pptx/SKILL.md`, `skills/xlsx/SKILL.md`.
- **PDF:** use the skill's extraction (e.g. `pdfplumber`) to write text **and tables** to
  `work/<name>.txt`. **Never `read_file` a raw `.pdf`** — it floods the context window.
- **docx / pptx / xlsx:** use the skill to extract text, tables, and sheet contents to
  `work/<name>.txt`.
- **Tables matter** — preserve them (TSV/markdown). Enterprise answers live in tables.
- **Charts / images:** note them explicitly (page/slide + a one-line description of what the
  figure shows). If a chart's data is unreadable from text, say so — do not invent it.
