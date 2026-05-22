/**
 * usePropertyVersion — standalone hook to access the property version counter.
 *
 * Separated into its own file so usePropertyData.js can import it
 * without creating a circular dependency with AuthContext.
 */

import { useContext } from 'react';
import AuthContext    from '../context/AuthContext.jsx';

export function usePropertyVersion() {
  const ctx = useContext(AuthContext);
  return ctx?.propertyVersion ?? 0;
}

export default usePropertyVersion;
