import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { AppendMessageInput, Message, Session, SessionWithMessages } from "@aegis/types";
import { asIsoString, query, queryOne } from "@/lib/postgres";

export type CreateSessionInput = {
  userId: string;
  openclawSessionId?: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  openclaw_session_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: Message["role"];
  content: unknown;
  tool_calls: unknown | null;
  created_at: Date | string;
};

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    openclaw_session_id: row.openclaw_session_id,
    created_at: asIsoString(row.created_at),
    updated_at: asIsoString(row.updated_at),
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    tool_calls: row.tool_calls,
    created_at: asIsoString(row.created_at),
  };
}

export async function createSession(
  input: CreateSessionInput,
  _client?: unknown,
): Promise<Session> {
  const row = await queryOne<SessionRow>(
    `
      insert into sessions (
        user_id,
        title,
        openclaw_session_id
      )
      values ($1, null, $2)
      returning *
    `,
    [input.userId, input.openclawSessionId ?? null],
  );

  if (!row) throw new Error("createSession returned no data");
  return mapSession(row);
}

export async function getOrCreateSessionByOpenclawSessionId(
  input: {
    userId: string;
    openclawSessionId: string;
    title?: string | null;
  },
  _client?: unknown,
): Promise<Session> {
  const row = await queryOne<SessionRow>(
    `
      insert into sessions (
        user_id,
        title,
        openclaw_session_id
      )
      values ($1, $2, $3)
      on conflict (openclaw_session_id)
      do update
      set
        user_id = excluded.user_id,
        updated_at = now()
      returning *
    `,
    [input.userId, input.title ?? null, input.openclawSessionId],
  );

  if (!row) {
    throw new Error("getOrCreateSessionByOpenclawSessionId returned no data");
  }

  return mapSession(row);
}

export async function getSession(
  id: string,
  _client?: unknown,
): Promise<SessionWithMessages | null> {
  const sessionRow = await queryOne<SessionRow>(
    `
      select *
      from sessions
      where id = $1
    `,
    [id],
  );

  if (!sessionRow) return null;

  const messageRows = await query<MessageRow>(
    `
      select *
      from messages
      where session_id = $1
      order by created_at asc
      limit 50
    `,
    [id],
  );

  return {
    ...mapSession(sessionRow),
    messages: messageRows.map(mapMessage),
  };
}

export type ListSessionsInput = {
  userId?: string;
  limit?: number;
};

export async function listSessions(
  input: ListSessionsInput = {},
  _client?: unknown,
): Promise<Session[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (input.userId) {
    params.push(input.userId);
    where.push(`user_id = $${params.length}`);
  }

  params.push(input.limit ?? 20);
  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";

  const rows = await query<SessionRow>(
    `
      select *
      from sessions
      ${whereClause}
      order by created_at desc
      limit $${params.length}
    `,
    params,
  );

  return rows.map(mapSession);
}

export async function appendMessages(
  sessionId: string,
  messages: AppendMessageInput[],
  _client?: unknown,
): Promise<number> {
  if (messages.length === 0) return 0;

  const params: unknown[] = [];
  const values: string[] = [];

  messages.forEach((message, index) => {
    const base = index * 4;
    params.push(
      sessionId,
      message.role,
      JSON.stringify(message.content),
      message.tool_calls === undefined ? null : JSON.stringify(message.tool_calls),
    );
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}::jsonb, $${base + 4}::jsonb)`,
    );
  });

  const inserted = await query<{ id: string }>(
    `
      insert into messages (
        session_id,
        role,
        content,
        tool_calls
      )
      values ${values.join(", ")}
      returning id
    `,
    params,
  );

  await query(
    `
      update sessions
      set updated_at = now()
      where id = $1
    `,
    [sessionId],
  );

  return inserted.length;
}

export async function autoTitleIfFirstMessage(
  sessionId: string,
  firstUserPrompt: string,
  _client?: unknown,
): Promise<void> {
  const session = await queryOne<Pick<SessionRow, "title">>(
    `
      select title
      from sessions
      where id = $1
    `,
    [sessionId],
  );

  if (!session) return;
  if (session.title) return;

  let title: string;
  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Summarize this user message in 4-7 words as a chat title:\n\n${firstUserPrompt}`,
    });
    title = result.text.trim().slice(0, 80);
  } catch {
    return;
  }

  if (!title) return;

  await query(
    `
      update sessions
      set title = $2,
          updated_at = now()
      where id = $1
    `,
    [sessionId, title],
  );
}

export async function cleanupExpired(daysOld = 7, _client?: unknown): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();
  const rows = await query<{ id: string }>(
    `
      delete from sessions
      where updated_at < $1
      returning id
    `,
    [cutoff],
  );

  return rows.length;
}

export async function deleteSession(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `
      delete from sessions
      where id = $1
      returning id
    `,
    [id],
  );

  return Boolean(row);
}
