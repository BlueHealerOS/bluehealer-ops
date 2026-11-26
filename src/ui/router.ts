import { useEffect, useState } from 'react';

export function parseHash(h: string): { segments: string[]; query: string } {
  const raw = h.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  return { segments: path.split('/').filter(Boolean), query };
}

/** Routes that existed before the workspace shell. Each maps to its new home; everything else is left alone. */
const LEGACY: Record<string, string> = {
  '': '/tasks/today',
  '/triage': '/tasks/triage',
  '/milestones': '/tasks/milestones',
  '/meetings': '/tasks/meetings',
  '/tasks': '/tasks/today',
  '/crm': '/crm/people',
  '/engineering': '/engineering/review',
};

/** Returns the new hash for an old route, or null when the route is already current. Query strings are kept. */
export function legacyRedirect(hash: string): string | null {
  const { segments, query } = parseHash(hash);
  const key = segments.length ? '/' + segments.join('/') : '';
  const target = LEGACY[key];
  return target === undefined ? null : '#' + target + (query ? `?${query}` : '');
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => {
      const to = legacyRedirect(location.hash);
      if (to) { history.replaceState(null, '', to); setHash(to); return; }
      setHash(location.hash);
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}
export const navigate = (path: string) => { location.hash = '#' + path; };
