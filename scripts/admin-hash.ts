import { hash, Algorithm } from '@node-rs/argon2';
if (!process.stdin.isTTY || !process.stdin.setRawMode)
  throw new Error('Run this command in an interactive terminal.');
async function hiddenPassword(): Promise<string> {
  process.stdout.write('Administrator password (at least 12 characters, hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      const read = (chunk: Buffer) => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003') {
            process.stdin.off('data', read);
            reject(new Error('Cancelled.'));
            return;
          }
          if (character === '\r' || character === '\n') {
            process.stdin.off('data', read);
            resolve(value);
            return;
          }
          if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
          else if (character >= ' ') value += character;
        }
      };
      process.stdin.on('data', read);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
  }
}
const password = await hiddenPassword();
if (password.length < 12 || password.length > 1024) throw new Error('Use 12–1024 characters.');
console.log(
  await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  }),
);
