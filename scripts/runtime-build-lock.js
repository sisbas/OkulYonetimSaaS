'use strict';

const { mkdirSync, openSync, closeSync, writeSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const projectRoot = join(__dirname, '..');
const lockPath = join(projectRoot, 'dist', 'runtime-build.lock');

/**
 * #445 flake fix: runtime asset build'i ile dist/runtime okumasını aynı
 * prosesler-arası mutuelle sokar. screen-modules ve boundary suitleri
 * eşzamanlı jest işçilerinde build+assert yapar; kilit olmadan bir işçinin
 * rmSync'i diğerinin byte-identical okumasını ENOENT/yanlış bayt ile bozar.
 * Windows'ta openSync 'wx' atomiktir; busy-wait üst sınır ~10 saniye.
 */
function withRuntimeBuildLock(fn) {
  mkdirSync(join(projectRoot, 'dist'), { recursive: true });
  // Rastgele belirteç: bırakma penceresinde başka bir proses kilit
  // oluşturursa yalnız KENDİ dosyamızı sileriz (bırakma yarışını kapatır).
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let lockFd = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      lockFd = openSync(lockPath, 'wx');
      writeSync(lockFd, token);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const waitUntil = Date.now() + 100;
      while (Date.now() < waitUntil) {
        // yalnızca 100 ms bekler; toplam ~10 s üst sınır
      }
    }
  }
  if (!lockFd) throw new Error('runtime-build.lock alınamadı (~10s) — kilit düşmeyen işçi var');
  try {
    return fn();
  } finally {
    closeSync(lockFd);
    try {
      if (readFileSync(lockPath, 'utf8') === token) rmSync(lockPath);
    } catch {
      // Kilit zaten bırakılmış veya dosya değişti — yalnız bizimkilere dokun
    }
  }
}

module.exports = { withRuntimeBuildLock };
