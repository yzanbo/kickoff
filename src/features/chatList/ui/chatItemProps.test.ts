import assert from "node:assert/strict";
import type { KeyboardEvent, MouseEvent } from "react";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { chatItemProps, type ChatItemOptions } from "./chatItemProps";

/** 呼ばれた操作を順に記録する */
function setup(extra: Partial<ChatItemOptions> = {}) {
  const calls: string[] = [];
  const props = chatItemProps(makeChat(1, { title: "調べもの" }), {
    open: () => calls.push("open"),
    rename: () => calls.push("rename"),
    menu: (at) => calls.push(`menu ${JSON.stringify(at)}`),
    as: { button: true },
    ...extra,
  });
  return { calls, props };
}
const el = (button = false) => ({ closest: (s: string) => (button && s === "button" ? {} : null) });
const click = (button = false) => {
  const e = { target: el(button), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  return e as unknown as MouseEvent & { defaultPrevented: boolean };
};
const key = (k: string, self = true) => {
  const target = {};
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target, currentTarget: self ? target : {}, preventDefault() {} } as unknown as KeyboardEvent<HTMLElement>;
};

test("chatItemProps: クリックで開き、⌘ / Shift で選んだときと中のボタンを押したときは開かない", () => {
  const { calls, props } = setup({ pick: (e) => (e as unknown as { picked?: boolean }).picked === true });
  props.onClick(click());
  props.onClick(click(true));
  props.onClick(Object.assign(click(), { picked: true }));
  assert.deepEqual(calls, ["open"]);
});

test("chatItemProps: Enter で名前の変更・Space で開く。中の入力欄のキーは見ない", () => {
  const { calls, props } = setup();
  props.onKeyDown(key("Enter"));
  props.onKeyDown(key(" "));
  props.onKeyDown(key("Enter", false));
  assert.deepEqual(calls, ["rename", "open"]);
});

test("chatItemProps: 右クリックは押した位置のメニュー", () => {
  const { calls, props } = setup();
  props.onContextMenu(Object.assign(click(), { clientX: 3, clientY: 4 }));
  assert.deepEqual(calls, [`menu ${JSON.stringify({ x: 3, y: 4 })}`]);
});

test("chatItemProps: ドラッグは渡したときだけ・名前の変更中はしない", () => {
  assert.equal(setup().props.draggable, false);
  assert.equal(setup({ drag: { start: () => {} } }).props.draggable, true);
  assert.equal(setup({ drag: { start: () => {} }, editing: true }).props.draggable, false);
});

test("chatItemProps: リンクの行は押したときの移動を止め、ダブルクリックでも名前を変える。カードはボタンとして読み上げる", () => {
  const link = setup({ as: { link: true } });
  const e = click();
  link.props.onClick(e);
  assert.equal(e.defaultPrevented, true);
  link.props.onDoubleClick?.(click());
  assert.deepEqual(link.calls, ["open", "rename"]);
  assert.equal("role" in link.props, false);
  const card = setup({ as: { button: true, dragHint: "ドラッグでグループへ" } });
  assert.equal(card.props.role, "button");
  assert.equal(card.props["aria-label"], "チャット「調べもの」を開く（ドラッグでグループへ）");
});
