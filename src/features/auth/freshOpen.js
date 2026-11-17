// Re-entry routing. When the app is opened fresh (a new browsing context: tapping the home-screen icon, reopening the
// browser, a new tab) the browser restores the LAST URL, so a signed-in user landed on whatever screen they had last
// (e.g. the question bank). Rule: the first page load of a browsing context with an active session goes to the role's
// dashboard, exactly like a normal login. sessionStorage survives reloads of the same tab, so a refresh in the middle
// of work is never redirected, and ordinary in-app navigation is never touched (this runs once per page load).
// Shared assignment links and the password-set page are honoured.
import { isSharedLink } from './postLogin';

const KEY = 'hevanti:booted';
let cached = null;

export function isFreshOpen(storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  if (cached !== null) return cached;
  try {
    cached = !storage || storage.getItem(KEY) !== '1';
    storage?.setItem(KEY, '1');
  } catch { cached = false; } // storage blocked: never redirect (safe default)
  return cached;
}
export const resetFreshOpenForTests = () => { cached = null; };

// Where a fresh open should go, or null to stay.
export function freshOpenTarget(path, home) {
  if (path === home || path === '/login' || path === '/set-password') return null;
  if (isSharedLink(path)) return null;
  return home;
}
