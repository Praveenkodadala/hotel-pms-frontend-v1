/**
 * usePropertyData — data fetching hook that re-fetches on property switch (v5)
 *
 * IMPROVEMENTS from v4:
 *   1. Uses propertyVersion from AuthContext (integer counter) as the primary
 *      trigger for refetch. This is more reliable than CustomEvent because:
 *      - React guarantees state is flushed before effects run
 *      - No setTimeout race condition
 *      - Works even if CustomEvent fires before localStorage is updated
 *
 *   2. Still listens to 'property-switched' CustomEvent as a fallback
 *      (for backward compat with any code not using this hook)
 *
 *   3. Aborts in-flight requests when the property changes, preventing
 *      stale data from a slow previous request overwriting fresh data.
 *
 * Usage:
 *   const propertyVersion = usePropertyVersion();
 *   const [rooms, loading, error, refetch] = usePropertyData(
 *     () => api.get('/rooms').then(r => r.data),
 *     [propertyVersion]   ← INCLUDE THIS to trigger refetch on switch
 *   );
 *
 * Short form (using internal propertyVersion automatically):
 *   const [rooms, loading, error, refetch] = usePropertyData(
 *     () => api.get('/rooms').then(r => r.data)
 *   );
 *   // Will refetch on property switch via CustomEvent listener
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePropertyVersion } from './usePropertyVersion.js';

export function usePropertyData(fetchFn, extraDeps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Keep fetchFn stable without requiring callers to memoize it
  const fetchRef   = useRef(fetchFn);
  fetchRef.current = fetchFn;

  // Track the fetch sequence to discard stale responses
  const seqRef = useRef(0);

  // propertyVersion from context — increments on every property switch
  const propertyVersion = usePropertyVersion();

  const load = useCallback(async () => {
    // Increment sequence number — any response from a previous seq is discarded
    const seq = ++seqRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchRef.current();

      // Discard if a newer fetch was started while this one was in-flight
      if (seq !== seqRef.current) return;

      setData(result);
    } catch (e) {
      if (seq !== seqRef.current) return;
      // Don't treat cancellations as errors
      if (e.name === 'CanceledError' || e.code === 'ERR_CANCELED') return;
      setError(e.response?.data?.error || e.message || 'Failed to load');
      console.error('[usePropertyData]', e.message);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [propertyVersion, ...extraDeps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch on mount and whenever deps (including propertyVersion) change
  useEffect(() => {
    load();
  }, [load]);

  return [data, loading, error, load];
}

export default usePropertyData;
