# J.A.R.V.I.S.

Your personal voice assistant, running on your own computer and powered by Claude. Talk to it or type, and it answers out loud.

## What you need

1. **Node.js** (version 20 or newer), from https://nodejs.org. Choose the "LTS" download.
2. **Google Chrome or Microsoft Edge.** JARVIS opens in its own window using one of these, and the microphone needs them.
3. **An Anthropic API key**, which gives JARVIS its brain:
   - Go to https://console.anthropic.com and sign in.
   - Under **Billing**, add a payment method or buy a few dollars of credits. You pay only for what you use; a typical message costs well under one cent.
   - Under **API Keys**, click **Create Key** and copy it (it starts with `sk-ant-`).

## Start JARVIS

1. On GitHub, click **Code → Download ZIP**, then unzip it anywhere (or `git clone` the repo).
2. Double-click the launcher:
   - **Windows:** `Start JARVIS.bat`
   - **Mac:** `Start JARVIS.command` (the first time, right-click it and choose **Open**)
   - Or from a terminal in this folder: `npm start`
3. The first time, it installs what it needs and asks you to paste your API key. The key is saved only on this computer, in a file named `.dev.vars`.
4. JARVIS opens in its own window. Allow microphone access when asked.

Keep the black launcher window open while you use JARVIS; closing it (or pressing Ctrl+C) shuts JARVIS down. Everything runs on `localhost`, so nobody else on the internet can reach it.

To change your API key later, delete `.dev.vars` and start JARVIS again.

## Using it

- **Talk:** click the mic button and speak; JARVIS sends your message when you stop talking.
- **Type:** use the text box and press Enter.
- **Voice on/off:** the button in the top-right toggles whether JARVIS reads replies aloud.
- **Stop:** cuts off a reply or the speech.

## Customize

- JARVIS's personality lives in `src/lib/jarvis.ts`. Edit the text in `JARVIS_SYSTEM_PROMPT` to change how it talks or what it focuses on.
- The window and design are in `src/routes/index.tsx`.
- The server that talks to Claude is `src/routes/api/jarvis.ts`.
