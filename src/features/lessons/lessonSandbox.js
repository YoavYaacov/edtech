// Isolation of lesson code. Three independent layers:
//  1. <iframe sandbox="allow-scripts"> WITHOUT allow-same-origin => opaque origin: no access to the app's DOM,
//     cookies, localStorage/sessionStorage, IndexedDB or Supabase session; no top navigation, popups, forms, downloads.
//  2. A strict CSP <meta> that is the FIRST thing in the document's <head>: no network of any kind
//     (connect/frame/object/form-action/base-uri), only inline script/style and data:/blob: media.
//  3. The document is re-serialised from a parsed DOM, so injected markup can never end up inside a comment/attribute.
// The only channel to the shell is postMessage, validated by source window + per-mount token.

export const SANDBOX = 'allow-scripts';

export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const MAX_PROGRESS_BYTES = 64 * 1024;
export const MIN_FRAME_HEIGHT = 200;
export const MAX_FRAME_HEIGHT = 40000;

// Runs inside the lesson. Exposes window.Hevanti = { progress.get/set, scrollTo(elOrY), viewportHeight }.
// --hv-vh (CSS var) = visible height available to the lesson: use it instead of 100vh (avoids height feedback loops).
const BRIDGE = `(function(){
var INIT=__INIT__,P=window.parent,progress=INIT.progress;
function post(m){m.hevanti=1;m.token=INIT.token;P.postMessage(m,'*');}
function clone(v){return v===undefined?null:JSON.parse(JSON.stringify(v));}
function setVh(v){document.documentElement.style.setProperty('--hv-vh',v+'px');}
setVh(INIT.vh);
window.Hevanti=Object.freeze({version:1,
progress:Object.freeze({get:function(){return clone(progress);},set:function(v){progress=clone(v);post({type:'progress',value:progress});}}),
scrollTo:function(t){var y=typeof t==='number'?t:(t&&t.getBoundingClientRect?t.getBoundingClientRect().top+window.pageYOffset:0);post({type:'scroll',y:y});},
viewportHeight:function(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hv-vh'))||INIT.vh;}});
window.addEventListener('message',function(e){var d=e.data;if(e.source===P&&d&&d.hevanti===1&&d.token===INIT.token&&d.type==='viewport'&&typeof d.vh==='number')setVh(d.vh);});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(!a)return;e.preventDefault();var h=a.getAttribute('href');if(h&&h.charAt(0)==='#'&&h.length>1){var el=document.getElementById(decodeURIComponent(h.slice(1)));if(el)window.Hevanti.scrollTo(el);}},true);
var last=0,raf=0;function h(){var d=document.documentElement,b=document.body;return Math.ceil(Math.max(d.getBoundingClientRect().height,b?b.scrollHeight:0));}
function send(){raf=0;var v=h();if(Math.abs(v-last)>=2){last=v;post({type:'height',h:v});}}
function sched(){if(!raf)raf=requestAnimationFrame(send);}
function start(){if(typeof ResizeObserver==='function'){var ro=new ResizeObserver(sched);ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}window.addEventListener('load',sched);new MutationObserver(sched).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});sched();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();`;

// JSON for an inline <script>: nothing in it can close the tag or break the parser.
export function safeJson(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// bundleHtml: the stored, already-sanitised document. init: { token, progress, vh }.
export function buildSrcdoc(bundleHtml, init) {
  const parsed = new DOMParser().parseFromString(String(bundleHtml), 'text/html'); // inert: nothing runs here
  parsed.head.querySelectorAll('meta[http-equiv], base').forEach((n) => n.remove());
  const attrs = Array.from(parsed.documentElement.attributes)
    .map((a) => ` ${a.name}="${esc(a.value)}"`).join('');
  const inject = `<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}"><script>${BRIDGE.replace('__INIT__', safeJson(init))}</script>`;
  return `<!DOCTYPE html><html${attrs}><head>${inject}${parsed.head.innerHTML}</head>${parsed.body.outerHTML}</html>`;
}

// Validates a message coming from the lesson frame. Returns the data or null.
export function readFrameMessage(event, frameWindow, token) {
  if (!frameWindow || event.source !== frameWindow) return null;
  const d = event.data;
  if (!d || typeof d !== 'object' || d.hevanti !== 1 || d.token !== token) return null;
  if (d.type === 'height' && Number.isFinite(d.h)) {
    return { type: 'height', h: Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(d.h))) };
  }
  if (d.type === 'progress') {
    let s;
    try { s = JSON.stringify(d.value ?? null); } catch { return null; }
    if (s === undefined || s.length > MAX_PROGRESS_BYTES) return null;
    return { type: 'progress', value: d.value ?? null };
  }
  if (d.type === 'scroll' && Number.isFinite(d.y)) return { type: 'scroll', y: Math.max(0, d.y) };
  return null;
}

export const newToken = () => {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};
