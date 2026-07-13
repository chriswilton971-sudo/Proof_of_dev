/**
 * postinstall — runs automatically after `npm install`.
 *
 * Keeps first-run friction low without ever touching anything destructive:
 *   - Warns (never fails) if the running Node version is outside `engines.node`.
 *   - Copies `.env.example` → `.env.local` on first install only, so `npm run dev`
 *     works immediately in demo mode. Never overwrites an existing `.env.local`.
 *
 * This script must never exit non-zero — a broken postinstall would break
 * `npm install` itself, which is exactly what we're trying to prevent.
 */

import { existsSync, copyFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function checkNodeVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const wanted = pkg.engines?.node;
    if (!wanted) return;

    const [major] = process.versions.node.split(".").map(Number);
    // Cheap check on the lower bound only (">=20.9.0 <23.0.0" style strings) —
    // good enough for a friendly warning, not meant to be a strict semver gate.
    const minMajorMatch = wanted.match(/>=\s*(\d+)/);
    const minMajor = minMajorMatch ? Number(minMajorMatch[1]) : null;

    if (minMajor && major < minMajor) {
      console.warn(
        `[postinstall] You're on Node ${process.versions.node}, but this project expects ${wanted}.`
      );
      console.warn("[postinstall] Consider using nvm: `nvm use` (see .nvmrc).");
    }
  } catch {
    // Never let a version check break install.
  }
}

function bootstrapEnvFile() {
  const example = resolve(root, ".env.example");
  const target = resolve(root, ".env.local");

  if (!existsSync(example)) return;
  if (existsSync(target)) return; // never overwrite what's already there

  try {
    copyFileSync(example, target);
    console.info("[postinstall] Created .env.local from .env.example (demo mode — add API keys to go live).");
  } catch (err) {
    console.warn(`[postinstall] Could not create .env.local: ${err.message}`);
  }
}

checkNodeVersion();
bootstrapEnvFile();
