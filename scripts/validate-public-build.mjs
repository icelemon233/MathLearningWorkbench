import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { containsCredential } from './validate-config.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticExtensions = new Set(['.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.woff', '.woff2', '.ttf', '.eot']);
const forbiddenDirectories = new Set(['src', 'scripts', 'supabase', 'node_modules', 'tests', 'docs']);

// A fail-closed boundary for copying dist into a public repository. This does
// not make browser JavaScript secret; it prevents publishing project sources.
export async function validatePublicBuild(directory) {
  const errors = [];
  const root = await lstat(directory).catch(() => null);
  if (!root?.isDirectory() || root.isSymbolicLink()) return ['构建目录不存在或不是普通目录。'];
  let hasIndex = false;

  async function walk(current, prefix = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const name = prefix + entry.name;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`禁止公开符号链接：${name}`);
        continue;
      }
      if (entry.name.startsWith('.') || forbiddenDirectories.has(entry.name.toLowerCase())) {
        errors.push(`禁止公开项目文件或目录：${name}`);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(path, name + '/');
        continue;
      }
      const extension = extname(name).toLowerCase();
      const bundled = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(name);
      if (!entry.isFile() || !(name === 'index.html' || bundled || staticExtensions.has(extension))) {
        errors.push(`文件不在公开构建白名单内：${name}`);
        continue;
      }
      if (name === 'index.html') hasIndex = true;
      if (['.html', '.js', '.css', '.svg'].includes(extension)) {
        const content = await readFile(path, 'utf8');
        if (/sourceMappingURL\s*=/.test(content)) errors.push(`禁止公开源映射引用或内嵌源映射：${name}`);
        if (containsCredential(content)) errors.push(`疑似包含后端凭证：${name}`);
      }
    }
  }

  await walk(directory);
  if (!hasIndex) errors.push('构建产物缺少 index.html。');
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Unexpected arguments');
    const errors = await validatePublicBuild(join(projectRoot, 'dist'));
    if (errors.length) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log('公开构建检查通过：仅包含网页产物，无项目源码或源映射。');
    }
  } catch {
    console.error('无法检查公开构建；已阻止发布。');
    process.exitCode = 1;
  }
}
