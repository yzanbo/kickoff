import assert from "node:assert/strict";
import { test } from "vitest";
import type { TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import { createScreenActions, type ScreenDeps } from "./screenActions";

/** 偽の流れのスクロール（付いていくかだけを覚える） */
function fakeScroll(): TimelineScroll & { followed: () => boolean } {
  let following = true;
  return {
    ref: { current: null },
    inner: { current: null },
    following: () => following,
    followed: () => following,
    follow: () => void (following = true),
    release: () => void (following = false),
    holdUp: () => {},
    held: () => false,
    settle: () => {},
  };
}

function setup(over: Partial<ScreenDeps> = {}) {
  const calls: string[] = [];
  const scroll = fakeScroll();
  const actions = createScreenActions({
    chatId: 1,
    canOpenSide: true,
    scroll,
    composer: () => ({ fill: (text) => void calls.push(`fill:${text}`), insert: () => {}, focus: () => void calls.push("focus") }),
    side: () => ({ uncover: () => void calls.push("uncover") }),
    beforeReveal: () => calls.push("beforeReveal"),
    ...over,
  });
  return { actions, calls, scroll };
}

test("描いた値を入れ直しても口の関数は同じ物で、いつも最後に入れた値で動く", () => {
  const { actions } = setup();
  const { timeline, subagents, activity, rewind, composer } = actions;
  const stepPrompt = timeline.stepPrompt;
  const seen: string[] = [];
  const window = (name: string) => ({ revealEvent: async () => {}, stepPrompt: (dir: -1 | 1) => void seen.push(`${name}:${dir}`), showAfter: () => {} });
  actions.setWindow(window("a"));
  timeline.stepPrompt(1);
  actions.setWindow(window("b"));
  timeline.stepPrompt(-1);
  assert.deepEqual(seen, ["a:1", "b:-1"]);
  assert.equal(timeline.stepPrompt, stepPrompt);
  assert.equal(actions.timeline, timeline);
  assert.equal(actions.subagents, subagents);
  assert.equal(actions.activity, activity);
  assert.equal(actions.rewind, rewind);
  assert.equal(actions.composer, composer);
});

test("動きで見るは押すたびに強調をやり直し、絞り込みを選び直したら強調をやめる", () => {
  const { actions, calls } = setup();
  const { activity } = actions;
  activity.focus("a");
  assert.equal(activity.showing.get(), "activity");
  assert.deepEqual(activity.focused.get(), { key: "a", nonce: 1 });
  activity.focus("a");
  assert.equal(activity.focused.get()?.nonce, 2);
  // 右の欄が覆っていれば並べる形に戻し、画面の外のピルの列なら画面を見せる
  assert.deepEqual(calls, ["beforeReveal", "uncover", "beforeReveal", "uncover"]);
  activity.show("activity", { kind: "main" });
  assert.deepEqual(activity.filter.get(), { kind: "main" });
  assert.equal(activity.focused.get(), null);
  activity.show("conversation");
  assert.equal(activity.showing.get(), "conversation");
  assert.deepEqual(activity.filter.get(), { kind: "main" });
});

test("会話のその記録へ戻るは会話を見せ、記録がなければ付いていきをやめない", () => {
  const { actions, scroll } = setup();
  actions.activity.show("activity");
  actions.activity.revealInConversation(undefined, null);
  assert.equal(actions.activity.showing.get(), "conversation");
  assert.equal(scroll.followed(), true);
});

test("「伝える」の欄を閉じると開いている一覧から外れ、入力欄の口は入力欄に渡す", () => {
  const { actions, calls } = setup();
  const before = actions.subagents.tellOpen.get();
  actions.subagents.closeTell("x");
  assert.equal(actions.subagents.tellOpen.get(), before);
  actions.composer.fill("こんにちは");
  actions.composer.focus();
  assert.deepEqual(calls, ["fill:こんにちは", "focus"]);
});
