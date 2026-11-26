/** Shared paths for @toolmesh/agent-deck. */

import { createHash } from "node:crypto";
import path from "node:path";

export const PLUGINS_FILE = "ai-plugin.json";
export const LOCAL_PLUGINS_FILE = "ai-plugin.local.json";
export const LOCK_FILE = "ai-plugin.lock.json";

/**
 * Name of the local marketplace Claude registers for a project's `.ai/installed/`.
 * Claude keeps one directory per marketplace name for the whole user account, so the
 * name carries the project folder and a hash of its path: two projects never share one.
 */
export function marketplaceName(projectRoot) {
  const root = path.resolve(projectRoot);
  const slug = path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  return `agent-deck-${slug}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
}

/** Everything AI-tooling in a project lives under .ai/. */
export const AI_DIR = ".ai";
/** Like node_modules: one normalized plugin per id, and what agent-deck wrote here. Never committed. */
export const INSTALLED_DIR = `${AI_DIR}/installed`;
export const STATE_FILE = `${INSTALLED_DIR}/state.json`;
/** .ai/current → profiles/<name>: the active profile. */
export const CURRENT_LINK_PATH = `${AI_DIR}/current`;
/** The active profile's prompt, as a Cursor rule. */
export const CURSOR_RULE_PATH = ".cursor/rules/agent-deck-profile.mdc";

/** Where copy mode writes plugin components for each host. */
export const HOSTS = {
  claude: {
    skills: ".claude/skills",
    agents: ".claude/agents",
    commands: ".claude/commands",
    rules: null,
    mcp: ".mcp.json",
    plugins: ".claude/plugins",
    rootVar: "CLAUDE_PLUGIN_ROOT",
  },
  cursor: {
    skills: ".cursor/skills",
    agents: ".cursor/agents",
    commands: ".cursor/commands",
    rules: ".cursor/rules",
    mcp: ".cursor/mcp.json",
    plugins: ".cursor/plugins",
    rootVar: "CURSOR_PLUGIN_ROOT",
  },
};

export function pluginsPath(projectRoot) {
  return `${projectRoot}/${PLUGINS_FILE}`;
}

export function localPluginsPath(projectRoot) {
  return `${projectRoot}/${LOCAL_PLUGINS_FILE}`;
}

export function lockPath(projectRoot) {
  return `${projectRoot}/${LOCK_FILE}`;
}

export function pluginRel(id) {
  return `${INSTALLED_DIR}/plugins/${id}`;
}

/** Filesystem-safe fragment of a marketplace id or entry id. */
export function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._@+-]+/g, "__");
}

/** Per-plugin support files (conventions, scripts, templates) for one host. */
export function pluginAssetRel(host, id) {
  return `${host.plugins}/${safeSegment(id)}`;
}
