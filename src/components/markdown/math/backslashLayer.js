import { SHORTCUTS, suggest } from './shortcuts';

// The "\" layer (approved in the R1B spike): typing "\" in the formula field opens a small suggestion list; typing the
// code (\c, \vec, \bin …) narrows it; Enter / Space / Tab confirm, Esc or Backspace-on-empty cancels. A code that no
// other code extends (\pi, \le, \R) runs at once. Keyboard-layout independent (uses e.code when the Hebrew layout
// changes e.key), so Shift never cancels (\R) and it works with a Hebrew keyboard active.
//
// Space also inserts a REAL visible space in math mode (MathLive ignores plain spaces), and Tab moves to the next empty
// slot inside a structure (e.g. \bin: top → bottom). With no empty slot left Tab leaves the field like in any form (verified in
// Chromium) instead of MathLive's default "select everything" wrap-around.
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const letterOf = (e) => {
  if (/^[A-Za-z]$/.test(e.key)) return e.key;
  const m = /^Key([A-Z])$/.exec(e.code || '');
  return m ? (e.shiftKey ? m[1] : m[1].toLowerCase()) : null;
};

export function insertShortcut(mf, s) {
  mf.focus();
  mf.executeCommand(['insert', s.latex, { selectionMode: 'placeholder', focus: true, feedback: false }]);
}

export function attachBackslashLayer(mf, pop, { onChange = () => {} } = {}) {
  let on = false; let buf = ''; let list = []; let idx = 0;

  function draw() {
    list = suggest(buf);
    if (idx >= list.length) idx = 0;
    pop.innerHTML = `<div class="bsl-h">\\${esc(buf)}▌</div>${list.length
      ? list.map((s, i) => `<div class="bsl-it${i === idx ? ' bsl-on' : ''}" data-i="${i}"><span class="bsl-g">${esc(s.label)}</span><span class="bsl-k">\\${esc(s.key)}</span><span>${esc(s.name)}</span></div>`).join('')
      : '<div class="bsl-h bsl-none">אין התאמה – Esc לביטול</div>'}`;
    pop.hidden = false;
  }
  function close() { on = false; buf = ''; idx = 0; pop.hidden = true; }
  function accept(s) { close(); insertShortcut(mf, s); onChange(); }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!on && (e.key === ' ' || e.code === 'Space') && !e.shiftKey && mf.mode === 'math') {
      e.preventDefault(); e.stopImmediatePropagation();
      mf.executeCommand(['insert', '\\ {}', { focus: true, feedback: false }]); onChange();
      return;
    }
    if (!on && e.key === 'Tab') {
      // next/previous EMPTY slot of the structure (\bin: top → bottom); with no slot left MathLive moves focus out of the field
      e.preventDefault(); e.stopImmediatePropagation();
      mf.executeCommand(e.shiftKey ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder');
      return;
    }
    if (!on) {
      if (e.key === '\\' || e.code === 'Backslash') { e.preventDefault(); e.stopImmediatePropagation(); on = true; buf = ''; idx = 0; draw(); }
      return;
    }
    if (['Shift', 'CapsLock', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === '\\' || e.code === 'Backslash') { buf = ''; idx = 0; draw(); return; }
    const ch = letterOf(e);
    if (ch) {
      buf += ch; idx = 0; draw();
      const ex = SHORTCUTS.find((s) => s.key === buf);
      if (ex && !SHORTCUTS.some((s) => s !== ex && s.key.startsWith(buf))) accept(ex);
    } else if (e.key === 'Backspace') {
      if (!buf) close(); else { buf = buf.slice(0, -1); idx = 0; draw(); }
    } else if (e.key === 'ArrowDown') { idx = (idx + 1) % Math.max(list.length, 1); draw(); }
    else if (e.key === 'ArrowUp') { idx = (idx - 1 + list.length) % Math.max(list.length, 1); draw(); }
    else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') && list[idx]) accept(list[idx]);
    else close();
  }
  function onPopDown(e) {
    e.preventDefault();
    const it = e.target.closest('[data-i]');
    if (it && list[+it.dataset.i]) accept(list[+it.dataset.i]);
  }
  const onBlur = () => { if (on) close(); };

  mf.addEventListener('keydown', onKeyDown, true);
  mf.addEventListener('blur', onBlur);
  pop.addEventListener('mousedown', onPopDown);
  return {
    isOpen: () => on,
    close,
    detach() { mf.removeEventListener('keydown', onKeyDown, true); mf.removeEventListener('blur', onBlur); pop.removeEventListener('mousedown', onPopDown); close(); },
  };
}
