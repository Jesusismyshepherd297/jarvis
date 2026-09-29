// Launches JARVIS on this computer: installs dependencies on first run, asks for
// the Anthropic API key once (saved to .dev.vars), starts the local server, and
// opens JARVIS in its own app window.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3939;
const URL = `http://localhost:${PORT}`;
const isWindows = process.platform === "win32";
const npx = isWindows ? "npx.cmd" : "npx";
const npm = isWindows ? "npm.cmd" : "npm";

function log(message) {
  console.log(`[JARVIS] ${message}`);
}

function installIfNeeded() {
  if (existsSync(join(root, "node_modules"))) return;
  log("First run: installing dependencies (this takes a minute)...");
  const result = spawnSync(npm, ["install"], { cwd: root, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) {
    log("Installing dependencies failed. Check your internet connection and try again.");
    process.exit(1);
  }
}

async function ensureApiKey() {
  const varsPath = join(root, ".dev.vars");
  if (existsSync(varsPath) && /^ANTHROPIC_API_KEY=sk-ant-\S+/m.test(readFileSync(varsPath, "utf8"))) {
    return;
  }
  log("JARVIS needs your Anthropic API key (create one at https://console.anthropic.com).");
  log("It is saved only on this computer, in the .dev.vars file.");
  if (!process.stdin.isTTY) {
    // e.g. VS Code's Debug Console, which can't take typed input.
    log("This window can't take typed input. Open a terminal (in VS Code: Terminal → New Terminal),");
    log("type  npm start  and press Enter, then paste your key there.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let key = "";
  while (!key.startsWith("sk-ant-")) {
    key = (await rl.question("Paste your API key (starts with sk-ant-): ")).trim();
  }
  rl.close();
  writeFileSync(varsPath, `ANTHROPIC_API_KEY=${key}\n`, { mode: 0o600 });
  log("Key saved.");
}

async function waitForServer(server) {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) return false;
    try {
      const res = await fetch(URL);
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// Chrome or Edge in "app" mode gives JARVIS its own window with a working
// microphone; fall back to the default browser if neither is found.
function openWindow() {
  const candidates = {
    win32: [
      join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
      join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
      join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
  }[process.platform] ?? [];

  const browser = candidates.find((path) => path && existsSync(path));
  if (browser) {
    launch(browser, [`--app=${URL}`, "--window-size=900,900"]);
    return;
  }
  const opener = isWindows ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = isWindows ? ["/c", "start", "", URL] : [URL];
  launch(opener, args);
  log("Tip: use Chrome or Edge so the microphone works.");
}

function launch(command, args) {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => log(`Couldn't open a window automatically. Open ${URL} in Chrome or Edge.`));
  child.unref();
}

installIfNeeded();
await ensureApiKey();

log("Starting up...");
const server = spawn(npx, ["vite", "dev", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
  shell: isWindows,
});

if (!(await waitForServer(server))) {
  log(`JARVIS couldn't start. If something else is using port ${PORT}, close it and try again.`);
  server.kill();
  process.exit(1);
}

log(`Online at ${URL}. Keep this window open while you use JARVIS; press Ctrl+C to shut down.`);
openWindow();

const shutdown = () => {
  server.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", () => process.exit(0));
