import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { parse as parseYaml } from 'yaml';

function yamlImportPlugin() {
  return {
    name: 'wuxia-vitest-yaml-import',
    enforce: 'pre' as const,
    load(id: string) {
      const [filepath] = id.split('?');
      if (!/\.ya?ml$/i.test(filepath)) {
        return null;
      }

      const source = readFileSync(filepath, 'utf8');
      const parsed = parseYaml(source);
      return `export default ${JSON.stringify(parsed)};`;
    },
  };
}

export default defineConfig({
  plugins: [yamlImportPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/武侠/test/setup.ts'],
        include: ['./src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
