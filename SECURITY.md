# Security

`ai-universal-memory` reads/writes only local files under `.memory/`
in the project you run it in, plus (on `init`) a one-time local scan
of `package.json`/`README.md`/directory names/git status — no network
calls, ever. Please report vulnerabilities privately via GitHub's
[Security Advisories](https://github.com/kinzart/ai-universal-memory/security/advisories/new)
rather than a public issue. We'll aim to respond within a few days.
