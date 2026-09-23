import { errors } from '../i18n/he';

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
