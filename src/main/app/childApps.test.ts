import assert from "node:assert/strict";
import { test } from "node:test";
import { descendantElectronMains } from "./childApps.js";

test("descendantElectronMains: 子孫のうち Electron のメインプロセスだけを返す（Helper・ほかのアプリ・子孫でないものは除く）", () => {
  const ps = `
    100     1 /Applications/Kickoff.app/Contents/MacOS/Kickoff
    101   100 /Applications/Kickoff.app/Contents/Frameworks/Kickoff Helper (Renderer).app/Contents/MacOS/Kickoff Helper (Renderer) --type=renderer
    200   100 /bin/zsh -l
    201   200 npm run dev
    202   201 node /repo/node_modules/.bin/electron-vite dev
    203   202 /repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
    204   203 /repo/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer) --type=renderer
    300   100 /repo/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude
    301   300 /bin/bash -c npm run dev
    302   301 /other/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
    400     1 /repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
  `;
  assert.deepEqual(descendantElectronMains(ps, 100).sort(), [203, 302]);
  assert.deepEqual(descendantElectronMains(ps, 999), []);
});
