// Google Gemini adapter for variant proposals. Same provider, model and key handling as ai-review (shared constants);
// the key is read by index.ts from a server-side secret and sent ONLY in the x-goog-api-key header.
import { VariantError } from "./errors.ts";
import type { VariantErrorType } from "./errors.ts";
import { GEMINI_MODEL, GEMINI_PROVIDER, classifyHttpFailure } from "../ai-review/geminiAdapter.ts";
import { buildPrompt, newBoundary } from "./prompt.ts";
import { RESULT_JSON_SCHEMA, validateResult } from "./schema.ts";
import type { Expectation, VariantResult } from "./schema.ts";
import type { VariantPayload } from "./context.ts";
import type { VariantProvider } from "./provider.ts";

export const VARIANT_TIMEOUT_MS = 45_000; // a whole question (body + code + solution + hints) is more output than a review
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  makeBoundary?: () => string;
}

export function buildGeminiRequestBody(payload: VariantPayload, boundary: string) {
  const { system, user } = buildPrompt(payload, boundary);
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384, responseMimeType: "application/json", responseJsonSchema: RESULT_JSON_SCHEMA },
  };
}

export function createGeminiVariantAdapter(cfg: GeminiConfig): VariantProvider {
  const model = cfg.model ?? GEMINI_MODEL;
  const timeoutMs = cfg.timeoutMs ?? VARIANT_TIMEOUT_MS;
  const doFetch = cfg.fetchImpl ?? fetch;
  const makeBoundary = cfg.makeBoundary ?? newBoundary;

  return {
    provider: GEMINI_PROVIDER,
    model,
    async proposeVariant(input: VariantPayload, expect: Expectation): Promise<VariantResult> {
      const body = buildGeminiRequestBody(input, makeBoundary());
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        let res: Response;
        try {
          res = await doFetch(`${BASE_URL}/models/${model}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
        } catch (e) {
          if (ctrl.signal.aborted || (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError") throw new VariantError("timeout", "aborted");
          throw new VariantError("no_connection", "fetch_failed");
        }
        let json: any;
        try {
          json = await res.json();
        } catch {
          if (ctrl.signal.aborted) throw new VariantError("timeout", "aborted_body");
          if (!res.ok) throw new VariantError(classifyHttpFailure(res.status, undefined).errorType as VariantErrorType);
          throw new VariantError("invalid_output", "response_not_json");
        }
        if (!res.ok) throw new VariantError(classifyHttpFailure(res.status, json?.error?.status).errorType as VariantErrorType, `http_${res.status}`);
        if (json?.promptFeedback?.blockReason) throw new VariantError("invalid_output", "blocked");
        const cand = json?.candidates?.[0];
        if (!cand || (cand.finishReason && cand.finishReason !== "STOP")) throw new VariantError("invalid_output", "no_complete_candidate");
        const text = (cand.content?.parts ?? []).map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new VariantError("invalid_output", "not_json"); }
        return validateResult(parsed, expect);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
