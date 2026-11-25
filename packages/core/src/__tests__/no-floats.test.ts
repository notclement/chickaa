import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guard rail (SPEC §18): money code must never use binary floating point. */
describe('financial core source', () => {
  const dir = join(import.meta.dirname, '..');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'currencies.ts');

  it.each(files)('%s uses no float arithmetic helpers', (file) => {
    const src = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/parseFloat|toFixed|toPrecision|Math\.(round|floor|ceil|trunc)\(|Number\(|\*\s*100\b/);
  });
});
