// Launches the Playwright MCP server for Claude Code (see .mcp.json).
// Locally this just runs `npx @playwright/mcp@latest`. In Claude Code cloud
// sessions it also points at the preinstalled Chromium, runs headless without
// the sandbox, and trusts the session's HTTPS proxy CA in the browser's NSS store.
// stdout carries the MCP protocol, so all diagnostics go to stderr.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = ['-y', '@playwright/mcp@latest']
const isCloud = process.env.CLAUDE_CODE_REMOTE === 'true'

if (isCloud) {
  trustProxyCa()
  args.push('--headless', '--isolated', '--no-sandbox')
  if (existsSync('/opt/pw-browsers/chromium')) args.push('--executable-path', '/opt/pw-browsers/chromium')
}
args.push(...process.argv.slice(2))

const child = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' })
child.on('exit', (code) => process.exit(code ?? 1))

function trustProxyCa() {
  const bundle = '/root/.ccr/ca-bundle.crt'
  if (!existsSync(bundle)) return
  const run = (cmd, cmdArgs, input) =>
    execFileSync(cmd, cmdArgs, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
  try {
    try {
      run('which', ['certutil'])
    } catch {
      run('apt-get', ['install', '-y', '-q', 'libnss3-tools'])
    }
    const db = `sql:${join(homedir(), '.pki', 'nssdb')}`
    mkdirSync(join(homedir(), '.pki', 'nssdb'), { recursive: true })
    if (!existsSync(join(homedir(), '.pki', 'nssdb', 'cert9.db'))) run('certutil', ['-N', '-d', db, '--empty-password'])
    const pems = readFileSync(bundle, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
    pems
      .filter((pem) => run('openssl', ['x509', '-noout', '-subject'], pem).includes('agent-proxy'))
      .forEach((pem, i) => run('certutil', ['-A', '-d', db, '-n', `ccr-proxy-ca-${i}`, '-t', 'C,,'], pem))
  } catch (err) {
    console.error(`[playwright-mcp] could not trust proxy CA: ${err.message}`)
  }
}
