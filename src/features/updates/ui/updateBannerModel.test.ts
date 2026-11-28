import assert from "node:assert/strict";
import { test } from "vitest";
import type { UpdateState } from "@shared/updates/types";
import { bannerOf, showsBadge } from "./updateBannerModel";

const states: UpdateState[] = [
  { kind: "idle" },
  { kind: "checking", previous: { kind: "idle" } },
  { kind: "latest" },
  { kind: "unreachable" },
  { kind: "downloading", version: "0.1.0-beta.2", percent: 42.7 },
  { kind: "ready", version: "0.1.0-beta.2" },
  { kind: "waiting", version: "0.1.0-beta.2", running: 2 },
  { kind: "installing", version: "0.1.0-beta.2" },
  { kind: "failed", version: "0.1.0-beta.2" },
];

test("bannerOf: 様子ごとの帯の文とボタン", () => {
  const view = states.map((s) => {
    const b = bannerOf(s, "0.1.0-beta.1");
    return b && `${b.tone} | ${b.text} | ${b.percent ?? "-"} | ${b.actions.join(",")}`;
  });
  assert.deepEqual(view, [
    null,
    "info | 新しい版を確かめています… | - | ",
    "info | 最新の版です（0.1.0-beta.1） | - | ",
    "error | 新しい版を確かめられませんでした。ネットワークを確かめて、もう一度試してください | - | ",
    "info | 新しい版 0.1.0-beta.2 をダウンロードしています（42%） | 42.7 | ",
    "info | 新しい版 0.1.0-beta.2 があります | - | install,skip,notes",
    "info | 作業が終わったら開き直します（作業中のチャット 2 件） | - | cancel",
    "info | 新しい版 0.1.0-beta.2 を入れて開き直しています… | - | ",
    "error | 新しい版 0.1.0-beta.2 を入れられませんでした。ダウンロードのページから入れ直してください | - | releases,skip",
  ]);
});

test("showsBadge: 入れるか飛ばすまで印を残し、ダウンロード中・確かめた結果だけでは付けない", () => {
  assert.deepEqual(states.filter(showsBadge).map((s) => s.kind), ["ready", "waiting", "installing", "failed"]);
});
