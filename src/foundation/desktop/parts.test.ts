// メインの部品を合わせる: 同じキーが 2 つなら投げ、メニューは並び順につなぐ
import assert from "node:assert/strict";
import { test } from "vitest";
import { mergeParts, type DesktopPart } from "./parts";

const handler = () => {};

test("mergeParts: IPC のまとまり・引数の形・RPC を合わせ、メニューの項目は並び順につなぐ", () => {
  const a: DesktopPart = { name: "a", ipc: { dialog: { pickReferences: handler } } as unknown as DesktopPart["ipc"], menu: [{ label: "1" }] };
  const b: DesktopPart = { name: "b", ipc: { loginItem: { get: handler } } as unknown as DesktopPart["ipc"], hostMethods: { "browser.tabs": handler } as unknown as DesktopPart["hostMethods"], menu: [{ label: "2" }, { label: "3" }] };
  const merged = mergeParts([a, b]);
  assert.deepEqual(Object.keys(merged.ipc), ["dialog", "loginItem"]);
  assert.deepEqual(Object.keys(merged.hostMethods), ["browser.tabs"]);
  assert.deepEqual(merged.menu.map((m) => m.label), ["1", "2", "3"]);
});

test("mergeParts: 同じまとまり・同じ RPC の名前を 2 つの部品が出していれば投げる", () => {
  const a: DesktopPart = { name: "a", ipc: { dialog: { pickReferences: handler } } as unknown as DesktopPart["ipc"] };
  const b: DesktopPart = { name: "b", ipc: { dialog: { pickReferences: handler } } as unknown as DesktopPart["ipc"] };
  assert.throws(() => mergeParts([a, b]), /IPC のまとまり の dialog を a と b の 2 つが出しています/);
  const c: DesktopPart = { name: "c", hostMethods: { x: handler } as unknown as DesktopPart["hostMethods"] };
  const d: DesktopPart = { name: "d", hostMethods: { x: handler } as unknown as DesktopPart["hostMethods"] };
  assert.throws(() => mergeParts([c, d]), /コアから呼ばれる口 の x を c と d/);
});
