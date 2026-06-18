#!/usr/bin/env node
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
// Uses global WebSocket (available since Node 21)

const AUTH_STATES_DIR = path.join(homedir(), '.sahayak', 'gemini-auth-states');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9222;

if (!fs.existsSync(AUTH_STATES_DIR)) {
  fs.mkdirSync(AUTH_STATES_DIR, { recursive: true });
}

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const sock = new net.Socket();
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => { sock.destroy(); });
      sock.connect(port, '127.0.0.1');
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Port ${port} not available after ${timeoutMs}ms`));
      } else {
        setTimeout(tryConnect, 300);
      }
    }
    tryConnect();
  });
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject);
  });
}

function cmd(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const handler = (event) => {
      const parsed = JSON.parse(event.data.toString());
      if (parsed.id === id) {
        ws.removeEventListener('message', handler);
        resolve(parsed);
      }
    };
    ws.addEventListener('message', handler);
  });
}

async function generateAuth(accountNum) {
  console.log(`\n[${accountNum}] Starting Gemini auth state generation...`);

  let chromeProc = null;

  // Step 1: Ensure Chrome is running with remote debugging
  try {
    await waitForPort(CDP_PORT, 3000);
    console.log(`[${accountNum}] Connected to existing Chrome on port ${CDP_PORT}`);
  } catch {
    console.log(`[${accountNum}] Launching Chrome with remote debugging...`);
    const userDataDir = path.join(AUTH_STATES_DIR, `chrome-profile-${accountNum}`);
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ], { stdio: 'ignore', detached: true });
    chromeProc.unref();
    await waitForPort(CDP_PORT, 30000);
    console.log(`[${accountNum}] Chrome started.`);
  }

  try {
    // Step 2: Find or create Gemini tab
    let targets = await fetchJSON(`http://localhost:${CDP_PORT}/json`);
    let target = targets.find(t =>
      t.type === 'page' && t.url && t.url.includes('gemini.google.com')
    );

    if (!target) {
      const firstPage = targets.find(t => t.type === 'page');
      if (firstPage) target = firstPage;
      else throw new Error('No page targets available');
    }

    console.log(`[${accountNum}] Using tab: ${target.title}`);

    // Step 3: Connect and navigate to Gemini
    const page = await connect(target.webSocketDebuggerUrl);
    await cmd(page, 1, 'Page.navigate', { url: 'https://gemini.google.com/app' });
    await new Promise(r => setTimeout(r, 6000));

    // Step 4: Check sign-in status
    const result = await cmd(page, 2, 'Runtime.evaluate', {
      expression: `document.body.innerText.includes('Sign in')`,
      returnByValue: true,
    });
    const needsSignIn = result.result?.result?.value;

    if (needsSignIn) {
      console.log(`[${accountNum}] Please sign in to Google in the Chrome window.`);
    } else {
      console.log(`[${accountNum}] Already signed in.`);
    }
    console.log(`[${accountNum}] Press ENTER to save auth state.`);
    await new Promise(resolve => process.stdin.once('data', () => resolve()));
    await new Promise(r => setTimeout(r, 3000));

    // Step 5: Extract cookies
    const cookieResult = await cmd(page, 10, 'Network.getAllCookies');
    const cookies = cookieResult.result?.cookies || [];

    // Step 6: Extract localStorage
    const lsResult = await cmd(page, 11, 'Runtime.evaluate', {
      expression: `JSON.stringify(localStorage)`,
      returnByValue: true,
    });

    let lsData = {};
    try { lsData = JSON.parse(lsResult.result?.result?.value || '{}'); } catch {}

    // Step 7: Build Playwright storage state
    const storageState = {
      cookies: cookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        expires: c.expires || -1, httpOnly: c.httpOnly || false,
        secure: c.secure || false, sameSite: c.sameSite || 'Lax',
      })),
      origins: [{
        origin: 'https://gemini.google.com',
        localStorage: Object.entries(lsData).map(([n, v]) => ({ name: n, value: String(v) })),
      }],
    };

    // Step 8: Save
    const outPath = path.join(AUTH_STATES_DIR, `gemini-account${accountNum}.json`);
    fs.writeFileSync(outPath, JSON.stringify(storageState, null, 2));
    const size = fs.statSync(outPath).size;
    console.log(`[${accountNum}] Saved: ${outPath} (${(size / 1024).toFixed(1)} KB, ${cookies.length} cookies)`);

    page.close();
  } catch (err) {
    console.error(`[${accountNum}] Error:`, err.message);
  } finally {
    if (chromeProc) {
      try { process.kill(chromeProc.pid); } catch {}
    }
  }
}

(async () => {
  const count = parseInt(process.argv[2] || '1');
  for (let i = 1; i <= count; i++) {
    await generateAuth(i);
    if (i < count) console.log(`\nNext account (${i + 1}/${count})...`);
  }
  console.log(`\nDone! ${count} auth state(s) generated.`);
})();
