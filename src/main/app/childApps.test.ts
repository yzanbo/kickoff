import assert from "node:assert/strict";
import { test } from "vitest";
import { parsePs } from "../../core/platform/macos/processes.js";
import { macosDesktopPlatform } from "../platform/macos/index.js";
import { descendantElectronMains } from "./childApps.js";

const { isDevElectronMain: isMain } = macosDesktopPlatform();

test("descendantElectronMains: 子孫のうち Electron のメインプロセスだけを返す（Helper・ほかのアプリ・子孫でないものは除く）", () => {
  const ps = `
    100     1 00:10 /Applications/Kickoff.app/Contents/MacOS/Kickoff
    101   100 00:10 /Applications/Kickoff.app/Contents/Frameworks/Kickoff Helper (Renderer).app/Contents/MacOS/Kickoff Helper (Renderer) --type=renderer
    200   100 00:10 /bin/zsh -l
    201   200 00:10 npm run dev
    202   201 00:10 node /repo/node_modules/.bin/electron-vite dev
    203   202 00:10 /repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
    204   203 00:10 /repo/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer) --type=renderer
    300   100 00:10 /repo/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude
    301   300 00:10 /bin/bash -c npm run dev
    302   301 00:10 /other/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
    400     1 00:10 /repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
  `;
  assert.deepEqual(descendantElectronMains(parsePs(ps), 100, isMain).sort(), [203, 302]);
  assert.deepEqual(descendantElectronMains(parsePs(ps), 999, isMain), []);
});

test("descendantElectronMains: コアのプロセス（utilityProcess の Helper）の下のシェルから起動した開発版も見つける", () => {
  const ps = `
    100     1 00:10 /Applications/Kickoff.app/Contents/MacOS/Kickoff
    110   100 00:10 /Applications/Kickoff.app/Contents/Frameworks/Kickoff Helper.app/Contents/MacOS/Kickoff Helper --type=utility --service-name=Kickoff Core
    200   110 00:10 /bin/zsh -l
    201   200 00:10 npm run dev
    203   201 00:10 /repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
    204   203 00:10 /repo/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=utility --service-name=Kickoff Core
  `;
  assert.deepEqual(descendantElectronMains(parsePs(ps), 100, isMain), [203]);
});
