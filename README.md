# bluehealer-ops

Private operations app for the founders of BlueHealer Inc.

This repository contains code only. No records, contacts, documents or credentials live here. All data is stored in founders-only Microsoft 365 resources and is reached only after Microsoft sign-in with multi-factor authentication. Until a founder signs in, the app shows nothing but a sign-in screen.

## How it works
- Static single-page app (Vite, React, TypeScript, Tailwind) on GitHub Pages. No server of our own.
- Sign-in with Microsoft Entra ID (MSAL.js, authorization code flow with PKCE, single tenant, no client secret).
- Records are Microsoft Lists on a founders-only SharePoint site, read and written through Microsoft Graph with the signed-in founder's own token. SharePoint permissions are the real access control.
- The app creates Outlook drafts and never sends mail.
- Reminders and intake run on Power Automate and Claude routines. See `docs/flows/`.

## Documents
- [Specification](docs/SPEC.md) and [implementation plan](docs/PLAN.md)
- [Phase 0 setup for the tenant administrator](docs/SETUP.md)
- [Flow guides](docs/flows/README.md)
- Demo scripts: [Phase 1a](docs/demo/phase-1a.md), [Phase 1b](docs/demo/phase-1b.md)

## Status
Phase 1 is built: sign-in gate, list provisioning from a schema, tasks (Today, This week, Board, List, Calendar, Waiting, Proposed, Done, Hygiene), facet filters, quick add, notifications with snooze, record history, milestones with timeline, relationships (people, organizations, investor follow-ups, overdue contacts), interaction logging, Outlook drafts, intake triage, meetings with agendas, one-time imports (hub and Trello) and Settings and Admin. Phases 2 and 3 (applications, answer bank, meeting-pack flows, OKRs, KPIs) are next. See `docs/PLAN.md`.

## Development
```bash
npm ci
npm run dev          # local, http://localhost:5173/bluehealer-ops/
npm run typecheck && npm run lint && npm test
npm run check:fixtures   # public-repository hygiene: no data, PII or secrets
npm run e2e          # Playwright against a mocked Graph (test auth adapter, e2e build mode only)
```

Before sign-in works, `config/tenant.json` must hold the real tenant and client identifiers (identifiers, not secrets). See `docs/SETUP.md`.

## Public repository rules
Code, docs and fictional fixtures only. Never commit records, exports, real contact names or addresses, meeting content, screenshots with data, or `.env` files. CI runs a secret and PII scan and fails on findings.
