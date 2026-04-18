/**
 * Hand-written database types — matches supabase/migrations/0001_phase2_schema.sql.
 *
 * TODO: replace with `supabase gen types typescript --local` output once CLI is in CI.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          openclaw_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          openclaw_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          role: "user" | "assistant" | "system" | "tool";
          content: Json;
          tool_calls: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: "user" | "assistant" | "system" | "tool";
          content: Json;
          tool_calls?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      approvals: {
        Row: {
          id: string;
          session_id: string | null;
          tool: string;
          args: Json;
          system_run_plan: Json | null;
          status: "pending" | "approved" | "denied" | "expired";
          decided_by: "ui" | "discord" | "cli" | "auto" | null;
          decided_at: string | null;
          decision_scope: "allow-once" | "allow-always" | "deny-once" | "deny-always" | null;
          reason: string | null;
          sentry_issue_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          session_id?: string | null;
          tool: string;
          args: Json;
          system_run_plan?: Json | null;
          status?: "pending" | "approved" | "denied" | "expired";
          decided_by?: "ui" | "discord" | "cli" | "auto" | null;
          decided_at?: string | null;
          decision_scope?: "allow-once" | "allow-always" | "deny-once" | "deny-always" | null;
          reason?: string | null;
          sentry_issue_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["approvals"]["Insert"]>;
      };
      aegis_decisions: {
        Row: {
          id: string;
          approval_id: string | null;
          message_id: string | null;
          layer: "B1" | "B2" | "B3" | "B4" | "B5";
          outcome: string;
          safety_score: number | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          approval_id?: string | null;
          message_id?: string | null;
          layer: "B1" | "B2" | "B3" | "B4" | "B5";
          outcome: string;
          safety_score?: number | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["aegis_decisions"]["Insert"]>;
      };
      sentry_context: {
        Row: {
          id: string;
          approval_id: string | null;
          similar_denials: Json | null;
          seer_suggestion: string | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          approval_id?: string | null;
          similar_denials?: Json | null;
          seer_suggestion?: string | null;
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sentry_context"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
