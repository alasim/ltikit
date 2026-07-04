import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*', 'examples/**', 'docs/**'] },
  ...tseslint.configs.recommended,
  {
    // Keep @ltikit/core runtime-, framework-, and storage-agnostic: jose only.
    files: ['packages/core/**/*.ts'],
    ignores: ['packages/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'express',
                'hono',
                '@supabase/*',
                'mongodb',
                'mongoose',
                'ioredis',
                'redis',
                'pg',
                '@ltikit/adapter-*',
              ],
              message:
                'core must stay runtime/framework/DB-agnostic — depend only on jose.',
            },
          ],
        },
      ],
    },
  },
)
