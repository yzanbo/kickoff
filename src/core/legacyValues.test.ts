import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyProjectDefaults, legacyRunOptions, legacySettings } from "./legacyValues.js";
import { DEFAULT_SETTINGS, type AppSettings } from "./types.js";

test("チャットの権限モードが以前の phase なら、そのセクションの以前の既定に読み替える（推論の深さも）", () => {
  assert.deepEqual(legacyRunOptions({ phase: "requirements", effort: null, permission_mode: "phase" }), { effort: "high", permission_mode: "default" });
  assert.deepEqual(legacyRunOptions({ phase: "schedule", effort: null, permission_mode: "phase" }), { effort: "medium", permission_mode: "default" });
  assert.deepEqual(legacyRunOptions({ phase: "implementation", effort: null, permission_mode: "phase" }), { effort: "high", permission_mode: "acceptEdits" });
  assert.deepEqual(legacyRunOptions({ phase: "testing", effort: null, permission_mode: "phase" }), { effort: "high", permission_mode: "acceptEdits" });
  assert.deepEqual(legacyRunOptions({ phase: "deployment", effort: null, permission_mode: "phase" }), { effort: "medium", permission_mode: "default" });
  // 選んであった推論の深さはそのまま
  assert.deepEqual(legacyRunOptions({ phase: "deployment", effort: "low", permission_mode: "phase" }), { effort: "low", permission_mode: "default" });
  // 知らないセクションは実装として読む
  assert.deepEqual(legacyRunOptions({ phase: "", effort: null, permission_mode: "phase" }), { effort: "high", permission_mode: "acceptEdits" });
});

test("権限モードを選んであるチャットは、そのまま読む（推論の深さの null は「指定しない」）", () => {
  assert.deepEqual(legacyRunOptions({ phase: "requirements", effort: null, permission_mode: "plan" }), { effort: null, permission_mode: "plan" });
  assert.deepEqual(legacyRunOptions({ phase: "implementation", effort: "max", permission_mode: "auto" }), { effort: "max", permission_mode: "auto" });
});

test("アプリの設定の以前の「セクションに合わせる」は「毎回確認」として読む", () => {
  const legacy = { ...DEFAULT_SETTINGS, defaultPermission: "phase" } as unknown as AppSettings;
  assert.equal(legacySettings(legacy).defaultPermission, "default");
  assert.equal(legacySettings({ ...DEFAULT_SETTINGS, defaultPermission: "acceptEdits" }).defaultPermission, "acceptEdits");
});

test("プロジェクトの既定は、以前のセクション・カンバンの列・「セクションに合わせる」の権限モードを捨てて読む", () => {
  const stored = { model: "opus", effort: null, permission: "phase", section: "testing", stage: "todo", fastMode: true };
  assert.deepEqual(legacyProjectDefaults(stored as never), { model: "opus", effort: null, fastMode: true });
  assert.deepEqual(legacyProjectDefaults({ permission: "plan" }), { permission: "plan" });
});
