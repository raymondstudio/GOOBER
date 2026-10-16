import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [
  {ignores: ['**/node_modules/**', '**/.next*/**', '**/generated/**', '.agents/**', '.local/**', 'output/**']},
  js.configs.recommended, ...ts.configs.recommended,
  {files: ['**/*.{ts,tsx,mjs}'], languageOptions: {globals: {process:'readonly', console:'readonly', Buffer:'readonly', setTimeout:'readonly', clearTimeout:'readonly', fetch:'readonly', URL:'readonly', Headers:'readonly', Request:'readonly', Response:'readonly', AbortSignal:'readonly'}}, rules: {'@typescript-eslint/no-explicit-any':'off', '@typescript-eslint/no-unused-vars':['error', {argsIgnorePattern:'^_', varsIgnorePattern:'^_'}], 'no-undef':'off'}}
];
