import { z } from 'zod';

// zod probes for eval support with new Function, which the Content Security Policy forbids.
// This module is imported first in main.tsx so the probe is switched off before any schema is built.
z.config({ jitless: true });
