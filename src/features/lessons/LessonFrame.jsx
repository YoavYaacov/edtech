import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSrcdoc, newToken, readFrameMessage, SANDBOX } from './lessonSandbox';
import { readProgress, writeProgress } from './lessonProgress';
import styles from './lessons.module.css';

// The nearest ancestor that actually scrolls (the app shell's content area), else the window.
function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// Native-feeling lesson: borderless, no inner scrollbar. The frame grows to the lesson's content height, so the
// APP's own scroll is the only scroll. The lesson is sandboxed (scripts only, opaque origin, strict CSP) and talks
// to the shell only through the validated postMessage bridge.
//   html          stored, sanitised bundle
//   storageKey    local progress key (user + lesson + published version). null = no progress (previews)
export default function LessonFrame({ html, storageKey = null, title }) {
  const ref = useRef(null);
  const token = useMemo(() => newToken(), [html, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [height, setHeight] = useState(null);
  // progress is read ONCE per bundle/version: the frame owns it afterwards
  const srcDoc = useMemo(
    () => buildSrcdoc(html, { token, progress: storageKey ? readProgress(storageKey) : null, vh: window.innerHeight }),
    [html, token, storageKey],
  );

  useEffect(() => {
    function onMessage(event) {
      const msg = readFrameMessage(event, ref.current?.contentWindow, token);
      if (!msg) return;
      if (msg.type === 'height') setHeight(msg.h);
      else if (msg.type === 'progress') { if (storageKey) writeProgress(storageKey, msg.value); }
      else if (msg.type === 'scroll') {
        const f = ref.current; if (!f) return;
        const sp = scrollParent(f);
        const frameTop = f.getBoundingClientRect().top;
        if (sp) sp.scrollTo({ top: sp.scrollTop + frameTop - sp.getBoundingClientRect().top + msg.y - 8, behavior: 'smooth' });
        else window.scrollTo({ top: window.scrollY + frameTop + msg.y - 8, behavior: 'smooth' });
      }
    }
    function onResize() {
      ref.current?.contentWindow?.postMessage({ hevanti: 1, token, type: 'viewport', vh: window.innerHeight }, '*');
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('resize', onResize); };
  }, [token, storageKey]);

  useEffect(() => { setHeight(null); }, [srcDoc]);

  return (
    <iframe ref={ref} className={styles.frame} title={title} sandbox={SANDBOX} srcDoc={srcDoc} scrolling="no"
      referrerPolicy="no-referrer" allow="" style={{ height: height ?? Math.round(window.innerHeight * 0.6) }} />
  );
}
