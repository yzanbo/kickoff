// 以前（セクション・タスク・成果物があったころ）に保存した値の読み替え（Node 依存なし）。
// 次の段で DB の変換に移すまで、読み替えはここの純粋関数に集め、読むところ（store/）から呼ぶ。
import { PERMISSION_CHOICES, type AppSettings, type EffortLevel, type PermissionChoice, type ProjectDefaults } from "./types.js";

/** 以前のセクション（DB の runs.phase に残っている値） */
const LEGACY_SECTIONS = ["requirements", "schedule", "implementation", "testing", "deployment"] as const;
type LegacySection = (typeof LEGACY_SECTIONS)[number];

/** 以前の「セクションに合わせる」の権限モード（実装・テストは編集を自動承認、それ以外は毎回確認） */
const LEGACY_SECTION_PERMISSION: Record<LegacySection, PermissionChoice> = {
  requirements: "default",
  schedule: "default",
  implementation: "acceptEdits",
  testing: "acceptEdits",
  deployment: "default",
};

/** 以前の「セクションに合わせる」の推論の深さ */
const LEGACY_SECTION_EFFORT: Record<LegacySection, EffortLevel> = {
  requirements: "high",
  schedule: "medium",
  implementation: "high",
  testing: "high",
  deployment: "medium",
};

/** 知らない値は実装として読む（新しいチャットの phase は 'implementation' で作る） */
function sectionOf(phase: unknown): LegacySection {
  return LEGACY_SECTIONS.find((s) => s === phase) ?? "implementation";
}

/** いまの権限モードの値か（以前の "phase" や知らない値は false） */
export function isPermissionChoice(value: unknown): value is PermissionChoice {
  return PERMISSION_CHOICES.some((p) => p === value);
}

/**
 * チャットの推論の深さと権限モード。permission_mode が以前の "phase"（セクションに合わせる）のチャットは、
 * その行の phase の以前の既定に読み替え、推論の深さが決まっていなければ（null）それもセクションの既定にする。
 * それ以外のチャットの null は「指定しない（モデルの既定）」のまま読む（2026-11-01 からの画面は、
 * 推論の深さと権限モードを両方とも具体的な値で送っていたので、"phase" のチャットだけが以前の既定に頼っている）
 */
export function legacyRunOptions(row: { phase?: unknown; effort: EffortLevel | null; permission_mode: string }): {
  effort: EffortLevel | null;
  permission_mode: PermissionChoice;
} {
  if (isPermissionChoice(row.permission_mode)) return { effort: row.effort, permission_mode: row.permission_mode };
  const section = sectionOf(row.phase);
  return { effort: row.effort ?? LEGACY_SECTION_EFFORT[section], permission_mode: LEGACY_SECTION_PERMISSION[section] };
}

/** アプリの設定（以前の「セクションに合わせる」の権限モードは「毎回確認」として読む） */
export function legacySettings(settings: AppSettings): AppSettings {
  return isPermissionChoice(settings.defaultPermission) ? settings : { ...settings, defaultPermission: "default" };
}

/**
 * プロジェクトの既定。以前の「セクションに合わせる」の権限モード（"phase"）・新しいチャットのセクション（section）・
 * カンバンの列（stage）は捨てて読む（権限モードはアプリの設定に従う）
 */
export function legacyProjectDefaults(stored: ProjectDefaults & { section?: unknown; stage?: unknown }): ProjectDefaults {
  const { section: _section, stage: _stage, permission, ...rest } = stored;
  return isPermissionChoice(permission) ? { ...rest, permission } : rest;
}
