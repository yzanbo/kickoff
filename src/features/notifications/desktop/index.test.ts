import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { IpcMainEvent, WebContents } from "electron";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { until } from "@/foundation/core/testing/until";
import { createPinstageBadges } from "./index";

function windowFixture() {
  const events = new EventEmitter();
  const sender = Object.assign(events, { mainFrame: {} }) as unknown as WebContents;
  const event = { sender, senderFrame: sender.mainFrame } as IpcMainEvent;
  return { events, sender, event };
}

const badges = { counts: { running: 2, needsInput: 0, unread: 0 }, colors: { running: "#65acee", needsInput: null, unread: null } };

test("メインのウィンドウの本体だけを受け付け、読み込み直しや終了で集計元が消えたら空にする", async () => {
  const appData = tempDir();
  const first = windowFixture();
  const second = windowFixture();
  let main = first;
  const file = path.join(appData, "Pinstage", "BadgeSources", "dev.zanbo.kickoff.json");
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).badges : undefined;
  const link = createPinstageBadges({ platform: "darwin", packaged: true, appData: () => appData, mainContents: () => main.sender, log: assert.fail });
  try {
    link.setStateBadges(second.event, badges);
    link.setStateBadges({ ...first.event, senderFrame: {} } as IpcMainEvent, badges);
    assert.equal(first.events.listenerCount("did-start-navigation"), 0);
    assert.equal(second.events.listenerCount("did-start-navigation"), 0);

    link.setStateBadges(first.event, badges);
    await until(() => read()?.length === 1);
    first.events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
    assert.equal(read().length, 1);
    first.events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    await until(() => read()?.length === 0);
    link.setStateBadges(first.event, badges);
    await until(() => read()?.length === 1);

    main = second;
    link.setStateBadges(second.event, { ...badges, counts: { ...badges.counts, running: 4 } });
    first.events.emit("destroyed");
    await until(() => read()?.[0]?.count === 4);
    second.events.emit("render-process-gone");
    await until(() => read()?.length === 0);
  } finally {
    await link.close();
  }
  assert.equal(fs.existsSync(file), false);
});

test("開発版と macOS 以外では、その場所を調べることも書き出すこともしない", async () => {
  const main = windowFixture();
  for (const [platform, packaged] of [["darwin", false], ["linux", true], ["win32", true]] as const) {
    const link = createPinstageBadges({ platform, packaged, appData: assert.fail, mainContents: assert.fail, log: assert.fail });
    link.setStateBadges(main.event, badges);
    await link.close();
  }
});
