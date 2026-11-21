# AGENTS.md

Instructions for AI coding agents working in this repository. For a human-facing
overview, see [README.md](README.md).

## What this repo is

`@toolmesh/agent-deck`: a CLI (`bin/agent-deck.js`, code in `src/`) that installs skills,
agents and MCP servers from plugin marketplaces into a project for Claude Code and Cursor.

## Hard rules

1. **All content is English**: docs, README, code comments, commit messages.
2. **One focused commit per logical change.**
3. **Tests must pass**: `npm test`.
4. **Never run `npm publish` by hand.** Releases go through GitHub Actions only (see
   [Release procedure](#release-procedure)).

## Quick reference

| Task  | Command                   |
| ----- | ------------------------- |
| Tests | `npm test`                |
| Help  | `node src/cli.mjs --help` |

## Definition of done

- [ ] `npm test` passes
- [ ] [README.md](README.md) matches the command surface

## Release procedure

[`publish.yml`](.github/workflows/publish.yml) runs when a `vX.Y.Z` tag is pushed and
publishes to npm through Trusted Publishing (OIDC, no token). It refuses to publish unless:

- the tagged commit is an ancestor of `origin/main`;
- the tag `vX.Y.Z` matches `version` in `package.json`;
- `npm test` passes.

Steps, in order:

1. Land the feature or fix commits on `main`.
2. Bump `version` in `package.json` in its own commit named `Release X.Y.Z.` (semver: new
   feature → minor, fix → patch, breaking change → major).
3. Push `main`.
4. Tag that commit and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "X.Y.Z"
   git push origin vX.Y.Z
   ```

5. Check the run in GitHub Actions and the result with `npm view @toolmesh/agent-deck version`.

Agent rules:

- Do not run `npm publish`, `npm login`, or create an npm token. If CI fails, fix the cause
  and release the next version.
- Do not push `main` or a tag unless the user asked for it. A tag triggers the publish.
- Never move or delete a pushed `v*` tag; npm versions cannot be reused.
