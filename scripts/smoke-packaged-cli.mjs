import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tatCliDir = path.join(rootDir, 'tat-cli');
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'tat-pack-smoke-'));
const packDir = path.join(tmpRoot, 'pack');
const installDir = path.join(tmpRoot, 'install');

function runNpm(args, options = {}) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('npm_execpath is not available; cannot run npm from the smoke script.');
  }

  return execFileSync(process.execPath, [npmCli, ...args], options);
}

mkdirSync(packDir, { recursive: true });
mkdirSync(installDir, { recursive: true });

try {
  const packedName = runNpm(
    ['pack', '--silent', '--pack-destination', packDir],
    { cwd: tatCliDir, encoding: 'utf-8' },
  ).trim();

  const tarballPath = path.join(packDir, packedName);
  if (!existsSync(tarballPath)) {
    throw new Error(`Packed tarball was not created: ${tarballPath}`);
  }

  runNpm(['init', '-y'], { cwd: installDir, stdio: 'ignore' });
  runNpm(['install', '--silent', tarballPath], { cwd: installDir, stdio: 'inherit' });

  const installedCli = path.join(
    installDir,
    'node_modules',
    '@nanotiny',
    'tiny-api-test',
    'dist',
    'cli.js',
  );

  if (!existsSync(installedCli)) {
    throw new Error(`Installed CLI entrypoint not found: ${installedCli}`);
  }

  const fixturePath = path.join(installDir, 'smoke.tat.json');
  writeFileSync(
    fixturePath,
    JSON.stringify({
      suites: [
        {
          name: 'Smoke',
          tests: [
            {
              name: 'Schema only',
              method: 'GET',
              url: 'https://example.test',
              assert: ['$status == 200'],
            },
          ],
        },
      ],
    }, null, 2),
    'utf-8',
  );

  const output = execFileSync(
    process.execPath,
    [installedCli, 'validate', fixturePath],
    { cwd: installDir, encoding: 'utf-8' },
  );

  if (!output.includes('valid')) {
    throw new Error(`Packaged CLI smoke check did not report success.\n${output}`);
  }

  console.log(`Packaged CLI smoke check passed: ${packedName}`);
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
