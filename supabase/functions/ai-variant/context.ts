// What the model is allowed to see: the teacher-authored content of ONE question. No student data, no ids,
// no emails — the only inputs are fields of the question itself.
import { VariantError } from "./errors.ts";

export interface RawQuestion {
  id: string;
  owner_id: string | null;
  status: string | null;
  title: string | null;
  body_md: string | null;
  question_type: string | null;
  programming_language: string | null;      // base language of the question (null = "unclassified" -> course primary)
  is_language_neutral: boolean;
  starter_code: string | null;
  hints: { level: number; content_md: string }[];
  solution_code: string | null;
  explanation_md: string | null;
  course_primary_language: string | null;
  course_languages: string[];
  variant_languages: string[];               // existing variants of this question
}

export interface VariantPayload {
  source_language: string;
  target_language: string;
  title: string;
  question_type: string;
  body_md: string;
  starter_code: string;
  solution_code: string;
  explanation_md: string;
  hints: { level: number; content_md: string }[];
}

export const SUPPORTED = ["java", "python", "csharp", "c", "cpp", "javascript"];

// Validates the request against the question and builds the payload. Throws VariantError with a specific type.
export function assemblePayload(q: RawQuestion, target: string): VariantPayload {
  if (q.is_language_neutral) throw new VariantError("neutral_question");
  const source = q.programming_language ?? q.course_primary_language;
  if (!source) throw new VariantError("not_programming");
  if (target === source) throw new VariantError("same_language");
  if (!q.course_languages.includes(target)) throw new VariantError("invalid_language");
  if (q.variant_languages.includes(target)) throw new VariantError("variant_exists");
  if (!q.title || !q.body_md || q.body_md.trim() === "") throw new VariantError("missing_context");
  return {
    source_language: source, target_language: target, title: q.title, question_type: q.question_type ?? "code",
    body_md: q.body_md, starter_code: q.starter_code ?? "", solution_code: q.solution_code ?? "", explanation_md: q.explanation_md ?? "",
    hints: [...q.hints].sort((a, b) => a.level - b.level),
  };
}

export function expectationFor(p: VariantPayload) {
  return {
    target_language: p.target_language,
    has_starter: p.starter_code.trim() !== "",
    has_solution: p.solution_code.trim() !== "",
    has_explanation: p.explanation_md.trim() !== "",
    hint_levels: p.hints.map((h) => h.level),
  };
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// input_hash = traceability without storing the input itself.
export async function inputHash(payload: VariantPayload, promptVersion: string, model: string): Promise<string> {
  const data = new TextEncoder().encode(canonical({ payload, prompt_version: promptVersion, model }));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
