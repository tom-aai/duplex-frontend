# Duplex frontend

The browser half of the Duplex starter. This is a [Next.js](https://nextjs.org) app that calls
the browser client (`lib/duplex.ts`) and turns one `connect()` call into a live full-duplex
voice session: it captures the microphone, runs the WebRTC handshake through the broker, and
plays the model's voice.

Duplex is a learning project, not an SDK. There is nothing to install from npm. You run this
app, read it, and change it. Building it by hand is how we learn what our own SDK should look
like later. See the [`duplex-server`](../duplex-server) repo for the full picture.

It talks to the **broker** (the Python server in the separate
[`duplex-server`](../duplex-server) repo). Run the broker first, or point this app at a deployed one.

## Run it locally

You need the broker running too. See the `duplex-server` repo for how to start it (it listens on
`http://localhost:8000` by default).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set the broker URL. Copy the template and edit it if your broker is not on the default port:

   ```bash
   cp .env.local.example .env.local
   ```

   The default `NEXT_PUBLIC_BROKER_URL=http://localhost:8000` matches the broker's default.

3. Start the dev server:

   ```bash
   npm run dev          # serves http://localhost:3000
   ```

4. Open **http://localhost:3000**, click **Connect & talk**, allow the microphone, and start
   talking.

The page has two panes. The left pane streams the worker's log live from the broker's `/logs`
endpoint, so you watch each delegation run. The right pane lists things to try.

## How it connects to the broker

Two environment variables wire the two apps together:

| Variable                 | Set on     | Purpose                                                            |
| ------------------------ | ---------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_BROKER_URL` | this app   | Where the browser posts its WebRTC offer. Read by `lib/duplex.ts`. |
| `DUPLEX_ALLOWED_ORIGINS` | the broker | The CORS allowlist. Must include this app's origin.                |

Locally the defaults already match (`:3000` → `:8000`), so there is nothing to change. When
you deploy, each app needs the other's real URL (see below).

`NEXT_PUBLIC_BROKER_URL` is a `NEXT_PUBLIC_` variable, so Next.js inlines it at **build** time.
A change to it needs a rebuild, not just a restart.

## Deploy on Render

A [`render.yaml`](./render.yaml) blueprint is included. In Render, pick **New > Blueprint** and
point it at this repo. Then:

1. Set `NEXT_PUBLIC_BROKER_URL` to the broker's deployed URL (for example
   `https://duplex-broker.onrender.com`). It must be set before the build runs.
2. On the broker, set `DUPLEX_ALLOWED_ORIGINS` to this app's deployed URL (for example
   `https://duplex-frontend.onrender.com`), so the browser's cross-origin call is allowed.

Render serves the app over HTTPS, which `getUserMedia` (the microphone) requires.

## Key files

| File            | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `lib/duplex.ts` | The browser client — the `connect()` / `disconnect()` API.                 |
| `app/page.tsx`  | The example UI: a Connect/Disconnect button, a status line, an error panel. |

## Notes

- **Microphone + HTTPS:** `getUserMedia` needs a secure context. `http://localhost` counts as
  secure, so local dev is fine. A deployed version needs HTTPS (Render provides it).
- **Next.js 16 is not the Next.js in your training data.** See [`AGENTS.md`](./AGENTS.md); check
  the bundled docs under `node_modules/next/dist/docs/` before writing Next-specific code.
