import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';

const executablePath = process.argv[2];
const screenshotPath = process.argv[3] ?? path.resolve('artifacts', 'packaged-ui.png');

if (!executablePath) {
  throw new Error('Usage: node scripts/verify-packaged.mjs <executable> [screenshot]');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForTarget(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((candidate) =>
          candidate.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/?/.test(candidate.url)
        );
        if (target?.webSocketDebuggerUrl) return target;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for packaged Web UI${lastError ? `: ${lastError.message}` : ''}`);
}

async function waitForStudioTarget(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (response.ok) {
      const targets = await response.json();
      const target = targets.find((candidate) =>
        candidate.type === 'page' && /studio-settings\.html$/.test(candidate.url)
      );
      if (target?.webSocketDebuggerUrl) return target;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Studio settings window');
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('CDP connection closed'));
    pending.clear();
  });

  return {
    socket,
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

const debugPort = await reservePort();
const testUserData = await mkdtemp(path.join(tmpdir(), 'dsh-studio-packaged-'));
await writeFile(path.join(testUserData, 'studio-settings.json'), JSON.stringify({
  skin: {
    preset: 'custom',
    accent: '#6e9bff',
    background: '#07111f',
    surface: '#0e1c2f',
    text: '#eaf1ff',
    radius: 16,
  },
  autoCheckUpdates: true,
}));
const child = spawn(executablePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${testUserData}`,
], {
  detached: false,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});
const processOutput = [];
child.stdout.on('data', (chunk) => processOutput.push(chunk.toString()));
child.stderr.on('data', (chunk) => processOutput.push(chunk.toString()));

let cdp;
let studioCdp;
let serviceUrl;

try {
  const target = await waitForTarget(debugPort);
  serviceUrl = target.url;
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const evaluation = await cdp.call('Runtime.evaluate', {
      expression: `JSON.stringify({
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        visibleText: document.body?.innerText?.slice(0, 5000) ?? '',
        htmlLength: document.documentElement?.outerHTML?.length ?? 0,
        studioEntry: document.querySelector('#dsh-studio-appearance-button')?.textContent ?? null,
        skinBackground: getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-bg-base').trim()
      })`,
      returnByValue: true,
    });
    page = JSON.parse(evaluation.result.value);
    if (page.readyState === 'complete' && page.htmlLength >= 1000 && page.studioEntry === 'Studio 外观' && page.skinBackground === '#07111f') break;
    await delay(100);
  }
  const response = await fetch(serviceUrl);
  const html = await response.text();

  if (!response.ok || page.readyState !== 'complete' || page.htmlLength < 1000) {
    throw new Error(`Packaged UI was not healthy: HTTP ${response.status}, ${page.readyState}, ${page.htmlLength} bytes`);
  }

  const capture = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(capture.data, 'base64'));

  if (page.studioEntry !== 'Studio 外观' || page.skinBackground !== '#07111f') {
    throw new Error(`Studio skin was not applied: ${JSON.stringify({ entry: page.studioEntry, background: page.skinBackground })}`);
  }

  await cdp.call('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find(candidate => candidate.textContent.trim() === '继续');
      button?.click();
      return Boolean(button);
    })()`,
    returnByValue: true,
  });
  await delay(500);

  const themed = await cdp.call('Runtime.evaluate', {
    expression: `JSON.stringify({
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rootBackground: getComputedStyle(document.querySelector('#root')).backgroundColor,
      sampledBackgrounds: [...document.querySelectorAll('#root > *, #root > * > *')]
        .slice(0, 20)
        .map(element => getComputedStyle(element).backgroundColor)
    })`,
    returnByValue: true,
  });
  page.themeSample = JSON.parse(themed.result.value);

  await cdp.call('Runtime.evaluate', {
    expression: `document.querySelector('#dsh-studio-appearance-button').click()`,
    returnByValue: true,
  });
  const studioTarget = await waitForStudioTarget(debugPort);
  studioCdp = await connectCdp(studioTarget.webSocketDebuggerUrl);
  await studioCdp.call('Page.enable');
  await studioCdp.call('Runtime.enable');
  await studioCdp.call('Emulation.setDeviceMetricsOverride', {
    width: 920,
    height: 790,
    deviceScaleFactor: 1,
    mobile: false,
  });
  let studioPage;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const evaluation = await studioCdp.call('Runtime.evaluate', {
      expression: `JSON.stringify({
        title: document.title,
        readyState: document.readyState,
        presetCount: document.querySelectorAll('.preset').length,
        checkedPreset: document.querySelector('.preset[aria-checked="true"]')?.dataset.preset ?? null,
        colorInputCount: document.querySelectorAll('input[type="color"]').length,
        updateAction: document.querySelector('#update-action')?.textContent ?? null,
        updateMessage: document.querySelector('#update-message')?.textContent ?? null
      })`,
      returnByValue: true,
    });
    studioPage = JSON.parse(evaluation.result.value);
    if (studioPage.readyState === 'complete' && studioPage.presetCount >= 5) break;
    await delay(100);
  }
  if (studioPage.presetCount !== 5 || studioPage.checkedPreset !== 'custom' || studioPage.colorInputCount !== 4) {
    throw new Error(`Studio settings UI was incomplete: ${JSON.stringify(studioPage)}`);
  }
  const settingsScreenshotPath = screenshotPath.replace(/\.png$/i, '-settings.png');
  const settingsCapture = await studioCdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(settingsScreenshotPath, Buffer.from(settingsCapture.data, 'base64'));

  process.stdout.write(`${JSON.stringify({
    executablePath,
    serviceUrl,
    httpStatus: response.status,
    responseBytes: Buffer.byteLength(html),
    page,
    screenshotPath,
    studioPage,
    settingsScreenshotPath,
  }, null, 2)}\n`);

  await cdp.call('Browser.close').catch(() => {});
  cdp.socket.close();
  studioCdp.socket.close();
  if (!await waitForExit(child, 20_000)) {
    throw new Error('Packaged app did not exit after Browser.close');
  }

  let serviceStopped = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(serviceUrl);
      await delay(250);
    } catch {
      serviceStopped = true;
      break;
    }
  }
  if (!serviceStopped) throw new Error('Harness service stayed reachable after the desktop app exited');
  await rm(testUserData, { recursive: true, force: true });
  process.stdout.write('Packaged app exited and its Harness service stopped.\n');
} catch (error) {
  if (cdp?.socket?.readyState === WebSocket.OPEN) cdp.socket.close();
  if (studioCdp?.socket?.readyState === WebSocket.OPEN) studioCdp.socket.close();
  if (child.exitCode === null) child.kill();
  await rm(testUserData, { recursive: true, force: true }).catch(() => {});
  const output = processOutput.join('').trim();
  if (output) process.stderr.write(`${output}\n`);
  throw error;
}
