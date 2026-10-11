// R1B-3 — underline: ++text++  →  <u>text</u>  (HTML stays skipped; this works on the Markdown AST, so nothing is injected).
//
// Flanking rules, like Markdown's own emphasis, so programming text is never touched:
//   opener "++": exactly two pluses; NOT after a letter/digit; must be followed by non-space content
//   closer "++": exactly two pluses; must follow non-space content; NOT before a letter/digit
// Hence `i++`, `C++`, `x=i++;y=j++;`, `a++ + b++`, `i++ < n` stay as they are. Code, inline code and formulas are other
// node types, so they are never searched. It also spans other inline nodes: `++**מודגש**++`, `++a $x^2$ b++`.

const ALNUM = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

function markersIn(value) {
  const out = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    if (value[i] === '+' && value[i + 1] === '+' && value[i - 1] !== '+' && value[i + 2] !== '+') { out.push(i); i += 1; }
  }
  return out;
}

function transformChildren(children) {
  // 1. collect candidate markers with their role
  const marks = []; // { node, offset, canOpen, canClose }
  children.forEach((node, ni) => {
    if (node.type !== 'text') return;
    for (const off of markersIn(node.value)) {
      const prev = off > 0 ? node.value[off - 1] : null;
      const next = off + 2 < node.value.length ? node.value[off + 2] : null;
      const hasPrevNode = off === 0 && ni > 0;
      const hasNextNode = off + 2 === node.value.length && ni < children.length - 1;
      const prevIsAlnum = prev !== null && ALNUM.test(prev);
      const prevIsSpace = prev === null ? !hasPrevNode : SPACE.test(prev);
      const nextIsAlnum = next !== null && ALNUM.test(next);
      const nextIsSpace = next === null ? !hasNextNode : SPACE.test(next);
      marks.push({
        ni, off,
        canOpen: !prevIsAlnum && !nextIsSpace,
        canClose: !prevIsSpace && !nextIsAlnum,
      });
    }
  });
  if (marks.length < 2) return children;

  // 2. pair them greedily left to right: an opener takes the next closer
  const pairs = [];
  for (let a = 0; a < marks.length; a += 1) {
    if (!marks[a].canOpen) continue;
    const b = marks.findIndex((m, k) => k > a && m.canClose);
    if (b === -1) break;
    pairs.push([marks[a], marks[b]]);
    a = b;
  }
  if (!pairs.length) return children;

  // 3. rebuild the child list, cutting text nodes at the markers
  const result = [];
  let cursor = { ni: 0, off: 0 };
  const pushText = (value) => { if (value) result.push({ type: 'text', value }); };
  let stack = null; // children collected inside an open underline
  const emit = (node) => (stack ? stack.push(node) : result.push(node));
  const emitText = (value) => { if (value) emit({ type: 'text', value }); };
  const events = pairs.flatMap(([o, c]) => [{ ...o, kind: 'open' }, { ...c, kind: 'close' }]);
  let ei = 0;
  for (let ni = 0; ni < children.length; ni += 1) {
    const node = children[ni];
    if (node.type !== 'text') { emit(node); continue; }
    let from = 0;
    while (ei < events.length && events[ei].ni === ni) {
      const ev = events[ei];
      emitText(node.value.slice(from, ev.off));
      from = ev.off + 2;
      if (ev.kind === 'open') stack = [];
      else {
        const kids = stack; stack = null;
        result.push({ type: 'underline', data: { hName: 'u' }, children: kids });
      }
      ei += 1;
    }
    emitText(node.value.slice(from));
  }
  void cursor; void pushText;
  return result;
}

function visit(node) {
  if (!node.children) return;
  // never look inside code or math (they have no children anyway), and recurse first so nested containers are handled
  node.children.forEach(visit);
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'math' || node.type === 'inlineMath') return;
  if (node.children.some((c) => c.type === 'text' && c.value.includes('++'))) node.children = transformChildren(node.children);
}

export default function remarkUnderline() {
  return (tree) => visit(tree);
}
