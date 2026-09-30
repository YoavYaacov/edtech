import type { RawQuestion } from "../../functions/ai-variant/context.ts";
import type { HandlerDeps, RunRecord, Store } from "../../functions/ai-variant/handler.ts";
import type { VariantProvider } from "../../functions/ai-variant/provider.ts";
import type { VariantResult } from "../../functions/ai-variant/schema.ts";
import { VariantError } from "../../functions/ai-variant/errors.ts";

export const TEACHER_ID = "00000000-0000-4000-8000-0000000000a1";
export const QUESTION_ID = "00000000-0000-4000-8000-0000000000c1";
export const OTHER = "00000000-0000-4000-8000-0000000000a2";
export const ORIGIN = "https://app.example";

export const GOOD_RESULT: VariantResult = {
  target_language: "csharp",
  body_md: "כתבו שיטה שמחזירה את סכום המערך.",
  starter_code: "static int Sum(int[] a)\n{\n}",
  solution_code: "static int Sum(int[] a)\n{\n    int s = 0;\n    for (int i = 0; i < a.Length; i++)\n    {\n        s += a[i];\n    }\n    return s;\n}",
  explanation_md: "עוברים על המערך ומסכמים.",
  hints: [{ level: 1, content_md: "השתמשו בלולאה." }],
  warnings: [],
  confidence: 0.9,
};

export function rawQuestion(over: Partial<RawQuestion> = {}): RawQuestion {
  return {
    id: QUESTION_ID, owner_id: TEACHER_ID, status: "active", title: "סכום מערך",
    body_md: "כתבו שיטה שמחזירה את סכום המערך.", question_type: "code", programming_language: "java", is_language_neutral: false,
    starter_code: "static int sum(int[] a) {\n}", hints: [{ level: 1, content_md: "השתמשו בלולאה." }],
    solution_code: "static int sum(int[] a) { int s = 0; for (int x : a) s += x; return s; }", explanation_md: "עוברים על המערך ומסכמים.",
    course_primary_language: "java", course_languages: ["java", "csharp"], variant_languages: [], ...over,
  };
}

export function harness(opts: {
  user?: { id: string; email: string | null } | null; role?: string | null; raw?: RawQuestion | null;
  providerResult?: VariantResult; providerError?: VariantError; recordFails?: boolean; noProvider?: boolean; noStore?: boolean; loadThrows?: boolean;
} = {}) {
  const calls: string[] = [];
  const runs: RunRecord[] = [];
  const providerInputs: unknown[] = [];
  const logs: Record<string, unknown>[] = [];
  const user = opts.user === undefined ? { id: TEACHER_ID, email: "t@example.invalid" } : opts.user;
  const store: Store = {
    async authenticate() { calls.push("authenticate"); return user; },
    async getProfile() { calls.push("getProfile"); return { role: opts.role === undefined ? "teacher" : opts.role }; },
    async loadQuestion() { calls.push("loadQuestion"); if (opts.loadThrows) throw new Error("x"); return opts.raw === undefined ? rawQuestion() : opts.raw; },
    async recordRun(r) { calls.push("recordRun"); if (opts.recordFails) throw new Error("x"); runs.push(r); return "run-1"; },
  };
  const provider: VariantProvider = {
    provider: "google", model: "gemini-3.5-flash-lite",
    async proposeVariant(input) {
      calls.push("provider"); providerInputs.push(input);
      if (opts.providerError) throw opts.providerError;
      return opts.providerResult ?? GOOD_RESULT;
    },
  };
  const deps: HandlerDeps = {
    allowedOrigins: [ORIGIN], store: opts.noStore ? null : store, getProvider: () => (opts.noProvider ? null : provider),
    now: () => 1000, log: (e) => logs.push(e),
  };
  return { deps, calls, runs, providerInputs, logs };
}

export const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://f.invalid/", { method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer t", "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
export const goodBody = { question_id: QUESTION_ID, target_language: "csharp" };
