// Structured Output contract for a language-variant PROPOSAL. Validated locally, in addition to the provider's schema.
import { VariantError } from "./errors.ts";

export interface VariantHint { level: number; content_md: string }
export interface VariantResult {
  target_language: string;
  body_md: string;
  starter_code: string;
  solution_code: string;
  explanation_md: string;
  hints: VariantHint[];
  warnings: string[];
  confidence: number;
}

// What the BASE question has — used to reject an incomplete proposal (e.g. base has a solution, proposal has none).
export interface Expectation {
  target_language: string;
  has_starter: boolean;
  has_solution: boolean;
  has_explanation: boolean;
  hint_levels: number[];
}

export const RESULT_KEYS = ["target_language", "body_md", "starter_code", "solution_code", "explanation_md", "hints", "warnings", "confidence"] as const;

export const RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    target_language: { type: "string" },
    body_md: { type: "string" },
    starter_code: { type: "string" },
    solution_code: { type: "string" },
    explanation_md: { type: "string" },
    hints: { type: "array", items: { type: "object", properties: { level: { type: "integer", minimum: 1, maximum: 3 }, content_md: { type: "string" } }, required: ["level", "content_md"], additionalProperties: false } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [...RESULT_KEYS],
  additionalProperties: false,
};

const MAX_TEXT = 20000;
const invalid = (why: string) => new VariantError("invalid_output", why);

export function validateResult(x: unknown, expect: Expectation): VariantResult {
  if (typeof x !== "object" || x === null || Array.isArray(x)) throw invalid("not an object");
  const o = x as Record<string, unknown>;
  for (const k of RESULT_KEYS) if (!(k in o)) throw invalid(`missing ${k}`);
  for (const k of Object.keys(o)) if (!(RESULT_KEYS as readonly string[]).includes(k)) throw invalid(`unexpected ${k}`);

  if (o.target_language !== expect.target_language) throw invalid("wrong target_language");
  for (const k of ["body_md", "starter_code", "solution_code", "explanation_md"] as const) {
    if (typeof o[k] !== "string" || (o[k] as string).length > MAX_TEXT) throw invalid(`bad ${k}`);
  }
  if ((o.body_md as string).trim() === "") throw invalid("empty body");
  if (expect.has_starter && (o.starter_code as string).trim() === "") throw invalid("starter missing");
  if (expect.has_solution && (o.solution_code as string).trim() === "") throw invalid("solution missing");
  if (expect.has_explanation && (o.explanation_md as string).trim() === "") throw invalid("explanation missing");

  if (!Array.isArray(o.hints) || o.hints.length > 3) throw invalid("bad hints");
  const seen = new Set<number>();
  const hints: VariantHint[] = [];
  for (const h of o.hints) {
    if (typeof h !== "object" || h === null) throw invalid("bad hint");
    const { level, content_md } = h as Record<string, unknown>;
    if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 3 || seen.has(level as number)) throw invalid("bad hint level");
    if (typeof content_md !== "string" || content_md.trim() === "" || content_md.length > MAX_TEXT) throw invalid("bad hint text");
    seen.add(level as number);
    hints.push({ level: level as number, content_md });
  }
  // the proposal must keep every hint the base has (same levels); it may not invent or drop hints
  const want = [...expect.hint_levels].sort().join(",");
  const got = hints.map((h) => h.level).sort().join(",");
  if (want !== got) throw invalid("hint levels differ from base");

  const w = o.warnings;
  if (!Array.isArray(w) || w.length > 10 || w.some((i) => typeof i !== "string" || i.length > 500)) throw invalid("bad warnings");
  const c = o.confidence;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1) throw invalid("bad confidence");

  return {
    target_language: expect.target_language, body_md: o.body_md as string, starter_code: o.starter_code as string,
    solution_code: o.solution_code as string, explanation_md: o.explanation_md as string,
    hints: hints.sort((a, b) => a.level - b.level), warnings: [...(w as string[])], confidence: c,
  };
}
