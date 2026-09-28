# J.A.R.V.I.S.

A voice-enabled AI assistant powered by Claude. Talk to it with your mic or type, and it answers out loud.

- **Voice in:** the browser's Web Speech API (Chrome, Edge, Safari). On other browsers the mic button is hidden and typing still works.
- **Voice out:** the browser's built-in speech synthesis. Toggle it with "Voice on/off".
- **Brains:** Claude, streamed from `/api/jarvis` (`src/routes/api/jarvis.ts`). JARVIS's personality lives in `src/lib/jarvis.ts`; edit the system prompt there to change how it behaves.

Built with TanStack Start, Tailwind CSS, and Cloudflare Workers.

## Run it locally

1. Get an API key at https://console.anthropic.com (API Keys).
2. Create a file named `.dev.vars` in the project root:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Install and start:
   ```bash
   bun install
   npx vite dev --port 3000
   ```
4. Open http://localhost:3000

## Deploy to Cloudflare Workers

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
bun run deploy
```

Wrangler prints your live URL when the deploy finishes.

## Costs and limits

Each message is billed to your Anthropic account. The server only accepts the last 20 turns of a conversation, 4,000 characters each, to keep costs bounded. The endpoint is public once deployed, so anyone with the URL can use your key; add authentication (for example Cloudflare Access) before sharing it widely.
