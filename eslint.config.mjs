import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'out',
    'build',
    'node_modules',
    'tmp',
    'best_CastingForge.tsx',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // Launch baseline: keep visibility on legacy debt without blocking release builds.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-async-promise-executor': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-control-regex': 'warn',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
