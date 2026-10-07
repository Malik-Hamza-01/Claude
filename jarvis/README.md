# Jarvis Day Engine

Personal day planner (prayer times, gym, work focus, LinkedIn CRM, agency, study, diet, sleep), moved out of a Claude artifact so it can run on its own.

## Run it

Requires Node 18+. No `npm install` needed.

```bash
cd jarvis
ANTHROPIC_API_KEY=sk-ant-... node server.js
# open http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the app still runs, but the AI features (meal estimates, "Ask Jarvis", focus reviews, outreach drafts, lead cleanup, assignments) switch to manual mode.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Turns on AI features. It stays on the server and is never sent to the browser. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens. Use `HOST=0.0.0.0` to open it from your phone on the same Wi-Fi. |
| `JARVIS_MODEL_QUICK` | `claude-haiku-4-5-20251001` | Model for short tasks (meals, focus checks, drafts) |
| `JARVIS_MODEL` | `claude-sonnet-5-5` | Model for long tasks (assignments) |

## Files

- `index.html`: the app, unchanged from the artifact apart from one `<script src="claude-shim.js">` line.
- `claude-shim.js`: stands in for Claude's artifact runtime and sends AI calls to the local server. Inside claude.ai it does nothing.
- `server.js`: serves the app and forwards AI calls to the Anthropic API.

## Data

Outside Claude, data is saved in the browser's `localStorage` on each device. It does **not** sync with the copy saved in the claude.ai artifact, and clearing site data erases it.
