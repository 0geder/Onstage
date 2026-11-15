/**
 * Changelog and version arithmetic for `npm run release`, kept free of I/O
 * so it can be tested on its own (scripts/changelog.test.mjs).
 */

const UNRELEASED = '## [Unreleased]';

/** 1.4.2 + "minor" -> 1.5.0. An explicit x.y.z is taken as given if it is higher. */
export function nextVersion(current, bump) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) throw new Error(`Not a version: ${v}`);
    return m.slice(1).map(Number);
  };
  const [major, minor, patch] = parse(current);
  let next;
  if (bump === 'major') next = [major + 1, 0, 0];
  else if (bump === 'minor') next = [major, minor + 1, 0];
  else if (bump === 'patch') next = [major, minor, patch + 1];
  else next = parse(bump);

  const order = next[0] - major || next[1] - minor || next[2] - patch;
  if (order <= 0) throw new Error(`${next.join('.')} is not higher than ${current}`);
  return next.join('.');
}

/** The body of the Unreleased section, trimmed; empty when nothing is pending. */
export function unreleasedNotes(changelog) {
  const start = changelog.indexOf(UNRELEASED);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" heading`);
  const bodyStart = start + UNRELEASED.length;
  const next = changelog.indexOf('\n## [', bodyStart);
  return changelog.slice(bodyStart, next === -1 ? undefined : next).trim();
}

/**
 * Files the pending notes under the new version and leaves a fresh, empty
 * Unreleased section on top for the next round of changes.
 */
export function cutRelease(changelog, version, date) {
  if (!unreleasedNotes(changelog)) {
    throw new Error('Nothing under Unreleased in CHANGELOG.md: add what changed first.');
  }
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a ${version} section`);
  }
  return changelog.replace(UNRELEASED, `${UNRELEASED}\n\n## [${version}] - ${date}`);
}

/**
 * Plain text for the stores' "What's new" box (Google Play allows 500
 * characters): headings and markdown dropped, bullets kept.
 */
export function storeNotes(notes) {
  return notes
    .split('\n')
    .filter((line) => !line.startsWith('### '))
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
