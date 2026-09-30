// BOOT tests: load the REAL entrypoint (index.ts) — and the single-file deploy bundle — in a real Deno runtime.
//
// Why: the handler tests inject a fake Store, so they never import index.ts or store.ts. A broken import/export
// between index.ts <-> store.ts/handler.ts (Production BootFailure: "./store.ts does not provide an export named
// 'createStore'") was therefore invisible. Here the module graph is really linked, `Deno.serve` really starts and a
// real HTTP request goes through index -> handler -> createStore.
//
// Requires a `deno` binary: devDependency "deno" (node_modules/.bin/deno) or one on PATH. Missing deno = hard failure
// (a silent skip is exactly how the gap went unnoticed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FUNCTIONS = join(ROOT, "supabase/functions");
const STUB = pathToFileURL(join(HERE, "sb-stub.ts")).href;

function findDeno(): string {
  for (const c of [join(ROOT, "node_modules/.bin/deno"), "deno"]) {
    if (spawnSync(c, ["--version"]).status === 0) return c;
  }
  throw new Error("deno binary not found: run `npm install` (devDependency deno) — boot tests must not be skipped");
}
const DENO = findDeno();

function makeImportMap(dir: string): string {
  const p = join(dir, "import-map.json");
  writeFileSync(p, JSON.stringify({ imports: { "npm:@supabase/supabase-js@2": STUB } }));
  return p;
}

let nextPort = 18700 + (process.pid % 200);

// Starts the entrypoint; resolves with { exitedEarly, stderr } or a live server to query.
async function boot(entry: string, withEnv: boolean) {
  const port = nextPort++;
  const dir = mkdtempSync(join(tmpdir(), "boot-"));
  const env: Record<string, string> = { ...process.env as Record<string, string>, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, ALLOWED_ORIGINS: "https://app.example" };
  if (withEnv) Object.assign(env, { SUPABASE_URL: "https://x.invalid", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SITE_URL: "https://app.example" });
  const child = spawn(DENO, ["run", "--no-check", "--allow-env", "--allow-net=127.0.0.1", "--import-map", makeImportMap(dir), entry], { env });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  let exited: number | null = null;
  child.on("exit", (c) => (exited = c ?? -1));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (exited !== null) break;
    try { await fetch(base, { method: "OPTIONS" }); return { base, stderr: () => stderr, stop: () => { child.kill(); rmSync(dir, { recursive: true, force: true }); } }; }
    catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  child.kill(); rmSync(dir, { recursive: true, force: true });
  return { base: null as string | null, stderr: () => stderr, stop: () => {} };
}

const FUNCS = ["invite-student", "delete-student"];

for (const fn of FUNCS) {
  test(`${fn}: source entrypoint boots and serves (index -> handler -> createStore really linked)`, async () => {
    const s = await boot(join(FUNCTIONS, fn, "index.ts"), true);
    try {
      assert.ok(s.base, `BootFailure:\n${s.stderr()}`);
      const pre = await fetch(s.base, { method: "OPTIONS", headers: { Origin: "https://app.example" } });
      assert.equal(pre.status, 200);
      // POST goes through the real createStore(...).authenticate() -> stub client -> null user -> 401
      const res = await fetch(s.base, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example" }, body: "{}" });
      const body = await res.json();
      assert.equal(res.status, 401, JSON.stringify(body));
      assert.equal(body.error, "unauthorized");
    } finally { s.stop(); }
  });

  test(`${fn}: without env the function still boots and answers server_misconfigured (not a crash)`, async () => {
    const s = await boot(join(FUNCTIONS, fn, "index.ts"), false);
    try {
      assert.ok(s.base, `BootFailure:\n${s.stderr()}`);
      const res = await fetch(s.base, { method: "POST", body: "{}" });
      assert.equal(res.status, 500);
      assert.equal((await res.json()).error, "server_misconfigured");
    } finally { s.stop(); }
  });

  test(`${fn}: type-checks (deno check, real npm types)`, () => {
    const r = spawnSync(DENO, ["check", join(FUNCTIONS, fn, "index.ts")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });

  test(`${fn}: the single-file deploy bundle boots and serves`, async () => {
    const bundle = join(ROOT, "supabase/functions-bundled", fn, "index.ts");
    assert.ok(existsSync(bundle), "run `npm run build:edge` and commit supabase/functions-bundled");
    const s = await boot(bundle, true);
    try {
      assert.ok(s.base, `BootFailure:\n${s.stderr()}`);
      const res = await fetch(s.base, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(res.status, 401);
    } finally { s.stop(); }
  });

  test(`${fn}: bundle is up to date with the sources`, () => {
    const out = mkdtempSync(join(tmpdir(), "bundle-"));
    const r = spawnSync(DENO, ["bundle", "--platform", "deno", "--external", "npm:*", "-o", join(out, "index.js"), join(FUNCTIONS, fn, "index.ts")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const fresh = readFileSync(join(out, "index.js"), "utf8");
    const committed = readFileSync(join(ROOT, "supabase/functions-bundled", fn, "index.ts"), "utf8");
    assert.equal(committed.replace(/^\/\/ GENERATED[^\n]*\n/, ""), fresh, "bundle is stale: run `npm run build:edge`");
    rmSync(out, { recursive: true, force: true });
  });

  // The regression itself: reproduce what was deployed (an index.ts whose ./store.ts has no `createStore` export)
  // and prove that THIS test suite detects it. Without the boot test above this mutation passes every handler test.
  test(`${fn}: MUTATION — a store.ts without the createStore export is caught as a BootFailure`, async () => {
    const copy = mkdtempSync(join(tmpdir(), "mut-"));
    cpSync(join(FUNCTIONS, fn), copy, { recursive: true });
    const storePath = join(copy, "store.ts");
    const src = readFileSync(storePath, "utf8");
    assert.ok(/export function createStore/.test(src));
    writeFileSync(storePath, src.replace("export function createStore", "function createStore"));
    const s = await boot(join(copy, "index.ts"), true);
    try {
      assert.equal(s.base, null, "a function with a missing export must NOT boot");
      assert.match(s.stderr(), /does not provide an export named 'createStore'/);
    } finally { s.stop(); rmSync(copy, { recursive: true, force: true }); }
  });
}
