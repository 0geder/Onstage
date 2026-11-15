import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutRelease, nextVersion, storeNotes, unreleasedNotes } from './changelog.mjs';

const LOG = `# Changelog

Intro.

## [Unreleased]

### Fixed

- **Posters:** a dead link shows the gig's name.

## [0.1.0] - 2026-10-01

### Added

- Everything.
`;

test('bumps each part and resets the lower ones', () => {
  assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
  assert.equal(nextVersion('0.1.0', '1.0.0'), '1.0.0');
});

test('refuses a version that is not higher', () => {
  assert.throws(() => nextVersion('1.4.2', '1.4.2'), /not higher/);
  assert.throws(() => nextVersion('1.4.2', '1.3.9'), /not higher/);
  assert.throws(() => nextVersion('1.4.2', 'banana'), /Not a version/);
});

test('reads only the Unreleased section', () => {
  assert.equal(unreleasedNotes(LOG), "### Fixed\n\n- **Posters:** a dead link shows the gig's name.");
});

test('files the notes under the version and leaves an empty Unreleased on top', () => {
  const cut = cutRelease(LOG, '0.2.0', '2026-11-15');
  assert.equal(unreleasedNotes(cut), '');
  assert.match(cut, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-15\n\n### Fixed/);
  assert.match(cut, /## \[0\.1\.0\] - 2026-10-01/);
});

test('refuses to release with nothing pending or a version already used', () => {
  const empty = cutRelease(LOG, '0.2.0', '2026-11-15');
  assert.throws(() => cutRelease(empty, '0.3.0', '2026-11-16'), /Nothing under Unreleased/);
  assert.throws(() => cutRelease(LOG, '0.1.0', '2026-11-15'), /already has/);
});

test('store notes drop headings and markdown', () => {
  assert.equal(storeNotes(unreleasedNotes(LOG)), "- Posters: a dead link shows the gig's name.");
});
