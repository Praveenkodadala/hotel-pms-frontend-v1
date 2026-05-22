/**
 * AuthContext — Multi-property state management (ESM) v5
 *
 * PROPERTY SWITCHING FIX:
 *   The root cause of stale data after property switching was a race condition:
 *   pages were refetching before the new X-Property-ID header was written.
 *
 *   Fix: switchProperty() now updates ALL headers + localStorage SYNCHRONOUSLY,
 *   THEN increments propertyVersion. Pages react to propertyVersion changes,
 *   so by the time they refetch, the correct header is guaranteed to be set.
 *
 * SUPER ADMIN:
 *   - No tenant_id
 *   - May or may not have an active_property_id (optional context selection)
 *   - Bypasses all property scope checks on the backend
 *   - Frontend shows property switcher but switching is optional/contextual
 *
 * STABLE REFERENCES:
 *   All functions use useCallback to prevent unnecessary re-renders in
 *   consuming components that depend on these functions.
 */

import {
  createContext, useContext, useState,
  useEffect, useCallback, useRef,
} from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,            setUser]           = useState(null);
  const [properties,      setProperties]     = useState([]);
  const [activeProperty,  setActiveProperty] = useState(null);
  const [loading,         setLoading]        = useState(true);

  /**
   * propertyVersion increments on every successful property switch.
   * Pages add this to their useEffect dependency array to trigger refetches.
   * This is more reliable than CustomEvent because React guarantees the
   * state update is processed before child components re-render.
   */
  const [propertyVersion, setPropertyVersion] = useState(0);
  const switchingRef = useRef(false);

  // ── Session restore on mount ────────────────────────────────────
  useEffect(() => {
    const token      = localStorage.getItem('pms_token');
    const propertyId = localStorage.getItem('pms_active_property_id');

    if (!token) { setLoading(false); return; }

    // Restore headers BEFORE calling /me — order matters
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    if (propertyId) api.defaults.headers.common['X-Property-ID'] = propertyId;

    api.get('/auth/me')
      .then(r => {
        const { properties: props = [], active_property, ...userData } = r.data;
        setUser(userData);
        setProperties(props);

        const active = active_property || props[0] || null;
        setActiveProperty(active);

        // Ensure headers reflect the actual active property
        if (active?.id) {
          localStorage.setItem('pms_active_property_id', active.id);
          api.defaults.headers.common['X-Property-ID'] = active.id;
        } else if (userData.role === 'super_admin') {
          // Super admin may not have a property — clear stale header
          delete api.defaults.headers.common['X-Property-ID'];
          localStorage.removeItem('pms_active_property_id');
        }
      })
      .catch(() => {
        // Token invalid or expired — clear everything
        localStorage.removeItem('pms_token');
        localStorage.removeItem('pms_active_property_id');
        delete api.defaults.headers.common['Authorization'];
        delete api.defaults.headers.common['X-Property-ID'];
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Login ───────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { user: userData, properties: props = [], active_property, token } = data;

    // Set token first — all subsequent calls need it
    localStorage.setItem('pms_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Set active property header
    const activeProp = active_property || props[0] || null;
    if (activeProp?.id) {
      localStorage.setItem('pms_active_property_id', activeProp.id);
      api.defaults.headers.common['X-Property-ID'] = activeProp.id;
    } else {
      // Super admin with no properties yet
      localStorage.removeItem('pms_active_property_id');
      delete api.defaults.headers.common['X-Property-ID'];
    }

    setUser(userData);
    setProperties(props);
    setActiveProperty(activeProp);
    setPropertyVersion(v => v + 1);

    return data;
  }, []);

  // ── Logout ──────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('pms_token');
    localStorage.removeItem('pms_active_property_id');
    delete api.defaults.headers.common['Authorization'];
    delete api.defaults.headers.common['X-Property-ID'];
    setUser(null);
    setProperties([]);
    setActiveProperty(null);
    setPropertyVersion(0);
  }, []);

  // ── Switch property ─────────────────────────────────────────────
  //
  // CRITICAL ORDER OF OPERATIONS — do not change the sequence:
  // 1. Validate on backend (get new token)
  // 2. Write new token to localStorage
  // 3. Update axios Authorization header (SYNC)
  // 4. Write new property ID to localStorage (SYNC)
  // 5. Update axios X-Property-ID header (SYNC)
  // 6. Update React state
  // 7. Increment propertyVersion — this triggers page refetches
  // 8. Fire CustomEvent for any legacy listeners
  //
  // Steps 3-5 happen synchronously before step 7, so any refetch
  // triggered by propertyVersion change will use the correct headers.
  //
  const switchProperty = useCallback(async (propertyId) => {
    if (switchingRef.current) return null; // prevent double-click
    if (propertyId === activeProperty?.id) return activeProperty;

    switchingRef.current = true;
    try {
      const { data } = await api.post('/auth/switch-property', { property_id: propertyId });

      // STEP 1-5: Synchronous writes (guarantee correct headers before refetch)
      localStorage.setItem('pms_token', data.token);
      api.defaults.headers.common['Authorization']  = `Bearer ${data.token}`;
      localStorage.setItem('pms_active_property_id', propertyId);
      api.defaults.headers.common['X-Property-ID'] = propertyId;

      // STEP 6: React state
      setActiveProperty(data.active_property);

      // STEP 7: Version bump — pages watching this will refetch
      setPropertyVersion(v => v + 1);

      // STEP 8: CustomEvent for legacy usePropertyData hook
      window.dispatchEvent(
        new CustomEvent('property-switched', { detail: data.active_property })
      );

      return data.active_property;
    } finally {
      switchingRef.current = false;
    }
  }, [activeProperty?.id]);

  // ── Role helpers ────────────────────────────────────────────────
  const isSuperAdmin = useCallback(() => user?.role === 'super_admin', [user?.role]);

  const isAtLeast = useCallback((role) => {
    const w = {
      super_admin:  100,
      hotel_admin:   80,
      manager:       60,
      receptionist:  40,
      housekeeping:  20,
    };
    return (w[user?.role] || 0) >= (w[role] || 0);
  }, [user?.role]);

  const hasRole = useCallback((...roles) => roles.includes(user?.role), [user?.role]);

  return (
    <AuthContext.Provider value={{
      user,
      properties,
      activeProperty,
      loading,
      propertyVersion,   // ← add to useEffect deps to refetch on property switch
      login,
      logout,
      switchProperty,
      isSuperAdmin,
      isAtLeast,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

/**
 * usePropertyVersion — returns just the version number.
 * Add to useEffect dependency array in page components to trigger
 * data refetch when the user switches properties.
 *
 * Example:
 *   const propertyVersion = usePropertyVersion();
 *   useEffect(() => {
 *     fetchRooms(); // runs on mount AND on every property switch
 *   }, [propertyVersion]);
 */
export const usePropertyVersion = () => {
  const { propertyVersion } = useAuth();
  return propertyVersion;
};

export default AuthContext;
