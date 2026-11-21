import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitRepo, readJson, skill, tmp, writeTree } from "./testkit.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.mjs");
const env = { ...process.env, AGENT_DECK_CACHE: tmp("deck-cache-"), AGENT_DECK_CLAUDE_BIN: "/nonexistent/claude" };

function runCli(root, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args, "-C", root], { encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function market() {
  return gitRepo(tmp("deck-cli-market-"), {
    ".claude-plugin/marketplace.json": {
      name: "m",
      plugins: [
        { name: "base-kit", source: "./plugins/base-kit" },
        { name: "build-kit", source: "./plugins/build-kit" },
        { name: "test-kit", source: "./plugins/test-kit" },
      ],
    },
    "plugins/base-kit/skills/commit/SKILL.md": skill("commit"),
    "plugins/build-kit/skills/pdf/SKILL.md": skill("pdf"),
    "plugins/test-kit/skills/e2e/SKILL.md": skill("e2e"),
  });
}

const has = (root, rel) => fs.existsSync(path.join(root, rel));

test("profiles: add to the base and to profiles, switch, and turn off", () => {
  const repo = market();
  const root = writeTree(tmp("deck-cli-"), { ".gitignore": "node_modules\n" });
  const src = (name) => `git+${repo.url}@${name}`;

  assert.equal(runCli(root, "add", src("base-kit")).code, 0);
  assert.equal(runCli(root, "profile", "new", "builder").code, 0);
  assert.equal(runCli(root, "profile", "new", "tester").code, 0);
  const lockedOnly = runCli(root, "add", src("build-kit"), "--profile", "builder");
  assert.equal(lockedOnly.code, 0, lockedOnly.err);
  assert.match(lockedOnly.out, /not active/);
  assert.ok(!has(root, ".claude/skills/pdf"), "an inactive profile is locked, not installed");
  assert.ok(readJson(path.join(root, ".ai/profiles/builder/ai-plugin.lock.json")).plugins[0].resolved.sha);
  assert.equal(runCli(root, "add", src("test-kit"), "--profile", "tester").code, 0);

  const use = runCli(root, "profile", "use", "builder");
  assert.equal(use.code, 0, use.err);
  assert.ok(has(root, ".claude/skills/commit") && has(root, ".claude/skills/pdf"));
  assert.match(use.out, /base-kit .*\(up to date\)/);

  const swap = runCli(root, "profile", "use", "tester");
  assert.equal(swap.code, 0, swap.err);
  assert.match(swap.out, /- build-kit \(no longer requested\)/);
  assert.ok(has(root, ".cursor/skills/e2e") && !has(root, ".cursor/skills/pdf") && has(root, ".cursor/skills/commit"));
  assert.deepEqual(readJson(path.join(root, "ai-plugin.lock.json")).plugins.map((p) => p.id), ["base-kit"]);

  const st = runCli(root, "status");
  assert.equal(st.code, 0, st.out);
  assert.match(st.out, /Profile: tester/);
  assert.match(st.out, /test-kit {2}\[profile tester\]/);
  assert.match(runCli(root, "profile", "list").out, /\* tester/);

  assert.equal(runCli(root, "profile", "off").code, 0);
  assert.ok(!has(root, ".cursor/skills/e2e") && has(root, ".cursor/skills/commit"));
  assert.ok(!has(root, ".ai/current"));
});

test("options a command does not take are refused", () => {
  const root = tmp("deck-cli-");
  const r = runCli(root, "status", "--frozen");
  assert.equal(r.code, 1);
  assert.match(r.err, /agent-deck status does not take --frozen/);
  assert.match(runCli(root, "install", "--bogus").err, /Unknown option: --bogus/);
  assert.match(runCli(root, "nope").err, /Unknown command: nope/);
});

test("unknown commands and options are refused", () => {
  const root = tmp("deck-cli-");
  for (const cmd of ["sync", "apply", "list", "doctor", "scaffold"]) {
    assert.match(runCli(root, cmd).err, new RegExp(`Unknown command: ${cmd}`));
  }
  for (const flag of ["--plugin", "--no-sync", "--agents-md", "--no-agents-md"]) {
    assert.match(runCli(root, "install", flag, ...(flag === "--plugin" ? ["x"] : [])).err, new RegExp(`Unknown option: ${flag}`));
  }
});

function snapshot(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else files.push(`${path.relative(root, abs)}:${fs.statSync(abs).mtimeMs}`);
    }
  };
  walk(root);
  return files.sort().join("\n");
}

test("switching profiles leaves agent-deck's .gitignore block as it was", () => {
  const repo = market();
  const root = tmp("deck-cli-");
  const src = (name) => `git+${repo.url}@${name}`;
  assert.equal(runCli(root, "init").code, 0);
  runCli(root, "add", src("base-kit"));
  runCli(root, "profile", "new", "builder");
  runCli(root, "profile", "new", "tester");
  runCli(root, "add", src("build-kit"), "--profile", "builder");
  runCli(root, "add", src("test-kit"), "--profile", "tester");
  const read = () => fs.readFileSync(path.join(root, ".gitignore"), "utf8");

  const before = read();
  for (const rel of ["/.cursor/skills/commit", "/.cursor/skills/pdf", "/.cursor/skills/e2e"]) {
    assert.ok(before.split("\n").includes(rel), `${rel} is ignored before any profile is active`);
  }
  assert.equal(runCli(root, "profile", "use", "builder").code, 0);
  assert.equal(read(), before);
  assert.equal(runCli(root, "profile", "use", "tester").code, 0);
  assert.equal(read(), before);
  assert.equal(runCli(root, "profile", "off").code, 0);
  assert.equal(read(), before);

  runCli(root, "remove", "test-kit", "--profile", "tester");
  assert.ok(!read().split("\n").includes("/.cursor/skills/e2e"), "a plugin no profile pins any more leaves the block");
});

test("materialize builds the base and one profile into a folder, and nothing else", () => {
  const repo = market();
  const root = writeTree(tmp("deck-cli-"), { ".gitignore": "node_modules\n" });
  const src = (name) => `git+${repo.url}@${name}`;
  runCli(root, "add", src("base-kit"));
  runCli(root, "profile", "new", "builder");
  runCli(root, "profile", "new", "tester");
  runCli(root, "add", src("build-kit"), "--profile", "builder");
  runCli(root, "add", src("test-kit"), "--profile", "tester");
  const out = path.join(tmp("deck-out-"), "agents", "builder");
  const before = snapshot(root);

  const r = runCli(root, "materialize", "--profile", "builder", "--out", out, "--json");
  assert.equal(r.code, 0, r.err);
  const result = JSON.parse(r.out);
  assert.equal(result.profile, "builder");
  assert.equal(result.prompt, path.join(root, ".ai/profiles/builder/prompt.md"));
  assert.deepEqual(result.plugins.map((p) => p.id), ["base-kit", "build-kit"]);
  for (const p of result.plugins) {
    assert.equal(p.path, path.join(out, p.id));
    assert.ok(fs.existsSync(path.join(p.path, ".claude-plugin/plugin.json")));
    assert.ok(fs.existsSync(path.join(p.path, ".cursor-plugin/plugin.json")));
    assert.match(p.integrity, /^sha256-/);
  }
  assert.deepEqual(result.plugins[1].components.skills, ["pdf"]);
  assert.equal(snapshot(root), before, "the project is not touched");
  assert.ok(!has(root, ".ai/current"));

  const again = runCli(root, "materialize", "--profile", "builder", "--out", out);
  assert.match(again.out, /base-kit {2}\(up to date\)[\s\S]*build-kit {2}\(up to date\)/);

  const swap = JSON.parse(runCli(root, "materialize", "--profile", "tester", "--out", out, "--json").out);
  assert.deepEqual(swap.plugins.map((p) => p.id), ["base-kit", "test-kit"]);
  assert.ok(!fs.existsSync(path.join(out, "build-kit")), "a plugin no longer requested leaves the folder");

  const base = JSON.parse(runCli(root, "materialize", "--out", out, "--json").out);
  assert.equal(base.profile, null);
  assert.equal(base.prompt, null);
  assert.deepEqual(base.plugins.map((p) => p.id), ["base-kit"]);
});

test("materialize refuses what the lock does not pin, and needs --out", () => {
  const repo = market();
  const root = tmp("deck-cli-");
  runCli(root, "add", `git+${repo.url}@base-kit`, "--no-install");
  const r = runCli(root, "materialize", "--out", tmp());
  assert.equal(r.code, 1);
  assert.match(r.err, /base-kit not pinned by a lock/);
  assert.match(runCli(root, "materialize").err, /needs --out/);
  assert.match(runCli(root, "materialize", "--out", tmp(), "--profile", "nope").err, /No profile "nope"/);
});

test("install keeps agent-deck's .gitignore block in step with the copies it wrote", () => {
  const repo = market();
  const root = tmp("deck-cli-");
  assert.equal(runCli(root, "init").code, 0);
  runCli(root, "add", `git+${repo.url}@base-kit`);
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^\/\.cursor\/skills\/commit$/m);
  assert.match(ignore, /^\/\.claude\/skills\/commit$/m, "Claude falls back to copy mode in tests");
  runCli(root, "remove", "base-kit");
  assert.doesNotMatch(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /skills\/commit/);
  assert.match(runCli(root, "status").out, /✔/);
});
