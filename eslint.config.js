import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['src/engineering/schemas/validators.generated.js', 'dist', 'dist-e2e', 'public', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { console: 'readonly', process: 'readonly' } } },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Public-repository and data rules: the app only ever creates drafts and never sends mail.
      'no-restricted-syntax': [
        'error',
        { selector: "Literal[value=/sendMail/]", message: 'The app must never send mail. Create drafts only.' },
      ],
    },
  },
  {
    // CRM model and UI (context section 3): records live in memory for the session only. No browser storage, no console output.
    files: ['src/crm/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'CRM records are never written to browser storage.' },
        { name: 'sessionStorage', message: 'CRM records are never written to browser storage.' },
        { name: 'indexedDB', message: 'CRM records are never written to browser storage.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'localStorage', message: 'CRM records are never written to browser storage.' },
        { object: 'window', property: 'sessionStorage', message: 'CRM records are never written to browser storage.' },
        { object: 'window', property: 'indexedDB', message: 'CRM records are never written to browser storage.' },
      ],
    },
  },
  {
    // Engineering workspace (context section 8): no network of any kind, and file text is never treated as HTML.
    // This block repeats the sendMail selector because a later rule entry replaces the earlier one.
    files: ['src/engineering/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'The Engineering workspace makes no network requests.' },
        { name: 'XMLHttpRequest', message: 'The Engineering workspace makes no network requests.' },
        { name: 'WebSocket', message: 'The Engineering workspace makes no network requests.' },
        { name: 'EventSource', message: 'The Engineering workspace makes no network requests.' },
        { name: 'Worker', message: 'No workers in the Engineering workspace.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'navigator', property: 'sendBeacon', message: 'The Engineering workspace makes no network requests.' },
        { object: 'window', property: 'fetch', message: 'The Engineering workspace makes no network requests.' },
        { object: 'globalThis', property: 'fetch', message: 'The Engineering workspace makes no network requests.' },
        { object: 'self', property: 'fetch', message: 'The Engineering workspace makes no network requests.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "Literal[value=/sendMail/]", message: 'The app must never send mail. Create drafts only.' },
        { selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]", message: 'File text must be rendered as text, never as HTML.' },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'File text must be rendered as text, never as HTML.' },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'File text must be rendered as text, never as HTML.' },
        { selector: "NewExpression[callee.name='Function']", message: 'No dynamic code: the Content Security Policy forbids it.' },
        { selector: "CallExpression[callee.name='eval']", message: 'No dynamic code: the Content Security Policy forbids it.' },
        { selector: "ImportExpression[source.value=/^https?:/]", message: 'No remote imports.' },
      ],
    },
  },
);
