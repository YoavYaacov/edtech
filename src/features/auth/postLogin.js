// Where to go right after a successful login.
//
// RequireRole remembers the page the visitor tried to open while signed out (state.from) so that a LINK people actually
// share (an assignment sent to a student, a submission the teacher is sent to review) still lands where it should.
// Problem found on mobile: browsers reopen the last visited screen (or a home-screen shortcut) - a list, a form, an import -
// so after login people landed on that screen instead of the dashboard.
// Rule: on a phone-sized screen only those shared assignment links are honoured; everything else goes to the dashboard
// (the root sends each role to its own). On a wide screen (desktop) behaviour is unchanged: back to the remembered page.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SHARED_LINK = new RegExp(`^/(student|teacher)/assignments/${UUID}(/review)?$`, 'i');

export const isSharedLink = (path) => typeof path === 'string' && SHARED_LINK.test(path);

export function postLoginPath(from, { narrow = false } = {}) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from === '/login') return '/';
  if (narrow && !isSharedLink(from)) return '/';
  return from;
}

export const isNarrowScreen = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 768px)').matches : false);
