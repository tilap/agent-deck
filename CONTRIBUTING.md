# Contributing

Issues and pull requests are welcome.

## Setup

Node.js 22.14 or later and `git`. There are no runtime dependencies.

```bash
git clone https://github.com/tilap/agent-deck.git
cd agent-deck
npm test
node src/cli.mjs --help
```

## Pull requests

- One focused commit per logical change.
- `npm test` passes. Add or update tests next to the code they cover (`src/*.test.mjs`).
- [README.md](README.md) matches the command surface when a command, option, file format
  or default changes.
- Documentation, code comments and commit messages are in English.

## Issues

Describe the need first, then the acceptance criteria. For a bug, give the command you ran,
what you expected and what happened, with `node -v` and the host (Claude Code or Cursor).
