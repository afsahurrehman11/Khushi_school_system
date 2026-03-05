/**
 * requestDeduplication.ts
 * Utility to deduplicate concurrent requests and provide a short-lived
 * in-memory cache for recently completed requests.
 *
 * Usage:
 *   deduplicatedFetch('key', () => fetchJson(...), 5000)
 */

type PendingRequest<T> = {
  promise: Promise<T>;
  timestamp: number; // ms since epoch when request started
};

const pendingRequests = new Map<string, PendingRequest<any>>();

/**
 * Deduplicate an async fetch function keyed by `key`.
 * If a request with the same key is in-flight or completed within `ttl` ms,
 * the existing Promise is returned. Otherwise `fetchFn` is invoked.
 */
export async function deduplicatedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl = 5000
): Promise<T> {
  const now = Date.now();
  const existing = pendingRequests.get(key);

  if (existing) {
    // if still within TTL window, reuse the promise
    if (now - existing.timestamp < ttl) {
      return existing.promise as Promise<T>;
    }
    // otherwise remove stale entry
    pendingRequests.delete(key);
  }

  // Start the fetch and store its promise immediately so concurrent callers
  // can reuse it while it's in-flight.
  const promise: Promise<T> = (async () => {
    try {
      const result = await fetchFn();
      return result;
    } finally {
      // Keep the resolved promise in the map for `ttl` ms so subsequent
      // callers during the window get the cached result. After ttl, remove it.
      setTimeout(() => {
        const current = pendingRequests.get(key);
        if (current && current.promise === promise) {
          pendingRequests.delete(key);
        }
      }, ttl);
    }
  })();

  pendingRequests.set(key, { promise, timestamp: now });
  return promise;
}

export function clearDeduplicationKey(key: string) {
  pendingRequests.delete(key);
}

export function clearAllDeduplication() {
  pendingRequests.clear();
}

export function pendingKeys(): string[] {
  return Array.from(pendingRequests.keys());
}
