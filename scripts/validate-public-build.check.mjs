import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validatePublicBuild } from './validate-public-build.mjs';

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-public-build-'));
  try {
    const dist = join(directory, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<script type="module" src="./assets/index-Ab12cd34.js"></script>');
    await writeFile(join(dist, 'assets/index-Ab12cd34.js'), 'console.log("compiled");');
    await run(dist, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts a deployable build with hashed bundles and static assets', () => fixture(async dist => {
  await writeFile(join(dist, 'assets/index-Xy12za34.css'), ':root{color:#222}');
  await writeFile(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.deepEqual(await validatePublicBuild(dist), []);
}));

test('rejects accidental source, environment, database and source-map copies', () => fixture(async dist => {
  const files = ['App.tsx', '.env.local', 'schema.sql', 'package.json', 'assets/index-Ab12cd34.js.map'];
  for (const file of files) await writeFile(join(dist, file), 'private fixture');
  await mkdir(join(dist, 'src'));
  await writeFile(join(dist, 'src/app.js'), 'console.log("unbundled source");');
  const errors = await validatePublicBuild(dist);
  for (const name of [...files, 'src']) assert(errors.some(error => error.endsWith(name)), name);
}));

test('rejects inline source maps and credentials even in allowed web files', () => fixture(async dist => {
  await writeFile(join(dist, 'assets/index-Ab12cd34.js'), '//# sourceMappingURL=data:application/json;base64,e30=');
  await writeFile(join(dist, 'favicon.svg'), '<svg>' + 'sb_secret_' + 'x'.repeat(32) + '</svg>');
  const errors = await validatePublicBuild(dist);
  assert(errors.some(error => error.includes('源映射')));
  assert(errors.some(error => error.includes('凭证') && error.endsWith('favicon.svg')));
  assert(!errors.some(error => error.includes('x'.repeat(32))), 'error messages must not echo credentials');
}));

test('rejects linked directories and an incomplete build', () => fixture(async (dist, directory) => {
  const outside = join(directory, 'private');
  await mkdir(outside);
  await writeFile(join(outside, 'notes.md'), 'private fixture');
  await symlink(outside, join(dist, 'leak'), process.platform === 'win32' ? 'junction' : 'dir');
  assert((await validatePublicBuild(dist)).some(error => error.includes('符号链接')));
  await rm(join(dist, 'index.html'));
  assert((await validatePublicBuild(dist)).some(error => error.includes('缺少 index.html')));
  assert.deepEqual(await validatePublicBuild(join(directory, 'missing')), ['构建目录不存在或不是普通目录。']);
}));
