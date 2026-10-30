type Entry = {
  value: unknown;
  expiresAt: number;
  tags: string[];
};

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_KEYS = 500;

function evictIfNeeded() {
  if (memory.size <= MAX_KEYS) return;
  const now = Date.now();
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
  if (memory.size <= MAX_KEYS) return;
  const extra = memory.size - MAX_KEYS;
  const keys = memory.keys();
  for (let i = 0; i < extra; i++) {
    const next = keys.next();
    if (next.done) break;
    memory.delete(next.value);
  }
}

export function rememberGet<T>(key: string): T | undefined {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function rememberSet<T>(key: string, value: T, ttlMs: number, tags: string[] = []) {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs, tags });
  evictIfNeeded();
}

export function remember<T>(
  key: string,
  tags: string[],
  ttlMs: number,
  load: () => Promise<T>,
  opts?: { force?: boolean },
): Promise<T> {
  if (opts?.force) memory.delete(key);
  else {
    const hit = rememberGet<T>(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }
  const p = load()
    .then((value) => {
      rememberSet(key, value, value == null ? Math.min(ttlMs, 3_000) : ttlMs, tags);
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

export function forgetTag(tag: string) {
  for (const [key, entry] of memory) {
    if (key === tag || key.startsWith(`${tag}:`) || key.startsWith(`${tag}/`) || entry.tags.includes(tag)) {
      memory.delete(key);
    }
  }
}

export function forgetPrefix(prefix: string) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}
