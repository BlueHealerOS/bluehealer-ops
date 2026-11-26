import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  week: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  waiting: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  suggested: <path d="M12 3l2.1 5.4L20 9.5l-4.4 3.8 1.4 5.7L12 15.7 7 19l1.4-5.7L4 9.5l5.9-1.1z" />,
  done: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  attention: <><path d="M12 4 3 19h18z" /><path d="M12 10v4M12 16.5v.5" /></>,
  milestones: <><path d="M6 21V4" /><path d="M6 5h11l-2 3.5 2 3.5H6" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.6a3 3 0 0 1 0 5.8M18 14.4c1.6.6 2.7 2.1 3 4.6" /></>,
  triage: <><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></>,
  meetings: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h16" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  add: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  board: <><rect x="3.5" y="4" width="5" height="16" rx="1.2" /><rect x="10" y="4" width="5" height="10" rx="1.2" /><rect x="16.5" y="4" width="4" height="13" rx="1.2" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" /></>,
  view: <path d="M6 4h12v17l-6-4-6 4z" />,
  building: <><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M10 20.5v-4h4v4" /></>,
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </svg>
  );
}
