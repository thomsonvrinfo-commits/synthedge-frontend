// D1 helpers shared across Workers.

const ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, no I/L/O/U

/** Generates a ULID: 48-bit timestamp + 80 bits of randomness, lexicographically sortable. */
export function ulid(date: Date = new Date()): string {
  let time = date.getTime();
  const timeChars: string[] = [];
  for (let i = 0; i < 10; i++) {
    timeChars.unshift(ULID_ENCODING.charAt(time % 32));
    time = Math.floor(time / 32);
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  let randomChars = '';
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of randomBytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      randomChars += ULID_ENCODING.charAt((bitBuffer >>> (bitCount - 5)) & 31);
      bitCount -= 5;
    }
  }

  return (timeChars.join('') + randomChars).slice(0, 26);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** Thin wrapper to make D1 first-row-or-null lookups less verbose at call sites. */
export async function d1First<T = Record<string, unknown>>(
  db: D1Database,
  query: string,
  ...bindings: unknown[]
): Promise<T | null> {
  const stmt = bindings.length ? db.prepare(query).bind(...bindings) : db.prepare(query);
  const row = await stmt.first<T>();
  return row ?? null;
}

export async function d1All<T = Record<string, unknown>>(
  db: D1Database,
  query: string,
  ...bindings: unknown[]
): Promise<T[]> {
  const stmt = bindings.length ? db.prepare(query).bind(...bindings) : db.prepare(query);
  const result = await stmt.all<T>();
  return result.results ?? [];
}

export async function d1Run(db: D1Database, query: string, ...bindings: unknown[]): Promise<D1Result> {
  const stmt = bindings.length ? db.prepare(query).bind(...bindings) : db.prepare(query);
  return stmt.run();
}
