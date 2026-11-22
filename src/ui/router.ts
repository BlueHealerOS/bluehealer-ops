import { useEffect, useState } from 'react';

export function parseHash(h: string): { segments: string[]; query: string } {
  const raw = h.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  return { segments: path.split('/').filter(Boolean), query };
}
export function useHashRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}
export const navigate = (path: string) => { location.hash = '#' + path; };
