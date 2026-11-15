#!/usr/bin/env node
/**
 * Cuts a release: `npm run release -- patch|minor|major|x.y.z [--dry-run]`
 *
 * 1. Moves CHANGELOG.md's Unreleased notes under the new version and date.
 * 2. Sets that version in apps/mobile/package.json (what the app reports), the
 *    root package.json and package-lock.json, so they never disagree.
 * 3. Commits "Release x.y.z" and tags it vx.y.z, with the notes on the tag.
 * 4. Prints the notes as plain text for the stores' "What's new".
 *
 * It does not push or build. Afterwards: git push --follow-tags, then
 * `npm run build -w @onstage/mobile` (EAS gives the build its number).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutRelease, nextVersion, storeNotes, unreleasedNotes } from './changelog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (file) => join(root, file);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((arg) => !arg.startsWith('--'));
if (!bump) {
  console.error('Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');
  process.exit(1);
}

try {
  if (!dryRun && git('status', '--porcelain')) {
    throw new Error('Commit or stash your changes first: a release commit holds only the release.');
  }

  const mobilePkgPath = path('apps/mobile/package.json');
  const current = JSON.parse(readFileSync(mobilePkgPath, 'utf8')).version;
  const version = nextVersion(current, bump);
  const date = new Date().toISOString().slice(0, 10);

  const changelog = readFileSync(path('CHANGELOG.md'), 'utf8');
  const notes = unreleasedNotes(changelog);
  const released = cutRelease(changelog, version, date);
  const forStores = storeNotes(notes);

  console.log(`Onstage ${current} -> ${version} (${date})\n`);
  console.log(`What's new (${forStores.length} characters):\n${forStores}\n`);
  if (forStores.length > 500) {
    console.log('Note: Google Play allows 500 characters. Shorten it in the Play Console.\n');
  }
  if (dryRun) {
    console.log('Dry run: nothing written.');
    process.exit(0);
  }

  writeFileSync(path('CHANGELOG.md'), released);

  for (const file of ['package.json', 'apps/mobile/package.json']) {
    const pkg = JSON.parse(readFileSync(path(file), 'utf8'));
    pkg.version = version;
    writeFileSync(path(file), `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const lock = JSON.parse(readFileSync(path('package-lock.json'), 'utf8'));
  lock.version = version;
  for (const key of ['', 'apps/mobile']) {
    if (lock.packages?.[key]) lock.packages[key].version = version;
  }
  writeFileSync(path('package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);

  git('add', 'CHANGELOG.md', 'package.json', 'apps/mobile/package.json', 'package-lock.json');
  git('commit', '-m', `Release ${version}`, '-m', notes);
  git('tag', '-a', `v${version}`, '-m', `Onstage ${version}\n\n${notes}`);

  console.log(`Committed and tagged v${version}. Next: git push --follow-tags`);
} catch (error) {
  console.error(`Release stopped: ${error.message}`);
  process.exit(1);
}
