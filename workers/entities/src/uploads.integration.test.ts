// Integration tests for R2-backed screenshot persistence (Milestone 3):
// POST /uploads, GET /uploads/:key, and the orphan-cleanup behavior wired
// into trade update/delete. Runs against the real router with a real
// SQLite DB (fakeD1) and a real in-memory R2 (fakeR2) — not mocks of the
// handlers themselves.

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createFakeD1, createFakeR2, createFakeKV } from "../../shared/src/test-utils/fakeD1";
import type { Env } from "@synthedge/shared";
import { signAccessToken, d1Run, nowIso, ulid } from "@synthedge/shared";
import worker from "./index";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations");
const JWT_SECRET = "test-secret-do-not-use-in-prod";
const ORIGIN = "http://localhost";

function makeEnv(withBucket = true): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    KV: createFakeKV(),
    BUCKET: withBucket ? createFakeR2() : undefined,
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:5173",
  } as Env;
}

async function insertUser(env: Env): Promise<string> {
  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, created_date, updated_date)
     VALUES (?, ?, NULL, 'user', 'FREE', 'TRIAL', ?, ?)`,
    id,
    `${id}@example.com`,
    now,
    now
  );
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  return signAccessToken({ sub: userId, role: "user" }, JWT_SECRET, 900);
}

function pngBytes(): Uint8Array {
  // Minimal valid-enough PNG header bytes for a fixture — content doesn't
  // need to be a real image, only its declared MIME type matters here.
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 1, 2, 3, 4, 5]);
}

function uploadRequest(token: string | null, filename: string, mimeType: string, bytes: Uint8Array): Request {
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), filename);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`${ORIGIN}/uploads`, { method: "POST", headers, body: formData });
}

describe("POST /uploads", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("requires auth", async () => {
    const res = await worker.fetch(uploadRequest(null, "a.png", "image/png", pngBytes()), env);
    expect(res.status).toBe(401);
  });

  it("uploads a valid PNG and returns a file_url pointing at this worker's own /uploads route", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);

    const res = await worker.fetch(uploadRequest(token, "a.png", "image/png", pngBytes()), env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { file_url: string };
    expect(body.file_url.startsWith(`${ORIGIN}/uploads/${userId}/`)).toBe(true);
    expect(body.file_url.endsWith(".png")).toBe(true);
  });

  it("rejects disallowed file types", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const res = await worker.fetch(
      uploadRequest(token, "a.exe", "application/x-msdownload", pngBytes()),
      env
    );
    expect(res.status).toBe(415);
  });

  it("rejects files over the size limit", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const big = new Uint8Array(6 * 1024 * 1024); // 6MB > 5MB limit
    const res = await worker.fetch(uploadRequest(token, "big.png", "image/png", big), env);
    expect(res.status).toBe(413);
  });

  it("rejects an empty file", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const res = await worker.fetch(uploadRequest(token, "empty.png", "image/png", new Uint8Array()), env);
    expect(res.status).toBe(400);
  });

  it("returns 503 if the R2 bucket isn't configured for this environment", async () => {
    const bucketlessEnv = makeEnv(false);
    const userId = await insertUser(bucketlessEnv);
    const token = await tokenFor(userId);
    const res = await worker.fetch(uploadRequest(token, "a.png", "image/png", pngBytes()), bucketlessEnv);
    expect(res.status).toBe(503);
  });
});

describe("GET /uploads/:key", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("is publicly readable (no Authorization header needed) once uploaded", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const uploadRes = await worker.fetch(uploadRequest(token, "a.png", "image/png", pngBytes()), env);
    const { file_url } = (await uploadRes.json()) as { file_url: string };

    const getRes = await worker.fetch(new Request(file_url), env);
    expect(getRes.status).toBe(200);
    const bytes = new Uint8Array(await getRes.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(pngBytes()));
    expect(getRes.headers.get("Content-Type")).toBe("image/png");
  });

  it("404s for a nonexistent key", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/uploads/someone/does-not-exist.png`), env);
    expect(res.status).toBe(404);
  });

  it("a path-traversal-style key never reaches R2 (collapsed by URL normalization first)", async () => {
    // new URL()/fetch() normalizes ".." segments in the pathname before this
    // Worker's router even sees it, so this never matches the /uploads/
    // route at all — it falls through to the standard auth-required 401,
    // one layer earlier than the explicit "..".includes() guard in
    // getUpload() (which exists as defense-in-depth, not the only guard).
    // R2 itself has no path semantics either way — keys are opaque strings,
    // not filesystem paths, so a literal ".." in a key can't escape the
    // bucket's namespace even if this route match ever changed.
    const res = await worker.fetch(new Request(`${ORIGIN}/uploads/../../etc/passwd`), env);
    expect(res.status).toBe(401);
  });
});

describe("Trade screenshot cleanup", () => {
  let env: Env;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    env = makeEnv();
    userId = await insertUser(env);
    token = await tokenFor(userId);
  });

  function jreq(method: string, path: string, body?: unknown): Request {
    return new Request(`${ORIGIN}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async function upload(): Promise<string> {
    const res = await worker.fetch(uploadRequest(token, "a.png", "image/png", pngBytes()), env);
    const body = (await res.json()) as { file_url: string };
    return body.file_url;
  }

  it("deleting a trade also deletes its screenshots from R2", async () => {
    const screenshotUrl = await upload();
    const createRes = await worker.fetch(
      jreq("POST", "/trades", { direction: "Buy", entry_price: 100, result: "Win", screenshot_before: screenshotUrl }),
      env
    );
    const trade = (await createRes.json()) as { id: string };

    // Confirm it's actually retrievable before delete.
    const before = await worker.fetch(new Request(screenshotUrl), env);
    expect(before.status).toBe(200);

    await worker.fetch(jreq("DELETE", `/trades/${trade.id}`), env);

    const after = await worker.fetch(new Request(screenshotUrl), env);
    expect(after.status).toBe(404);
  });

  it("replacing a trade's screenshot deletes the old one but keeps the new one", async () => {
    const oldUrl = await upload();
    const createRes = await worker.fetch(
      jreq("POST", "/trades", { direction: "Buy", entry_price: 100, result: "Win", screenshot_before: oldUrl }),
      env
    );
    const trade = (await createRes.json()) as { id: string };

    const newUrl = await upload();
    await worker.fetch(jreq("PATCH", `/trades/${trade.id}`, { screenshot_before: newUrl }), env);

    const oldRes = await worker.fetch(new Request(oldUrl), env);
    expect(oldRes.status).toBe(404);
    const newRes = await worker.fetch(new Request(newUrl), env);
    expect(newRes.status).toBe(200);
  });

  it("does NOT attempt to delete a screenshot URL that isn't one of our own uploads", async () => {
    const externalUrl = "https://example.com/some-image.png";
    const createRes = await worker.fetch(
      jreq("POST", "/trades", { direction: "Buy", entry_price: 100, result: "Win", screenshot_before: externalUrl }),
      env
    );
    const trade = (await createRes.json()) as { id: string };

    // Should not throw or 500 — cleanup silently no-ops for foreign URLs.
    const res = await worker.fetch(jreq("DELETE", `/trades/${trade.id}`), env);
    expect(res.status).toBe(200);
  });
});
