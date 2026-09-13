"use strict";

const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const projectRoot = join(__dirname, "..");
const sourceDir = join(projectRoot, "frontend", "runtime");
const outputDir = join(projectRoot, "dist", "runtime");

if (!existsSync(sourceDir)) {
  throw new Error(`Runtime asset source directory missing: ${sourceDir}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });

for (const name of ["app", "ux"]) {
  cpSync(join(projectRoot, "frontend", name), join(outputDir, name), {
    recursive: true,
  });
}

console.log(`Runtime assets copied: ${sourceDir} -> ${outputDir}`);
