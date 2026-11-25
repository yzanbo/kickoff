import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { Settings } from "lucide-react";
import { swapContributions } from "@/foundation/ui/points";
import { projectSettingsSections, settingsItems, settingsItemsOf, settingsSections, settingsSectionsOf, type SettingsSectionDef } from "./points";

const Empty = () => null;
const section = (id: string, scope: SettingsSectionDef["scope"], order: number, common?: boolean) =>
  settingsSections.item({ id, scope, label: id, icon: Settings, order, Component: Empty, ...(common ? { common } : {}) });

test("設定の節は scope ごとに order の順、欄は入れる節ごとに order の順に並ぶ", () => {
  onTestFinished(
    swapContributions([
      section("ai", "app", 20),
      section("general", "app", 10),
      section("general", "project", 10),
      settingsItems.item({ id: "b", section: "general", order: 2, Component: Empty }),
      settingsItems.item({ id: "a", section: "general", order: 1, Component: Empty }),
      settingsItems.item({ id: "c", section: "ai", order: 0, Component: Empty }),
    ]),
  );
  assert.deepEqual(settingsSectionsOf("app").map((s) => s.id), ["general", "ai"]);
  assert.deepEqual(settingsSectionsOf("project").map((s) => s.id), ["general"]);
  assert.deepEqual(settingsItemsOf("general").map((i) => i.id), ["a", "b"]);
});

test("プロジェクトの設定の節: ふつうのプロジェクトは全部、共通は common を付けた節だけ", () => {
  onTestFinished(swapContributions([section("basic", "project", 10, true), section("github", "project", 40), section("ai", "project", 30, true), section("danger", "project", 90), section("ai", "app", 20)]));
  assert.deepEqual(projectSettingsSections(false).map((s) => s.id), ["basic", "ai", "github", "danger"]);
  assert.deepEqual(projectSettingsSections(true).map((s) => s.id), ["basic", "ai"]);
});

test("同じ scope に同じ名前の節を 2 つ入れると断る", () => {
  assert.throws(() => onTestFinished(swapContributions([section("ai", "app", 1), section("ai", "app", 2)])), /同じ key「app:ai」/);
});
