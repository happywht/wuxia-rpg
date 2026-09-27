import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { build, createServer } from 'vite';

import { DATA_CHANGE_EVENT, classifyDataFile, dataHotReload } from './data-hmr-plugin.mjs';

/**
 * Round 36 smoke: dev-mode data hot reload.
 *
 * 1. Unit-checks the watcher-side path classification (data/mods JSON vs
 *    source files, non-JSON, traversal and outside-root paths).
 * 2. Unit-checks the plugin's Environment-API `hotUpdate` hook against a fake
 *    client environment: data JSON broadcasts the custom event and returns []
 *    (suppressing Vite's default update/reload); unrelated files and other
 *    environments keep the default behavior.
 * 3. Transpiles the real src/game/data-hot-reload.ts with the project
 *    TypeScript and drives it through a fake HMR channel: same-window
 *    batching, same-file last-write-wins merging, unsubscribe (including a
 *    pending window) and the production no-op path.
 * 4. Boots the *real* dev server from this repository's vite.config.ts,
 *    connects a WebSocket HMR client (Node's global WebSocket), and touches
 *    real files: a byte-identical rewrite of a data JSON must raise a custom
 *    data event (never a full-reload), a mods probe file must raise create
 *    and delete notices, and a non-JSON probe must raise nothing.
 * 5. Builds a production bundle into a temp dir and asserts the dev bridge
 *    (event name and subscribe entry point) is absent from every chunk.
 *
 * Nothing in data/, mods/ or src/ is left modified: the data JSON is
 * rewritten with its own bytes, both probe files are removed again.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transpiledDir = await mkdtemp(path.join(root, 'node_modules/.tmp-r36-smoke-'));

// ---------------------------------------------------------------------------
// 1. Watcher-side path classification
// ---------------------------------------------------------------------------

{
  const rootDir = path.resolve(tmpdir(), 'wuxia-r36-classify-root');
  const at = (relative) => relative.split('/').join(path.sep);
  const joinRoot = (relative) => path.join(rootDir, at(relative));

  assert.deepEqual(
    classifyDataFile(rootDir, joinRoot('data/base/maps/round-01-grid.json')),
    { layer: 'data', relative: 'base/maps/round-01-grid.json' },
    'data JSON below data/ is classified with its sub-path',
  );
  assert.deepEqual(
    classifyDataFile(rootDir, joinRoot('mods/example/maps/round-01-grid.json')),
    { layer: 'mods', relative: 'example/maps/round-01-grid.json' },
    'mods JSON below mods/ is classified with its mod-relative path',
  );
  assert.deepEqual(
    classifyDataFile(rootDir, joinRoot('data/schema/manifest.schema.json')),
    { layer: 'data', relative: 'schema/manifest.schema.json' },
    'schema JSON belongs to the data layer',
  );
  assert.equal(
    classifyDataFile(rootDir, joinRoot('src/game/menu-scene.ts')),
    null,
    'source files are never data changes',
  );
  assert.equal(
    classifyDataFile(rootDir, joinRoot('data/base/notes.txt')),
    null,
    'non-JSON files below data/ are ignored',
  );
  assert.equal(
    classifyDataFile(rootDir, joinRoot('mods/example/override.json.bak')),
    null,
    'non-JSON extensions below mods/ are ignored',
  );
  assert.equal(
    classifyDataFile(rootDir, joinRoot('data/.hidden/secret.json')),
    null,
    'dotfile directories are ignored',
  );
  assert.equal(
    classifyDataFile(rootDir, path.resolve(rootDir, at('../outside/data/base/x.json'))),
    null,
    'paths outside the project root are ignored',
  );
  // Node's path.relative normalizes `..` before comparing, so a `..` that
  // stays inside data/ resolves to its canonical (safe) path — only paths
  // that escape the root survive as `..` segments and get rejected above.
  assert.deepEqual(
    classifyDataFile(rootDir, joinRoot('data/base/a/../b.json')),
    { layer: 'data', relative: 'base/b.json' },
    'in-layer .. segments normalize to their canonical safe path',
  );
  assert.equal(classifyDataFile(rootDir, joinRoot('data')), null, 'the bare layer dir is ignored');
  assert.equal(classifyDataFile(rootDir, ''), null, 'empty paths are ignored');
  // Vite reports slash-normalized absolute paths; that form must classify too.
  assert.deepEqual(
    classifyDataFile(rootDir, joinRoot('data/base/x.json').split(path.sep).join('/')),
    { layer: 'data', relative: 'base/x.json' },
    'slash-normalized watcher paths classify identically',
  );
}

// ---------------------------------------------------------------------------
// 2. Plugin hotUpdate hook against a fake client environment
// ---------------------------------------------------------------------------

{
  const rootDir = path.resolve(tmpdir(), 'wuxia-r36-plugin-root');
  const dataFile = path.join(rootDir, 'data', 'base', 'maps', 'x.json');
  const sent = [];
  const plugin = dataHotReload(rootDir);
  const clientContext = {
    environment: {
      name: 'client',
      hot: { send: (message) => sent.push(message) },
    },
  };
  const hookOptions = (overrides) => ({
    type: 'update',
    file: dataFile,
    timestamp: 0,
    modules: [],
    read: () => '',
    ...overrides,
  });

  assert.equal(plugin.name, 'wuxia-rpg-data-hot-reload');
  assert.equal(plugin.apply, 'serve', 'the plugin must never run in builds');

  // Data JSON: custom event broadcast, default update suppressed.
  const filtered = plugin.hotUpdate.call(clientContext, hookOptions({}));
  assert.deepEqual(filtered, [], 'data changes return an empty module list (custom handling)');
  assert.equal(sent.length, 1, 'exactly one custom event is sent');
  assert.deepEqual(
    sent[0],
    {
      type: 'custom',
      event: DATA_CHANGE_EVENT,
      data: { layer: 'data', relative: 'base/maps/x.json', changeType: 'update' },
    },
    'the event carries layer, relative path and watcher change type',
  );

  // create/delete watcher kinds pass through verbatim.
  plugin.hotUpdate.call(clientContext, hookOptions({ type: 'create' }));
  plugin.hotUpdate.call(clientContext, hookOptions({ type: 'delete' }));
  assert.equal(sent.length, 3);
  assert.equal(sent[1].data.changeType, 'create');
  assert.equal(sent[2].data.changeType, 'delete');

  // Unrelated files: default behavior (no event, no module filtering).
  sent.length = 0;
  const untouched = plugin.hotUpdate.call(
    clientContext,
    hookOptions({ file: path.join(rootDir, 'src', 'main.ts') }),
  );
  assert.equal(untouched, undefined, 'non-data files keep Vite defaults');
  assert.equal(sent.length, 0, 'no event is broadcast for unrelated files');

  // Other environments (e.g. SSR) are not notified.
  const ssrContext = { environment: { name: 'ssr', hot: { send: (m) => sent.push(m) } } };
  plugin.hotUpdate.call(ssrContext, hookOptions({}));
  assert.equal(sent.length, 0, 'only the client environment receives the event');
}

// ---------------------------------------------------------------------------
// 3. Client bridge: batching, merging, unsubscribe, production no-op
// ---------------------------------------------------------------------------

try {
  const source = readFileSync(path.join(root, 'src/game/data-hot-reload.ts'), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // The module reads import.meta.env.DEV / import.meta.hot; neither exists in
  // plain Node, so both are redirected to injectable globals (mirrors the
  // r35 smoke's text-level patching of the transpiled output).
  const patched = transpiled
    .replaceAll('import.meta.env.DEV', 'globalThis.__smokeDev__')
    .replaceAll('import.meta.hot', 'globalThis.__smokeHot');
  const moduleFile = path.join(transpiledDir, 'data-hot-reload.mjs');
  writeFileSync(moduleFile, patched);
  const { subscribeDataChanges } = await import(pathToFileURL(moduleFile).href);

  const listeners = new Map();
  const eventNames = [];
  const channel = {
    on(event, callback) {
      eventNames.push(event);
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
    },
    off(event, callback) {
      listeners.get(event)?.delete(callback);
    },
    emit(event, payload) {
      for (const callback of listeners.get(event) ?? []) callback(payload);
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
  globalThis.__smokeHot = channel;
  globalThis.__smokeDev__ = true;

  // 3a. One batch per merge window; same-file notices keep the last change.
  const batches = [];
  const off = subscribeDataChanges((batch) => batches.push(batch), 20);
  assert.deepEqual(
    eventNames.filter((name) => name === DATA_CHANGE_EVENT),
    [DATA_CHANGE_EVENT],
    'the bridge listens on exactly the server event name',
  );
  channel.emit(DATA_CHANGE_EVENT, { layer: 'data', relative: 'base/a.json', changeType: 'update' });
  channel.emit(DATA_CHANGE_EVENT, { layer: 'mods', relative: 'm/b.json', changeType: 'create' });
  channel.emit(DATA_CHANGE_EVENT, { layer: 'data', relative: 'base/a.json', changeType: 'delete' });
  await sleep(90);
  assert.equal(batches.length, 1, 'a burst inside the window is delivered as one batch');
  assert.equal(batches[0].length, 2, 'two distinct files arrive as two notices');
  assert.deepEqual(
    batches[0].find((notice) => notice.relative === 'base/a.json'),
    { layer: 'data', relative: 'base/a.json', changeType: 'delete' },
    'same-file notices merge to the latest change type',
  );

  // 3b. A later burst is a second batch (the window does not swallow history).
  channel.emit(DATA_CHANGE_EVENT, { layer: 'data', relative: 'base/c.json', changeType: 'update' });
  await sleep(90);
  assert.equal(batches.length, 2);
  assert.equal(batches[1].length, 1);

  // 3c. Unsubscribing detaches the HMR listener and stops delivery.
  off();
  assert.equal(channel.listenerCount(DATA_CHANGE_EVENT), 0, 'unsubscribe removes the HMR listener');
  channel.emit(DATA_CHANGE_EVENT, { layer: 'data', relative: 'base/d.json', changeType: 'update' });
  await sleep(90);
  assert.equal(batches.length, 2, 'no batch is delivered after unsubscribing');

  // 3d. Unsubscribing inside the window cancels the pending batch.
  let lateBatchCount = 0;
  const offPending = subscribeDataChanges(() => { lateBatchCount += 1; }, 20);
  channel.emit(DATA_CHANGE_EVENT, { layer: 'data', relative: 'base/e.json', changeType: 'update' });
  offPending(); // Before the window elapses.
  await sleep(90);
  assert.equal(lateBatchCount, 0, 'a pending window is cancelled by unsubscribe');

  // 3e. Production mode: nothing is registered and the cancel is inert.
  globalThis.__smokeDev__ = false;
  const prodEventNamesBefore = eventNames.length;
  const prodOff = subscribeDataChanges(() => assert.fail('production must never deliver batches'));
  prodOff();
  assert.equal(eventNames.length, prodEventNamesBefore, 'production registers no HMR listener');
} finally {
  rmSync(transpiledDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 4. Real dev server: custom events on data/mods JSON, no full-reload
// ---------------------------------------------------------------------------

await (async () => {
  assert.ok(typeof WebSocket === 'function', 'Node >= 22.12 provides a global WebSocket client');

  const server = await createServer({
    root,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
  });
  let socket;
  const probeFiles = [
    path.join(root, 'mods', 'example', '__smoke_probe__.json'),
    path.join(root, 'data', 'base', '__smoke_probe__.txt'),
  ];
  try {
    await server.listen();
    // Let chokidar's initial scan settle before a client connects: the
    // startup "add" burst is not a content change (browsers only connect
    // after this phase in real usage), so the assertions must not see it.
    await new Promise((resolve) => {
      const hardStop = setTimeout(resolve, 10000);
      const settleFor = (ms) => setTimeout(() => {
        clearTimeout(hardStop);
        server.watcher.off('add', onAdd);
        resolve();
      }, ms);
      let settle = settleFor(600);
      const onAdd = () => {
        clearTimeout(settle);
        settle = settleFor(600);
      };
      server.watcher.on('add', onAdd);
    });

    const port = server.httpServer?.address()?.port;
    assert.ok(typeof port === 'number', 'the dev server is listening');
    const messages = [];
    socket = new WebSocket(`ws://127.0.0.1:${port}`, 'vite-hmr');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('HMR websocket did not connect')), 10000);
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        messages.push(message);
        if (message.type === 'connected') {
          clearTimeout(timeout);
          resolve();
        }
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('HMR websocket error'));
      };
    });
    const waitFor = async (matches, label, timeoutMs = 10000) => {
      const startedAt = Date.now();
      for (;;) {
        const hit = messages.find(matches);
        if (hit !== undefined) return hit;
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error(`timed out waiting for ${label}; saw ${JSON.stringify(messages.slice(-8))}`);
        }
        await sleep(100);
      }
    };
    const dataNotice = (notice) =>
      notice.type === 'custom' &&
      notice.event === DATA_CHANGE_EVENT &&
      (notice.data.layer === 'data' || notice.data.layer === 'mods');

    // 4a. Byte-identical rewrite of a data JSON: an update notice, no reload.
    const manifestPath = path.join(root, 'data', 'base', 'manifest.json');
    const originalBytes = await readFile(manifestPath);
    await writeFile(manifestPath, originalBytes);
    const updateNotice = await waitFor(
      (message) => dataNotice(message) && message.data.layer === 'data' && message.data.changeType === 'update',
      'a data JSON update notice',
    );
    assert.match(updateNotice.data.relative, /^base\//, 'the notice carries the data-relative path');
    assert.equal(
      await readFile(manifestPath, 'utf8'),
      originalBytes.toString('utf8'),
      'the touched data file is byte-identical to before',
    );

    // 4b. New mods JSON: create notice; removing it: delete notice.
    const probePath = path.join(root, 'mods', 'example', '__smoke_probe__.json');
    await writeFile(probePath, '{"id":"smoke.probe"}');
    const createNotice = await waitFor(
      (message) => dataNotice(message) && message.data.layer === 'mods' && message.data.changeType === 'create',
      'a mods JSON create notice',
    );
    assert.equal(createNotice.data.relative, 'example/__smoke_probe__.json');
    await rm(probePath);
    await waitFor(
      (message) => dataNotice(message) && message.data.layer === 'mods' && message.data.changeType === 'delete',
      'a mods JSON delete notice',
    );

    // 4c. Non-JSON below data/: ignored (no data event, no reload).
    const txtPath = path.join(root, 'data', 'base', '__smoke_probe__.txt');
    await writeFile(txtPath, 'not json');
    await sleep(1500);
    assert.ok(
      !messages.some(
        (message) =>
          message.type === 'custom' &&
          message.event === DATA_CHANGE_EVENT &&
          message.data.relative === 'base/__smoke_probe__.txt',
      ),
      'the non-JSON probe never raises a data event',
    );
    await rm(txtPath);
    await sleep(800);

    // 4d. None of the above may have caused a page reload.
    assert.ok(
      !messages.some((message) => message.type === 'full-reload'),
      'data/mods JSON changes must never trigger a Vite full-reload',
    );
  } finally {
    for (const probe of probeFiles) {
      await rm(probe, { force: true });
    }
    if (socket !== undefined && socket.readyState < WebSocket.CLOSING) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        socket.addEventListener('close', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        socket.close();
      });
    }
    await server.close();
  }
})();

// ---------------------------------------------------------------------------
// 5. Production build keeps the dev bridge out of every chunk
// ---------------------------------------------------------------------------

await (async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'wuxia-r36-dist-'));
  try {
    await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const jsFiles = [];
    const walk = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(entryPath);
        else if (entry.name.endsWith('.js')) jsFiles.push(entryPath);
      }
    };
    await walk(outDir);
    assert.ok(jsFiles.length > 0, 'the production build emitted JS chunks');
    for (const file of jsFiles) {
      const text = await readFile(file, 'utf8');
      // The event-name literal is the reliable marker: identifiers get
      // minified (and a field like `unsubscribeDataChanges` would false-
      // positive on a name check), but string literals survive either way.
      assert.ok(
        !text.includes(DATA_CHANGE_EVENT),
        `production chunks must not contain the dev HMR event name (${path.basename(file)})`,
      );
      assert.ok(
        !text.includes('import.meta.hot'),
        `production chunks must not touch the dev HMR context (${path.basename(file)})`,
      );
    }
    // Source-level contract: every bridge call site sits behind the static
    // DEV guard, which is what lets the tree-shaker drop the module above.
    for (const [sceneName, sceneSource] of [
      ['menu-scene.ts', await readFile(path.join(root, 'src/game/menu-scene.ts'), 'utf8')],
      ['grid-scene.ts', await readFile(path.join(root, 'src/game/grid-scene.ts'), 'utf8')],
    ]) {
      assert.match(
        sceneSource,
        /this\.unsubscribeDataChanges\s*=\s*import\.meta\.env\.DEV\s*\?\s*subscribeDataChanges\(/s,
        `${sceneName} bridge registration must be statically gated by import.meta.env.DEV`,
      );
    }
    assert.ok(
      existsSync(path.join(outDir, 'base', 'manifest.json')),
      'the public data dir is still copied into the build',
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
})();

console.log(
  '通过：安全路径分类（data/mods JSON、非 JSON、越界与点目录忽略）、hotUpdate 自定义事件 + 空模块列表抑制默认更新、'
  + '客户端同窗口批量/同文件末次合并/退订取消、真实 dev 服务器 data 更新与 mods 增删通知且全程无 full-reload、'
  + '生产构建剔除热重载桥接且 data 资产照常复制；被触碰文件均恢复原状。',
);
