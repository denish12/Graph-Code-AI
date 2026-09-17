import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

test('the CLI and install lifecycle have no telemetry surface', () => {
  const help = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout, /\btelemetry\b|_telemetry-flush/);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts.postinstall, undefined);
  assert.doesNotMatch(pkg.scripts.prepare ?? '', /telemetry/);
  assert.equal(readdirSync(join(root, 'src')).includes('telemetry'), false);
});
