import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { test } from "vitest";
import { createRendererLifetimeWatcher } from "./rendererLifetime";

test("画面が移る・落ちる・消えるときに通知し、ハッシュ移動や子フレームの遷移では通知しない", () => {
  const events = new EventEmitter();
  const contents = events as unknown as WebContents;
  const gone: WebContents[] = [];
  const watch = createRendererLifetimeWatcher((owner) => gone.push(owner));
  watch(contents);
  watch(contents);

  events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
  events.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
  assert.deepEqual(gone, []);

  events.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
  events.emit("render-process-gone");
  events.emit("destroyed");
  assert.deepEqual(gone, [contents, contents, contents]);
});
