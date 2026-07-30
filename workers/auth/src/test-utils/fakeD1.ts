// A minimal D1Database-shaped adapter over Node's built-in node:sqlite,
// implementing exactly the surface this codebase actually uses
// (prepare().bind(...).first()/.all()/.run()). This lets us run REAL
// integration tests — actual SQL executing against the actual schema —
// without needing the full Workers runtime, which has dependency conflicts
// in this environment (see auth Worker build notes). Test-only; never
// imported by any Worker's production code path.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export function createFakeD1(schemaPath: string): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaPath, 'utf8'));

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
