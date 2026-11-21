import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { businessTables, expandSeed } from '../seed.mjs';

const database = 'aircon_reset_test_' + process.pid + '_' + Date.now();
const migrations = new URL('../../../supabase/migrations/', import.meta.url);
const here = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const fixture = expandSeed(JSON.parse(here('../test-fixtures/sample-seed.json')), '2026-11-20');
const golden = expandSeed(JSON.parse(here('../data.json')), '2026-11-20');
const empty = { version: 1, ...Object.fromEntries(Object.keys(businessTables).map(key => [key, []])), userProfileLinks: {} };
const cases = here('reset-cases.sql')
  .replace('__FIXTURE__', () => JSON.stringify(fixture))
  .replace('__EMPTY__', () => JSON.stringify(empty))
  .replace('__GOLDEN__', () => JSON.stringify(golden));
const files = [
  ['stub.sql', here('stub.sql')],
  ...readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()
    .map(name => [name, readFileSync(new URL(name, migrations), 'utf8')]),
  ['reset-cases.sql', cases],
];

// Keep connection configuration local even on a machine with other PG* variables.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
function run(command, args, input = '') {
  const scratch = mkdtempSync(join(tmpdir(), 'aircon-reset-command-'));
  const inputPath = join(scratch, 'input');
  const outputPath = join(scratch, 'output');
  try {
    writeFileSync(inputPath, input);
    const stdin = openSync(inputPath, 'r');
    const output = openSync(outputPath, 'w');
    let result;
    try {
      result = spawnSync(command, args, { env, stdio: [stdin, output, output] });
    } finally {
      closeSync(stdin);
      closeSync(output);
    }
    if (result.error) throw result.error;
    const log = readFileSync(outputPath, 'utf8');
    if (result.status !== 0) throw new Error(log || command + ' failed');
    return log;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function testSocket() {
  const connect = ['-h', '/var/run/postgresql', '-p', '5432', '-w'];
  run('createdb', [...connect, database]);
  try {
    for (const [name, sql] of files) {
      console.log('Applying ' + name);
      const output = run('psql', [...connect, '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], sql);
      if (name === 'reset-cases.sql') console.log(output);
    }
  } finally {
    run('dropdb', [...connect, database]);
  }
}

function testSingleUser(bin) {
  const cluster = mkdtempSync(join(tmpdir(), 'aircon-reset-pg-'));
  try {
    run(join(bin, 'initdb'), ['-D', cluster, '--no-sync', '--auth=trust']);
    const postgres = (db, sql) => {
      // -j uses semicolon plus two newlines as the command terminator.
      // Send each file as a query, retaining all SQL line boundaries.
      const output = run(join(bin, 'postgres'), ['--single', '-j', '-D', cluster, db],
        sql.trimEnd().replace(/\n[ \t]*\n/g, '\n') + '\n\n');
      if (/\b(?:ERROR|FATAL|PANIC):/.test(output)) throw new Error(output);
    };
    postgres('postgres', 'create database ' + database + ';');
    try {
      // Temporary helper functions and the first snapshot share one session.
      for (const [name, sql] of files) {
        console.log('Applying ' + name);
        postgres(database, sql);
      }
    } finally {
      postgres('postgres', 'drop database ' + database + ';');
    }
  } finally {
    rmSync(cluster, { recursive: true, force: true });
  }
}

try {
  if (process.argv[2] === '--single-user' && process.argv[3]) testSingleUser(process.argv[3]);
  else if (process.argv.length === 2) testSocket();
  else throw new Error('Usage: node ' + fileURLToPath(import.meta.url) + ' [--single-user <postgres-bin-dir>]');
  console.log('PostgreSQL reset tests passed');
} catch (error) {
  console.error(error.stderr || error.message);
  process.exitCode = 1;
}
