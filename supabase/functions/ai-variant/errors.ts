// Error contract for ai-variant. Only these codes and Hebrew messages reach the client:
// never a raw provider response, never a secret, never a stack trace. (Erasable TypeScript: runs under Deno and node --test.)

export type VariantErrorType =
  | "unauthorized" | "forbidden" | "bad_request" | "not_found"
  | "neutral_question" | "not_programming" | "same_language" | "invalid_language" | "variant_exists" | "missing_context"
  | "timeout" | "quota_exceeded" | "server_overload" | "no_connection" | "invalid_output" | "provider_error"
  | "server_misconfigured" | "internal_error";

export class VariantError extends Error {
  errorType: VariantErrorType;
  constructor(errorType: VariantErrorType, detail?: string) {
    super(detail ?? errorType);
    this.errorType = errorType;
  }
}

export const HTTP_STATUS: Record<VariantErrorType, number> = {
  unauthorized: 401, forbidden: 403, bad_request: 400, not_found: 404,
  neutral_question: 422, not_programming: 422, same_language: 422, invalid_language: 422, variant_exists: 409, missing_context: 422,
  timeout: 504, quota_exceeded: 429, server_overload: 503, no_connection: 502, invalid_output: 502, provider_error: 502,
  server_misconfigured: 500, internal_error: 500,
};

const AI_UNAVAILABLE = "לא ניתן ליצור כרגע הצעת AI. הבסיס לא השתנה, ואפשר ליצור את הגרסה ידנית.";

export const CLIENT_MESSAGE: Record<VariantErrorType, string> = {
  unauthorized: "נדרשת התחברות.",
  forbidden: "אין הרשאה לפעולה זו.",
  bad_request: "בקשה לא תקינה.",
  not_found: "השאלה לא נמצאה.",
  neutral_question: "זו שאלה שאינה תלויה בשפת תכנות, ולכן אין צורך בגרסה נפרדת.",
  not_programming: "לשאלה אין שפת בסיס, ולכן אי אפשר להמיר אותה. הגדירו לה שפה ושמרו.",
  same_language: "שפת היעד זהה לשפת הבסיס של השאלה.",
  invalid_language: "שפת היעד אינה נתמכת בקורס של השאלה.",
  variant_exists: "כבר קיימת לשאלה גרסה בשפה הזו. אפשר לערוך אותה.",
  missing_context: "אין מספיק תוכן בשאלה כדי ליצור הצעה.",
  timeout: AI_UNAVAILABLE,
  quota_exceeded: AI_UNAVAILABLE,
  server_overload: AI_UNAVAILABLE,
  no_connection: AI_UNAVAILABLE,
  invalid_output: AI_UNAVAILABLE,
  provider_error: AI_UNAVAILABLE,
  server_misconfigured: AI_UNAVAILABLE,
  internal_error: AI_UNAVAILABLE,
};

// ai_variant_runs.status vocabulary: ok | error | timeout | quota_exceeded | invalid_output
export function runStatusFor(t: VariantErrorType): "error" | "timeout" | "quota_exceeded" | "invalid_output" {
  if (t === "timeout") return "timeout";
  if (t === "quota_exceeded") return "quota_exceeded";
  if (t === "invalid_output") return "invalid_output";
  return "error";
}
