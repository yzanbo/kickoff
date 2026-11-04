import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanUsage } from "@shared/types";
import { accountLine, planLabel, planName, usageLevel, usageWindowLabel, weeklyModel } from "./usage";

test("usageLevel: 70% から注意、90% から警告（まだ届いていない 0% は通常）", () => {
  assert.equal(usageLevel(0), "normal");
  assert.equal(usageLevel(69.9), "normal");
  assert.equal(usageLevel(70), "warning");
  assert.equal(usageLevel(89), "warning");
  assert.equal(usageLevel(90), "critical");
  assert.equal(usageLevel(120), "critical");
});

test("planLabel / planName: 知っているプランは決まった表記、知らないものは先頭だけ大文字。プランが分からなければ null", () => {
  assert.equal(planLabel("max"), "Max");
  assert.equal(planLabel("TEAM"), "Team");
  assert.equal(planLabel("ultra"), "Ultra");
  assert.equal(planName({ provider_label: "Claude", plan: "max" } as PlanUsage), "Claude Max");
  assert.equal(planName({ provider_label: "Claude", plan: "" } as PlanUsage), null);
  assert.equal(planName(undefined), null);
});

test("accountLine: アカウントとプランを「 ・ 」でつなぐ。片方だけならそれだけ、どちらもなければ空", () => {
  assert.equal(accountLine({ account: "you@example.com", plan: "max" }), "you@example.com ・ Max プラン");
  assert.equal(accountLine({ account: "you@example.com" }), "you@example.com");
  assert.equal(accountLine({ plan: "pro" }), "Pro プラン");
  assert.equal(accountLine({}), "");
});

test("weeklyModel: モデル別の週枠の見出しからモデル名を取る", () => {
  assert.equal(weeklyModel("週（Fable）"), "Fable");
  assert.equal(weeklyModel("週"), undefined);
  assert.equal(weeklyModel("5 時間"), undefined);
});

test("usageWindowLabel: モデル別の週枠は「週 · Fable」（1 行表示ではモデル名だけ）。ほかはそのまま", () => {
  assert.equal(usageWindowLabel({ label: "週（Fable）" }), "週 · Fable");
  assert.equal(usageWindowLabel({ label: "週（Fable）" }, true), "Fable");
  assert.equal(usageWindowLabel({ label: "週" }), "週");
  assert.equal(usageWindowLabel({ label: "5時間" }, true), "5時間");
});
