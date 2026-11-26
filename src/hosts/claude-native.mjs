import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { INSTALLED_DIR, marketplaceName } from "../paths.mjs";

/**
 * Native mode for Claude Code: `.ai/installed/` is a local marketplace registered at
 * local scope, and each plugin is installed from it. Claude then reads
 * `.ai/installed/plugins/<id>/` in place, with hooks, commands, MCP, and
 * `${CLAUDE_PLUGIN_ROOT}` handled by Claude itself.
 *
 * Writing `.claude/settings.local.json` by hand is not enough: the install is
 * also recorded in the user's plugin registry, so agent-deck drives the `claude` CLI.
 */

/** Before 0.1.2 every project registered its marketplace under this one name. */
const LEGACY_MARKETPLACE = "agent-deck";

let found;

/** The `claude` executable, or null. `AGENT_DECK_CLAUDE_BIN` overrides PATH. Looked up once per run. */
export function claudeBin() {
  const explicit = process.env.AGENT_DECK_CLAUDE_BIN;
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  if (found === undefined) {
    const r = spawnSync("claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    found = r.status === 0 ? "claude" : null;
  }
  return found;
}

/** Claude has this plugin enabled from the project's marketplace at local scope. */
export function isEnabled(projectRoot, name) {
  return localSettings(projectRoot).enabledPlugins?.[`${name}@${marketplaceName(projectRoot)}`] === true;
}

function claude(bin, projectRoot, args) {
  const r = spawnSync(bin, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) throw new Error(`claude ${args.join(" ")}: ${r.error.message}`);
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function must(result, what) {
  if (!result.ok) throw new Error(`${what} failed: ${result.out}`);
  return result;
}

function localSettings(projectRoot) {
  const file = path.join(projectRoot, ".claude", "settings.local.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Register `.ai/installed/` as the project's marketplace at local scope. A directory
 * marketplace is read in place: a plugin added to its catalog installs without
 * `marketplace update`.
 */
export function ensureMarketplace(bin, projectRoot) {
  const installedDir = path.join(projectRoot, INSTALLED_DIR);
  const marketplace = marketplaceName(projectRoot);
  dropLegacyMarketplace(bin, projectRoot, installedDir);
  const known = localSettings(projectRoot).extraKnownMarketplaces?.[marketplace]?.source;
  if (known?.source === "directory" && path.resolve(known.path) === path.resolve(installedDir)) return;
  if (known) claude(bin, projectRoot, ["plugin", "marketplace", "remove", marketplace]);
  must(
    claude(bin, projectRoot, ["plugin", "marketplace", "add", installedDir, "--scope", "local"]),
    "claude plugin marketplace add",
  );
}

/** Unregister the pre-0.1.2 shared `agent-deck` marketplace when it points at this project. */
function dropLegacyMarketplace(bin, projectRoot, installedDir) {
  const settings = localSettings(projectRoot);
  const known = settings.extraKnownMarketplaces?.[LEGACY_MARKETPLACE]?.source;
  if (known?.source !== "directory" || path.resolve(known.path) !== path.resolve(installedDir)) return;
  for (const id of Object.keys(settings.enabledPlugins ?? {})) {
    if (id.endsWith(`@${LEGACY_MARKETPLACE}`)) claude(bin, projectRoot, ["plugin", "uninstall", id, "--scope", "local"]);
  }
  claude(bin, projectRoot, ["plugin", "marketplace", "remove", LEGACY_MARKETPLACE]);
}

/**
 * @param {string} bin
 * @param {string} projectRoot
 * @param {string} name plugin manifest name (see materialize.pluginName)
 */
export function nativeInstall(bin, projectRoot, name) {
  // Already installed: Claude reads .ai/installed/plugins/<id> in place, so new content needs no call.
  if (isEnabled(projectRoot, name)) return;
  ensureMarketplace(bin, projectRoot);
  const id = `${name}@${marketplaceName(projectRoot)}`;
  must(claude(bin, projectRoot, ["plugin", "install", id, "--scope", "local"]), `claude plugin install ${id}`);
}

export function nativeUninstall(bin, projectRoot, name) {
  const id = `${name}@${marketplaceName(projectRoot)}`;
  if (localSettings(projectRoot).enabledPlugins?.[id] === undefined) return;
  claude(bin, projectRoot, ["plugin", "uninstall", id, "--scope", "local"]);
}

/** Unregister the project's marketplace once no plugin is installed from it. Reads settings before calling Claude. */
export function releaseMarketplace(projectRoot) {
  const settings = localSettings(projectRoot);
  const marketplace = marketplaceName(projectRoot);
  if (!settings.extraKnownMarketplaces?.[marketplace]) return false;
  const stillEnabled = Object.keys(settings.enabledPlugins ?? {}).some((id) => id.endsWith(`@${marketplace}`));
  if (stillEnabled) return false;
  const bin = claudeBin();
  if (!bin) return false;
  claude(bin, projectRoot, ["plugin", "marketplace", "remove", marketplace]);
  return true;
}

/** Plugin ids Claude reports as installed from the project's marketplace. */
export function nativeInstalled(bin, projectRoot) {
  const r = claude(bin, projectRoot, ["plugin", "list", "--json"]);
  if (!r.ok) return null;
  const suffix = marketplaceName(projectRoot).replace(/\./g, "\\.");
  return [...new Set([...r.out.matchAll(new RegExp(`"([\\w.-]+)@${suffix}"`, "g"))].map((m) => m[1]))].sort();
}
