import BetterSqlite3 from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type { Session, Message, EditCommand, EditStatus, EditHistoryEntry, Attachment } from '../../shared/types'

// ─────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  mode        TEXT    NOT NULL CHECK(mode IN ('edit', 'chat')),
  hwp_doc     TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT    PRIMARY KEY,
  session_id   TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT    NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content      TEXT    NOT NULL,
  edits        TEXT,
  edit_status  TEXT    NOT NULL DEFAULT 'none'
                       CHECK(edit_status IN ('none', 'pending', 'accepted', 'rejected', 'partial')),
  token_input  INTEGER,
  token_output INTEGER,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS edit_history (
  id            TEXT    PRIMARY KEY,
  message_id    TEXT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  action        TEXT    NOT NULL CHECK(action IN ('insert', 'replace', 'delete')),
  paragraph     INTEGER NOT NULL,
  original_text TEXT,
  new_text      TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'applied', 'reverted', 'rejected')),
  applied_at    TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT    PRIMARY KEY,
  message_id   TEXT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,
  mime_type    TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  text_preview TEXT,
  created_at   TEXT    NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_session_id   ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_edit_history_msg_id   ON edit_history(message_id);
CREATE INDEX IF NOT EXISTS idx_edit_history_seq      ON edit_history(message_id, seq);
CREATE INDEX IF NOT EXISTS idx_attachments_msg_id    ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at   ON sessions(updated_at);
`

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

// ─────────────────────────────────────────────────────────────
// SessionService
// ─────────────────────────────────────────────────────────────

export class SessionService {
  constructor(private db: BetterSqlite3.Database) {}

  create(mode: 'edit' | 'chat', hwpDoc?: string): Session {
    const now = nowIso()
    const session: Session = {
      id: nanoid(),
      title: '새 대화',
      mode,
      hwpDoc: hwpDoc ?? null,
      createdAt: now,
      updatedAt: now
    }

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, mode, hwp_doc, created_at, updated_at)
         VALUES (@id, @title, @mode, @hwpDoc, @createdAt, @updatedAt)`
      )
      .run(session)

    return session
  }

  list(): Session[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, mode, hwp_doc, created_at, updated_at
         FROM sessions
         ORDER BY updated_at DESC`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map(rowToSession)
  }

  getById(id: string): Session | null {
    const row = this.db
      .prepare(
        `SELECT id, title, mode, hwp_doc, created_at, updated_at
         FROM sessions WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined

    return row ? rowToSession(row) : null
  }

  rename(id: string, title: string): void {
    this.db
      .prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`)
      .run(title, nowIso(), id)
  }

  delete(id: string): void {
    // Cascading deletes are handled by FK constraints (messages → edit_history, attachments)
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
  }

  updateTimestamp(id: string): void {
    this.db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .run(nowIso(), id)
  }
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    title: row.title as string,
    mode: row.mode as 'edit' | 'chat',
    hwpDoc: (row.hwp_doc as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

// ─────────────────────────────────────────────────────────────
// MessageService
// ─────────────────────────────────────────────────────────────

export class MessageService {
  constructor(private db: BetterSqlite3.Database) {}

  create(
    sessionId: string,
    role: string,
    content: string,
    edits?: EditCommand[],
    tokenInput?: number,
    tokenOutput?: number
  ): Message {
    const now = nowIso()
    const message: Message = {
      id: nanoid(),
      sessionId,
      role: role as Message['role'],
      content,
      edits: edits ?? null,
      editStatus: 'none',
      tokenInput: tokenInput ?? null,
      tokenOutput: tokenOutput ?? null,
      createdAt: now
    }

    this.db
      .prepare(
        `INSERT INTO messages
           (id, session_id, role, content, edits, edit_status, token_input, token_output, created_at)
         VALUES
           (@id, @sessionId, @role, @content, @editsJson, @editStatus, @tokenInput, @tokenOutput, @createdAt)`
      )
      .run({
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        editsJson: message.edits ? JSON.stringify(message.edits) : null,
        editStatus: message.editStatus,
        tokenInput: message.tokenInput,
        tokenOutput: message.tokenOutput,
        createdAt: message.createdAt
      })

    return message
  }

  listBySession(sessionId: string): Message[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, edits, edit_status,
                token_input, token_output, created_at
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(sessionId) as Array<Record<string, unknown>>

    return rows.map(rowToMessage)
  }

  updateEditStatus(id: string, status: EditStatus): void {
    this.db
      .prepare(`UPDATE messages SET edit_status = ? WHERE id = ?`)
      .run(status, id)
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(id)
  }
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as Message['role'],
    content: row.content as string,
    edits: row.edits ? (JSON.parse(row.edits as string) as EditCommand[]) : null,
    editStatus: row.edit_status as EditStatus,
    tokenInput: row.token_input as number | null,
    tokenOutput: row.token_output as number | null,
    createdAt: row.created_at as string
  }
}

// ─────────────────────────────────────────────────────────────
// EditHistoryService
// ─────────────────────────────────────────────────────────────

export class EditHistoryService {
  constructor(private db: BetterSqlite3.Database) {}

  create(
    messageId: string,
    seq: number,
    action: string,
    paragraph: number,
    originalText?: string,
    newText?: string
  ): EditHistoryEntry {
    const entry: EditHistoryEntry = {
      id: nanoid(),
      messageId,
      seq,
      action: action as EditHistoryEntry['action'],
      paragraph,
      originalText: originalText ?? null,
      newText: newText ?? null,
      status: 'pending',
      appliedAt: null
    }

    this.db
      .prepare(
        `INSERT INTO edit_history
           (id, message_id, seq, action, paragraph, original_text, new_text, status, applied_at)
         VALUES
           (@id, @messageId, @seq, @action, @paragraph, @originalText, @newText, @status, @appliedAt)`
      )
      .run(entry)

    return entry
  }

  listByMessage(messageId: string): EditHistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, message_id, seq, action, paragraph, original_text, new_text, status, applied_at
         FROM edit_history
         WHERE message_id = ?
         ORDER BY seq ASC`
      )
      .all(messageId) as Array<Record<string, unknown>>

    return rows.map(rowToEditHistoryEntry)
  }

  updateStatus(id: string, status: string, appliedAt?: string): void {
    this.db
      .prepare(`UPDATE edit_history SET status = ?, applied_at = ? WHERE id = ?`)
      .run(status, appliedAt ?? null, id)
  }

  getByIds(ids: string[]): EditHistoryEntry[] {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT id, message_id, seq, action, paragraph, original_text, new_text, status, applied_at
         FROM edit_history
         WHERE id IN (${placeholders})
         ORDER BY seq ASC`
      )
      .all(...ids) as Array<Record<string, unknown>>

    return rows.map(rowToEditHistoryEntry)
  }
}

function rowToEditHistoryEntry(row: Record<string, unknown>): EditHistoryEntry {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    seq: row.seq as number,
    action: row.action as EditHistoryEntry['action'],
    paragraph: row.paragraph as number,
    originalText: (row.original_text as string | null) ?? null,
    newText: (row.new_text as string | null) ?? null,
    status: row.status as EditHistoryEntry['status'],
    appliedAt: (row.applied_at as string | null) ?? null
  }
}

// ─────────────────────────────────────────────────────────────
// AttachmentService  (internal helper — not exported directly)
// ─────────────────────────────────────────────────────────────

export class AttachmentService {
  constructor(private db: BetterSqlite3.Database) {}

  create(
    messageId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number,
    textPreview?: string
  ): Attachment {
    const now = nowIso()
    const attachment: Attachment = {
      id: nanoid(),
      messageId,
      filename,
      mimeType,
      sizeBytes,
      textPreview: textPreview ?? null,
      createdAt: now
    }

    this.db
      .prepare(
        `INSERT INTO attachments
           (id, message_id, filename, mime_type, size_bytes, text_preview, created_at)
         VALUES
           (@id, @messageId, @filename, @mimeType, @sizeBytes, @textPreview, @createdAt)`
      )
      .run(attachment)

    return attachment
  }

  listByMessage(messageId: string): Attachment[] {
    const rows = this.db
      .prepare(
        `SELECT id, message_id, filename, mime_type, size_bytes, text_preview, created_at
         FROM attachments
         WHERE message_id = ?
         ORDER BY created_at ASC`
      )
      .all(messageId) as Array<Record<string, unknown>>

    return rows.map(rowToAttachment)
  }
}

function rowToAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    filename: row.filename as string,
    mimeType: row.mime_type as string,
    sizeBytes: row.size_bytes as number,
    textPreview: (row.text_preview as string | null) ?? null,
    createdAt: row.created_at as string
  }
}

// ─────────────────────────────────────────────────────────────
// SettingsService
// ─────────────────────────────────────────────────────────────

export class SettingsService {
  constructor(private db: BetterSqlite3.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(key) as { value: string } | undefined

    return row ? row.value : null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value)
  }

  getAll(): Record<string, string> {
    const rows = this.db
      .prepare(`SELECT key, value FROM settings`)
      .all() as Array<{ key: string; value: string }>

    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }
}

// ─────────────────────────────────────────────────────────────
// initDatabase
// ─────────────────────────────────────────────────────────────

export function initDatabase(dbPath: string): {
  db: BetterSqlite3.Database
  sessions: SessionService
  messages: MessageService
  editHistory: EditHistoryService
  attachments: AttachmentService
  settings: SettingsService
} {
  const db = new BetterSqlite3(dbPath)

  // Apply schema — each statement is run individually because
  // better-sqlite3's exec() handles multi-statement strings but
  // PRAGMA must come before any DDL in the same connection.
  db.exec(SCHEMA)

  return {
    db,
    sessions: new SessionService(db),
    messages: new MessageService(db),
    editHistory: new EditHistoryService(db),
    attachments: new AttachmentService(db),
    settings: new SettingsService(db)
  }
}
