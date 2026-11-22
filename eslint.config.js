import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'dist-e2e', 'public', 'node_modules', 'playwright-report', 'test-results'] },
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
);
