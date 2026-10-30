import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import config from './vite.config'
export default mergeConfig(config,defineConfig({test:{include:['test/**/*.test.ts','test/**/*.test.tsx']}}))
