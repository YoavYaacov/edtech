import { errors, passwordErrors } from '../i18n/he';

// Maps Supabase auth errors to Hebrew messages. Prefers error.code,
// falls back to status / message for older error shapes.
export function authErrorMessage(error) {
  if (!error) return '';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return errors.invalidCredentials;
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return errors.emailNotConfirmed;
  }
  if (error.status === 429 || code.includes('rate_limit')) {
    return errors.rateLimited;
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return errors.network;
  }
  return errors.generic;
}

// Error codes come from Supabase Auth (@supabase/auth-js ErrorCode). Only codes that can be
// explained safely in Hebrew are mapped; everything else keeps the generic fallback.
const LINK_EXPIRED_CODES = ['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'invite_not_found'];
const SESSION_CODES = ['session_not_found', 'session_expired', 'refresh_token_not_found', 'bad_jwt', 'no_authorization',
  'reauthentication_needed', 'reauthentication_not_valid'];

export function passwordErrorMessage(error) {
  if (!error) return '';
  const code = error.code ?? '';
  const name = error.name ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === 'weak_password' || name === 'AuthWeakPasswordError') {
    const reasons = error.reasons ?? error.weak_password?.reasons ?? [];
    if (reasons.includes('pwned')) return passwordErrors.weakPwned;
    if (reasons.includes('characters')) return passwordErrors.weakCharacters;
    if (reasons.includes('length')) return passwordErrors.weakLength;
    return passwordErrors.weak;
  }
  if (code === 'same_password') return passwordErrors.samePassword;
  if (LINK_EXPIRED_CODES.includes(code)) return passwordErrors.linkExpired;
  if (name === 'AuthSessionMissingError' || SESSION_CODES.includes(code)) return passwordErrors.sessionLost;
  if (code === 'user_not_found' || code === 'user_banned') return passwordErrors.accountUnavailable;
  if (error.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return passwordErrors.rateLimited;
  if (msg.includes('failed to fetch') || msg.includes('network') || name === 'AuthRetryableFetchError') return errors.network;
  return errors.generic;
}

// The redirect from an expired / used invite link carries "#error=...&error_code=otp_expired&...".
export function linkErrorMessage(hash) {
  const params = new URLSearchParams((hash ?? '').replace(/^#/, ''));
  const code = params.get('error_code') ?? '';
  if (LINK_EXPIRED_CODES.includes(code)) return passwordErrors.linkExpired;
  return null; // unknown -> the page keeps its existing generic "link invalid" text
}
