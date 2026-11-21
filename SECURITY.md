# Security

Report a vulnerability privately through
[GitHub security advisories](https://github.com/tilap/agent-deck/security/advisories/new),
not in a public issue. Expect an answer within a week.

agent-deck fetches third-party content (git repositories, npm packages, archives) and
copies it into a project, where an agent can run it. Review a plugin before you add it.
The lockfile pins a content digest so what you reviewed is what gets installed again.

Only the latest release receives fixes.
