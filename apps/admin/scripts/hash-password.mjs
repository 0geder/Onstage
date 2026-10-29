#!/usr/bin/env node
/**
 * Prints an ADMIN_USERS entry for one CMS operator.
 *
 *   npm run hash-password -w @onstage/admin -- curator@onstage.co.za [user-uuid]
 *
 * Reads the password from stdin (typed, hidden on a TTY, or piped), so it never
 * lands in shell history.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const [email, userId] = process.argv.slice(2);
if (!email) {
  console.error('Usage: hash-password <email> [api-user-uuid]');
  process.exit(1);
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return input.replace(/\r?\n$/, '');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write('Password: ');
  // Mute the echo while the password is typed.
  rl._writeToOutput = () => {};
  const answer = await new Promise((resolve) => rl.question('', resolve));
  rl.close();
  process.stdout.write('\n');
  return answer;
}

const password = await readPassword();
if (password.length < 12) {
  console.error('Use at least 12 characters.');
  process.exit(1);
}

const N = 32768, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p, maxmem: 128 * N * r * 2 });
const entry = {
  email,
  passwordHash: `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`,
  ...(userId ? { userId } : {}),
};
console.log(JSON.stringify(entry));
