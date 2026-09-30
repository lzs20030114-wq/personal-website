import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

function readJson(path, validate) {
  let json;
  try {
    json = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    validate(JSON.parse(json));
    return json;
  } catch {
    return null;
  }
}

function writeJson(path, json) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, json);
  renameSync(temporary, path);
}

/**
 * 文件名由生成器的引擎版本 + 物理输入签名决定。两处都用既有终态校验器检查；
 * 构建缓存只保存原始 JSON，恢复时不舍入坐标，也不运行求解器。
 * @param {{ outputPath: string, cachePath: string, check?: boolean,
 *   validate: (value: unknown) => unknown, generate: () => string }} options
 */
export function materializeSkinTerminal({ outputPath, cachePath, check = false, validate, generate }) {
  const local = readJson(outputPath, validate);
  // --check 只检查交付文件：即使缓存能修复它，也必须报告缺失或损坏。
  if (check) {
    if (local === null) throw new Error(`Missing or invalid precomputed skin state: ${outputPath}`);
    return { json: local, source: 'local' };
  }
  const cached = readJson(cachePath, validate);
  const source = local !== null ? 'local' : cached !== null ? 'cache' : 'generated';
  const json = local ?? cached ?? generate();
  if (source === 'generated') validate(JSON.parse(json));
  if (local !== json) writeJson(outputPath, json);
  // 首次升级时把已有本地结果也写入构建缓存，无需重算。
  if (cached !== json) writeJson(cachePath, json);
  return { json, source };
}
