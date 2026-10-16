import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 30000, hookTimeout: 60000, fileParallelism: false, pool: 'threads', maxWorkers: 1, reporters: ['default'] } });
