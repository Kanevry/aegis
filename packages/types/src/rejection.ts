import { z } from "zod";

export type ReasonCategory =
  | "pii"
  | "injection"
  | "path-traversal"
  | "secret"
  | "user-deny"
  | "expired";

export const ReasonCategorySchema = z.enum([
  "pii",
  "injection",
  "path-traversal",
  "secret",
  "user-deny",
  "expired",
]);

export const RejectionOutputSchema = z.object({
  summary: z.string().max(280),
  reasonCategory: ReasonCategorySchema,
  suggestedFollowup: z.string(),
  escalation: z.enum(["soft", "hard"]),
});

export type RejectionOutput = z.infer<typeof RejectionOutputSchema>;
