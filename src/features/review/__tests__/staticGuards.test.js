import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../..');
const read = (p) => readFileSync(join(SRC, p), 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('no secrets / no privileged access in the browser bundle sources', () => {
  const files = walk(SRC).filter((f) => /\.(jsx?|css)$/.test(f) && !f.includes('__tests__') && !f.includes('/test/'));
  it('no Gemini key, service-role key, or VITE_GEMINI anywhere in src/', () => {
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/GEMINI_API_KEY|VITE_GEMINI|SERVICE_ROLE|service_role|generativelanguage\.googleapis/i);
    }
  });
  it('only the anon key is read from env (unchanged)', () => {
    const envs = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/import\.meta\.env\.(\w+)/g)].map((m) => m[1]));
    expect([...new Set(envs)].sort()).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL']);
  });
});

describe('the AI code path can only propose', () => {
  it('AiSuggestionCard imports no write API and calls no workflow function', () => {
    const t = read('features/review/AiSuggestionCard.jsx');
    const imports = t.match(/from '\.\/reviewApi'/g);
    expect(imports).toHaveLength(1);
    expect(t.match(/import \{([^}]*)\} from '\.\/reviewApi'/)[1].split(',').map((s) => s.trim()).sort())
      .toEqual(['getCachedAiReview', 'getInflightAiReview', 'runAiReview']);
    expect(t).not.toMatch(/saveFeedback|releaseFeedback|returnForRevision|sendFeedbackToStudent|\.rpc\(|supabase/);
  });
  it('aiReviewClient talks only to the ai-review function and never to tables/RPCs/tokens', () => {
    const t = read('features/review/aiReviewClient.js');
    expect(t).not.toMatch(/\.from\(|\.rpc\(|access_token|getSession|Authorization|localStorage|sessionStorage/);
    expect(t.match(/functions\.invoke\(/g)).toHaveLength(1);
  });
  it('FeedbackForm keeps the approved rule ret = (verdict === needs_fix) in the single place, and the AI hook uses the same rule', () => {
    const t = read('features/review/FeedbackForm.jsx');
    expect(t).toContain("onChange={(verdict) => set({ verdict, ret: verdict === 'needs_fix' })}");
    expect(t).toContain("onUseVerdict={(verdict) => set({ verdict, ret: verdict === 'needs_fix' })}");
    expect(t).toContain('onUseMessage={(message) => set({ message })}');
    expect(t).not.toMatch(/runAiReview|ai-review/);
  });
  it('ReviewPage / VerdictPicker / migrations are not referencing or altered for AI', () => {
    expect(read('features/review/ReviewPage.jsx')).not.toMatch(/ai-review|AiSuggestion|aiReview/);
    expect(read('features/review/VerdictPicker.jsx')).not.toMatch(/ai-review|AiSuggestion|aiReview/);
  });
});
