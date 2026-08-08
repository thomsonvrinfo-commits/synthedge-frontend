// A minimal D1Database-shaped adapter over Node's built-in node:sqlite,
// implementing exactly the surface this codebase actually uses
// (prepare().bind(...).first()/.all()/.run()). This lets us run REAL
// integration tests — actual SQL executing against the actual schema —
// without needing the full Workers runtime, which has dependency conflicts
// in this environment (see auth Worker build notes). Test-only; never
// imported by any Worker's production code path.
//
// Lives in workers/shared so every Worker's integration tests (auth,
// entities, candles, ...) share one implementation instead of each growing
// its own drifting copy — originally lived only under workers/auth.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

/**
 * Accepts a migrations directory (every *.sql file in it applied in
 * alphabetical order, e.g. 0001_..., 0002_... — same effect as D1's own
 * `migrations_dir`), a single .sql file, or an explicit list of files.
 * Passing the directory is preferred so a new migration is automatically
 * picked up by every Worker's tests without editing each test file.
 */
export function createFakeD1(schemaPath: string | string[]): D1Database {
  const db = new DatabaseSync(':memory:');

  const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
  const files = paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith('.sql'))
          .sort()
          .map((f) => join(p, f))
      : [p]
  );
  for (const file of files) {
    db.exec(readFileSync(file, 'utf8'));
  }

  function makeStatement(query: string, boundArgs: unknown[]) {
    const stmt = db.prepare(query);
    return {
      async first<T>() {
        const row = boundArgs.length ? stmt.get(...(boundArgs as any[])) : stmt.get();
        return (row ?? null) as T | null;
      },
      async all<T>() {
        const rows = boundArgs.length ? stmt.all(...(boundArgs as any[])) : stmt.all();
        return { results: rows as T[], success: true, meta: {} } as unknown as D1Result<T>;
      },
      async run() {
        const info = boundArgs.length ? stmt.run(...(boundArgs as any[])) : stmt.run();
        return {
          success: true,
          meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
        } as unknown as D1Result;
      },
    };
  }

  const fake = {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          bound = args;
          return makeStatement(query, bound) as any;
        },
        ...makeStatement(query, bound),
      };
      return statement as any;
    },
  };

  return fake as unknown as D1Database;
}

export function createFakeKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

/**
 * A minimal R2Bucket-shaped in-memory adapter. Supports the real
 * `.put()`/`.get()`/`.delete()` surface (needed by the uploads Worker
 * routes) plus a `__put` shortcut for tests that just need to seed a raw
 * buffer directly (candles-worker's fixture data). Test-only; never
 * imported by production code.
 */
export function createFakeR2(): R2Bucket & { __put: (key: string, buffer: ArrayBuffer) => void } {
  interface StoredObject {
    buffer: ArrayBuffer;
    contentType?: string;
  }
  const store = new Map<string, StoredObject>();

  const bucket = {
    async get(key: string) {
      const stored = store.get(key);
      if (!stored) return null;
      return {
        async arrayBuffer() {
          return stored.buffer;
        },
        get body() {
          return new Blob([stored.buffer]).stream();
        },
        writeHttpMetadata(headers: Headers) {
          if (stored.contentType) headers.set("Content-Type", stored.contentType);
        },
      } as unknown as R2ObjectBody;
    },
    async put(key: string, value: ArrayBuffer | ArrayBufferView, options?: R2PutOptions) {
      const buffer =
        value instanceof ArrayBuffer ? value : (value as ArrayBufferView).buffer.slice(0) as ArrayBuffer;
      store.set(key, { buffer, contentType: options?.httpMetadata && "contentType" in options.httpMetadata ? (options.httpMetadata as { contentType?: string }).contentType : undefined });
      return null as unknown as R2Object;
    },
    async delete(key: string) {
      store.delete(key);
    },
    __put(key: string, buffer: ArrayBuffer) {
      store.set(key, { buffer });
    },
  };

  return bucket as unknown as R2Bucket & { __put: (key: string, buffer: ArrayBuffer) => void };
}

/** Gzip-compresses a JS value to an ArrayBuffer, matching how real candle fixtures are stored in R2. */
export async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}
