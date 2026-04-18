import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['packages/**/node_modules/**', '**/*.tsbuildinfo'],
  },
];

export default config;
