# Speed Test

> Measure your internet connection. Live gauge, plain-English verdict, and history chart.

`org.asyar.speedtest` is a Tier 2 Asyar extension (utilities · macOS, Windows, Linux).

## What it does

The extension provides **2 commands**:

| Command | Mode | What it does |
| --- | --- | --- |
| **Speed Test** | `view` | Test your internet connection |
| **Speed Test History** | `view` | Browse past results with a trend chart |

It also exposes **1 tool** to AI agents:

| Tool | What the agent uses it for |
| --- | --- |
| `run-speed-test` | Measure the user's current internet download speed, upload speed, and latency. Call when the user asks how fast their connection is, complains it feels slow, or asks to test their internet. Takes ~15-25 seconds; the result includes Mbps figures, ping, and a plain-English quality verdict. |

## Permissions

```json
"permissions": [
  "network",
  "storage:read",
  "storage:write",
  "tools:register",
  "extension:invoke"
]
```

## Install

Install from the [Asyar Store](https://asyar.org/extensions).

Then open the **Agent editor** in the launcher to enable its tools for any agent.

## Develop

```bash
# from this directory
pnpm install
pnpm dev          # vite dev server
pnpm test:run     # vitest
pnpm build        # emits dist/{worker,view}.js + assets
pnpm link         # registers the dev path with the launcher
asyar publish     # builds, packages, GitHub release, store submission
```

## License

[MIT](./LICENSE) © Khoshbin
