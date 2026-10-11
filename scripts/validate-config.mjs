import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicNames = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);

export function validateFrontendConfig(env) {
  const errors = [];
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !publicNames.has(name)) {
      errors.push(`不允许将 ${name} 暴露给浏览器；前端只接受项目地址与公开密钥。`);
    }
  }
  for (const name of publicNames) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      errors.push(`缺少 ${name}。`);
    }
  }

  if (env.VITE_SUPABASE_URL?.trim()) {
    try {
      const url = new URL(env.VITE_SUPABASE_URL);
      if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
        || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
        errors.push('项目地址必须是托管项目的 HTTPS 根地址，不能包含凭证、路径或参数。');
      }
    } catch {
      errors.push('项目地址格式无效。');
    }
  }

  if (env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    && !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    errors.push('前端仅接受 sb_publishable_ 开头的公开密钥；禁止 secret、service_role、旧版 JWT 或模型密钥。');
  }
  return errors;
}

export function containsCredential(text) {
  if (/\b(?:sb_secret_|sk-|ark-)[A-Za-z0-9_-]{20,}\b/.test(text)) return true;
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try {
      if (JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')).role === 'service_role') {
        return true;
      }
    } catch {
      // Non-JWT text does not contain a decodable service credential.
    }
  }
  return false;
}

async function scanBuild(directory) {
  const errors = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      errors.push(`构建产物不允许符号链接：${relative(projectRoot, path)}。`);
    } else if (entry.isDirectory()) {
      errors.push(...await scanBuild(path));
    } else if (/\.(?:js|mjs|cjs|html|css|json|map|txt)$/i.test(entry.name)
      && containsCredential(await readFile(path, 'utf8'))) {
      errors.push(`构建产物疑似含有后端凭证：${relative(projectRoot, path)}。`);
    }
  }
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check-dist')) {
    throw new Error('仅支持可选参数 --check-dist。');
  }
  const { loadEnv } = await import('vite');
  const errors = validateFrontendConfig(loadEnv('production', projectRoot, 'VITE_'));
  if (!errors.length && args.includes('--check-dist')) {
    errors.push(...await scanBuild(join(projectRoot, 'dist')));
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(args.includes('--check-dist') ? '公开配置与构建产物检查通过。' : '公开配置检查通过。');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('无法完成配置检查；请确认已安装依赖并生成构建产物。');
    process.exitCode = 1;
  });
}
