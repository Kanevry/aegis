// src/lib/sessions.ts — Session management service

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createServiceRoleClient } from "@/lib/supabase";
import type { Session, SessionWithMessages, AppendMessageInput } from "@aegis/types";

// ── createSession ─────────────────────────────────────────────────────────────

export type CreateSessionInput = {
  userId: string;
  openclawSessionId?: string;
};

export async function createSession(
  input: CreateSessionInput,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Session> {
  const { data, error } = await client
    .from("sessions")
    .insert({
      user_id: input.userId,
      title: null,
      openclaw_session_id: input.openclawSessionId ?? null,
    })
    .select()
    .single<Session>();

  if (error) throw new Error(`createSession failed: ${error.message}`);
  if (!data) throw new Error("createSession returned no data");

  return data;
}

// ── getSession ────────────────────────────────────────────────────────────────

export async function getSession(
  id: string,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<SessionWithMessages | null> {
  const { data: sessionData, error: sessionError } = await client
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single<Session>();

  if (sessionError) {
    if (sessionError.code === "PGRST116") return null;
    throw new Error(`getSession failed: ${sessionError.message}`);
  }
  if (!sessionData) return null;

  // Fetch last 50 messages ordered by created_at ASC
  const { data: messagesData, error: messagesError } = await client
    .from("messages")
    .select("*")
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (messagesError) throw new Error(`getSession messages failed: ${messagesError.message}`);

  return {
    ...sessionData,
    messages: messagesData ?? [],
  };
}

// ── listSessions ──────────────────────────────────────────────────────────────

export type ListSessionsInput = {
  userId?: string;
  limit?: number;
};

export async function listSessions(
  input: ListSessionsInput = {},
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Session[]> {
  const limit = input.limit ?? 20;

  let query = client
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.userId) {
    query = query.eq("user_id", input.userId);
  }

  const { data, error } = await query.returns<Session[]>();

  if (error) throw new Error(`listSessions failed: ${error.message}`);
  return data ?? [];
}

// ── appendMessages ────────────────────────────────────────────────────────────

export async function appendMessages(
  sessionId: string,
  messages: AppendMessageInput[],
  client: SupabaseClient = createServiceRoleClient(),
): Promise<number> {
  if (messages.length === 0) return 0;

  const rows = messages.map((m) => ({
    session_id: sessionId,
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls ?? null,
  }));

  const { data, error } = await client.from("messages").insert(rows).select("id");

  if (error) throw new Error(`appendMessages failed: ${error.message}`);

  // Also bump updated_at on the parent session
  await client
    .from("sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return data?.length ?? 0;
}

// ── autoTitleIfFirstMessage ───────────────────────────────────────────────────

/**
 * If session.title is null, generates a 4-7 word title via gpt-4o-mini and writes it back.
 * Idempotent: if title is already set, returns immediately without calling the model.
 */
export async function autoTitleIfFirstMessage(
  sessionId: string,
  firstUserPrompt: string,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<void> {
  // Check current title
  const { data: session, error: fetchError } = await client
    .from("sessions")
    .select("title")
    .eq("id", sessionId)
    .single<Pick<Session, "title">>();

  if (fetchError) {
    if (fetchError.code === "PGRST116") return; // session not found, skip silently
    throw new Error(`autoTitleIfFirstMessage fetch failed: ${fetchError.message}`);
  }

  // Idempotent: title already set → skip
  if (session?.title) return;

  // Generate title with gpt-4o-mini
  let title: string;
  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Summarize this user message in 4-7 words as a chat title:\n\n${firstUserPrompt}`,
    });
    title = result.text.trim().slice(0, 80);
  } catch {
    // Best-effort — do not fail the caller if AI is unavailable
    return;
  }

  if (!title) return;

  const { error: updateError } = await client
    .from("sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (updateError) throw new Error(`autoTitleIfFirstMessage update failed: ${updateError.message}`);
}

// ── cleanupExpired ────────────────────────────────────────────────────────────

/**
 * Deletes sessions whose updated_at is older than `daysOld` days.
 * Cascade deletes messages via FK. Returns the number of deleted sessions.
 * Called by the pg-boss `session.cleanup` job (worker registers the job handler).
 */
export async function cleanupExpired(
  daysOld = 7,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();

  const { data, error } = await client
    .from("sessions")
    .delete()
    .lt("updated_at", cutoff)
    .select("id");

  if (error) throw new Error(`cleanupExpired failed: ${error.message}`);
  return data?.length ?? 0;
}
