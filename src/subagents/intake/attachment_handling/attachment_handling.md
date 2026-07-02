## Functionality — Attachment handling

Pull the email's attachments into the workspace. Tools: `list_attachments`, `download_attachment`.

- `read_email` flags whether a message has attachments. For each one: call `list_attachments`
  to get its `attachment_id`, then `download_attachment` — it saves the file into `input/`.
- Download **every** attachment the task needs before handing off; report each saved path in
  your manifest. Downloaded files are then extracted by the document-extraction step.
