import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const baseConfig = tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'dynamicParams',
            'generateMetadata',
            'generateStaticParams',
            'metadata',
            'revalidate',
          ],
        },
      ],
      'react/no-unescaped-entities': 'off',
      'import/no-anonymous-default-export': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);

const mtmRestrictedImports = {
  files: ['**/*.{ts,tsx}'],
  ignores: [
    'src/lib/config-daily-series.ts',
    'src/app/api/cron/**',
    'src/app/api/internal/compute-portfolio-config/**',
    'src/app/api/internal/compute-portfolio-configs-batch/**',
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/lib/live-mark-to-market',
            importNames: [
              'buildDailyMarkedToMarketSeriesForConfig',
              'buildLatestMtmPointFromLastSnapshot',
              'buildDailyMarkedToMarketSeriesForStrategy',
              'buildLatestLiveSeriesPointForConfig',
              'buildLatestLiveSeriesPointForStrategy',
            ],
            message:
              'Use @/lib/config-daily-series helpers instead. Daily MTM series is precomputed by cron and read from snapshots.',
          },
        ],
      },
    ],
  },
};

export default [...compat.extends('next/core-web-vitals'), ...baseConfig, mtmRestrictedImports];
