# How to Run OpenClaw Commands

## Option 1 — Node directly (always works)

```bash
node ~/openclaw/dist/index.js agents add work
```

> Good for quick tests, no setup needed.

---

## Option 2 — Alias (recommended)

Add a permanent alias to `~/.bashrc`:

```bash
echo 'alias openclaw="node ~/openclaw/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
```

Now just use:

```bash
openclaw agents add work
```

---

## Option 3 — pnpm global link

```bash
pnpm setup
source ~/.bashrc
cd ~/openclaw
pnpm link --global
```

> `pnpm setup` creates the global bin directory and adds it to PATH.  
> `source ~/.bashrc` reloads env vars without closing the terminal.

Then use normally:

```bash
openclaw agents add work
```

---

## Quick Reference

| Method | Command | When to use |
|---|---|---|
| Node directly | `node ~/openclaw/dist/index.js` | Quick test, no setup |
| Alias | `alias openclaw="node ~/..."` | Daily use, simplest |
| pnpm link | `pnpm setup && pnpm link --global` | Global command via pnpm |
