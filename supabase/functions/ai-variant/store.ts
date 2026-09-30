// Supabase-backed Store for ai-variant.
//  * userClient  — the CALLER's JWT + anon key: every read is subject to RLS (a teacher only sees own questions).
//  * adminClient — service role, used for ONE thing: inserting the ai_variant_runs audit row.
// The service role key never leaves the Edge Function runtime.
import type { RawQuestion } from "./context.ts";
import type { AuthedUser, RunRecord, Store } from "./handler.ts";

const one = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

// Explicit whitelist of columns: nothing about students, no emails.
export const QUESTION_SELECT =
  "id, owner_id, status, title, body_md, question_type, programming_language, is_language_neutral, starter_code, " +
  "question_hints(level, content_md), question_solutions(solution_code, explanation_md), " +
  "question_variants(programming_language), " +
  "course:courses(programming_language, course_languages(programming_language))";

// deno-lint-ignore no-explicit-any
export function createStore(userClient: any, adminClient: any): Store {
  return {
    async authenticate(_authHeader: string): Promise<AuthedUser | null> {
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },

    async getProfile(userId: string) {
      const { data, error } = await userClient.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error || !data) return null;
      return { role: data.role ?? null };
    },

    async loadQuestion(questionId: string): Promise<RawQuestion | null> {
      const { data, error } = await userClient.from("questions").select(QUESTION_SELECT).eq("id", questionId).maybeSingle();
      if (error) throw new Error("load_failed");
      if (!data) return null;
      const course = one(data.course);
      const sol = one(data.question_solutions);
      return {
        id: data.id,
        owner_id: data.owner_id ?? null,
        status: data.status ?? null,
        title: data.title ?? null,
        body_md: data.body_md ?? null,
        question_type: data.question_type ?? null,
        programming_language: data.programming_language ?? null,
        is_language_neutral: Boolean(data.is_language_neutral),
        starter_code: data.starter_code ?? null,
        hints: (data.question_hints ?? []).map((h: { level: number; content_md: string }) => ({ level: h.level, content_md: h.content_md })),
        solution_code: sol?.solution_code ?? null,
        explanation_md: sol?.explanation_md ?? null,
        course_primary_language: course?.programming_language ?? null,
        course_languages: (course?.course_languages ?? []).map((l: { programming_language: string }) => l.programming_language),
        variant_languages: (data.question_variants ?? []).map((v: { programming_language: string }) => v.programming_language),
      };
    },

    async recordRun(run: RunRecord): Promise<string | null> {
      const { data, error } = await adminClient.from("ai_variant_runs").insert(run).select("id").single();
      if (error || !data) throw new Error("record_failed");
      return data.id as string;
    },
  };
}
