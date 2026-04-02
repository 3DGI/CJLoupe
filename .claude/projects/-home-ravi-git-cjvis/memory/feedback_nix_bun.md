---
name: Use nix develop and bun
description: Always use nix develop -c for shell commands and bun (not npm) for package management
type: feedback
---

Use `nix develop -c` to run commands (e.g. `nix develop -c bun add <package>`), and use `bun` instead of `npm` for package management.

**Why:** The project uses a Nix flake for its dev environment; npm is not available.
**How to apply:** Prefix shell commands with `nix develop -c` when they need dev tooling. Use `bun add` / `bun install` instead of `npm install`.
