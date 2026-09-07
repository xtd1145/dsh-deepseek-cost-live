// DeepSeek API key resolution (Host only — the key never leaves the host).
//
// Resolution chain:
//   1. config.apiKey (explicit override, written by an admin into the plugin
//      config file — never surfaced to the browser)
//   2. process.env[envName]  (default DEEPSEEK_API_KEY)
//   3. the DSH home credentials file (\~/.dsh/.credentials.yaml) `refs` map
//   4. the official ctx.credentials service (dynamic import, guarded)

import { readFile } from 'node:fs/promises';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';

const CREDENTIALS_FILE = '.credentials.yaml'; // dshHomePath('.credentials.yaml') -> ~/.dsh/.credentials.yaml

/** Line-oriented parse of the credentials YAML `refs` block (no YAML dep). */
export function parseCredentialsRefs(yamlText) {
  const refs = {};
  if (typeof yamlText !== 'string') return refs;
  const lines = yamlText.split(/\r?\n/);
  let inRefs = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (!inRefs) {
      if (/^refs:\s*$/.test(trimmed)) inRefs = true;
      continue;
    }
    if (indent === 0 && trimmed.length > 0) break; // left the refs block
    const m = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (m) {
      const value = m[2].trim();
      refs[m[1]] = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value;
    }
  }
  return refs;
}

/** Read the credentials file refs from disk. */
export async function readCredentialsRefs() {
  try {
    const text = await readFile(dshHomePath(CREDENTIALS_FILE), 'utf8');
    return parseCredentialsRefs(text);
  } catch {
    return {};
  }
}

/**
 * Resolve the DeepSeek API key.
 * @param opts.refName env-var/credential name (default DEEPSEEK_API_KEY)
 * @param opts.config plugin config (may carry an explicit apiKey)
 * @param opts.ctx optional host context (for the official credentials seam)
 */
export async function resolveDeepseekApiKey({ refName, config, ctx }) {
  const name = typeof refName === 'string' && refName.trim() !== '' ? refName.trim() : 'DEEPSEEK_API_KEY';
  if (config && typeof config.apiKey === 'string' && config.apiKey.trim() !== '') return config.apiKey.trim();
  if (typeof process !== 'undefined' && process.env && typeof process.env[name] === 'string' && process.env[name].trim() !== '') {
    return process.env[name].trim();
  }
  const refs = await readCredentialsRefs();
  const fromFile = refs[name];
  if (typeof fromFile === 'string' && fromFile.trim() !== '' && fromFile !== '(redacted)') return fromFile.trim();
  if (ctx) {
    try {
      const { credentialRef } = await import('@deepseek-ai/dsh-credentials');
      const credentials = ctx.get('credentials');
      if (credentials && typeof credentials.resolve === 'function') {
        const resolved = await credentials.resolve(credentialRef(name));
        if (resolved && typeof resolved.value === 'string' && resolved.value.trim() !== '') return resolved.value.trim();
      }
    } catch {
      // seam unavailable — no key, caller reports unconfigured
    }
  }
  return undefined;
}