import { EFFORT_LEVELS, PERMISSION_MODES, type ChatOptions, type EffortLevel, type ModelOption, type PermissionMode, type ProviderId } from "@shared/types";

/** 一覧での並び順（性能の高い順） */
const FAMILY_ORDER = ["fable", "opus", "sonnet", "haiku", "astra", "terra", "sol", "luna"];

export interface ModelGroup {
  family: string;
  items: { value: string; version: string; description: string }[];
}

/** "Opus 5.5"・"GPT-6.1-Sol" を系統と世代に分ける。整数の世代は "5.0" のように表記する */
export function splitModelLabel(label: string): { family: string; version: string } {
  const gpt = label.match(/^GPT[-\s]+(\d+(?:\.\d+)*)[-\s]+(Astra|Terra|Sol|Luna)$/i);
  const m = label.match(/^(.*?)\s+(\d+(?:\.\d+)*)$/);
  const family = gpt ? gpt[2][0].toUpperCase() + gpt[2].slice(1).toLowerCase() : m?.[1];
  const rawVersion = gpt?.[1] ?? m?.[2];
  if (!family || !rawVersion) return { family: label, version: "" };
  const version = rawVersion.includes(".") ? rawVersion : `${rawVersion}.0`;
  return { family, version };
}

/** モデルをファミリーごとにまとめ、新しいバージョンから並べる */
export function groupModels(models: ModelOption[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const m of models) {
    const { family, version } = splitModelLabel(m.label);
    const group = groups.get(family) ?? { family, items: [] };
    // 同じバージョンが別名（opus と claude-opus-5-5 など）で重複したら最初のものを使う
    if (!group.items.some((i) => i.version === version)) group.items.push({ value: m.value, version, description: m.description });
    groups.set(family, group);
  }
  const rank = (family: string) => {
    const i = FAMILY_ORDER.indexOf(family.toLowerCase());
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => b.version.localeCompare(a.version, "en", { numeric: true })) }))
    .sort((a, b) => rank(a.family) - rank(b.family));
}

/** 閉じた状態で見せる名前（"Opus 5.5"） */
export function modelDisplayName(models: ModelOption[], value: string | null): string {
  const m = models.find((x) => x.value === value);
  if (!m) return value ?? (models.length > 0 ? "既定" : "読み込み中…");
  const { family, version } = splitModelLabel(m.label);
  return version ? `${family} ${version}` : family;
}

/**
 * 一覧にないモデル（ほかの AI のモデル・その AI の既定 = null）を、その AI の既定のモデル（一覧の `is_default`。なければ null）に直す
 * （メモの仕様書「0028」の 9 節）。一覧が届くまでと、Claude Code（一覧の外の名前も受け付ける）は直さない
 */
export function fallbackModel(models: ModelOption[], model: string | null, provider: ProviderId): string | null {
  if (provider === "claude" || models.length === 0 || models.some((m) => m.value === model)) return model;
  return models.find((m) => m.is_default)?.value ?? null;
}

/** そのモデルで選べる推論の深さ（モデルが分からなければすべて） */
export function effortsFor(model: ModelOption | undefined): readonly EffortLevel[] {
  return model?.efforts ?? EFFORT_LEVELS;
}

/** 対応の通知がない場合を、非対応や対応済みと混同しない。 */
export function fastSupportOf(model: ModelOption | undefined, loading: boolean): "supported" | "unsupported" | "loading" | "unknown" {
  if (model?.supports_fast_mode === true) return "supported";
  if (model?.supports_fast_mode === false) return "unsupported";
  return loading ? "loading" : "unknown";
}

/** そのモデルで選べる権限モード（Auto mode は対応しているモデルだけ。モデルが分からなければすべて） */
export function permissionChoices(model: ModelOption | undefined): PermissionMode[] {
  return PERMISSION_MODES.filter((p) => p !== "auto" || !model || model.supports_auto_mode);
}

/**
 * 新しいチャットの選択に既定（設定とプロジェクトの既定を重ねたもの）を当てる。
 * keepModel: 既定が届く前に自分で選んだモデルは残す（開いて初めて当てるとき）。プロジェクトを替えたときは、そのプロジェクトの既定にすべて当て直す
 */
export function withDefaults(current: ChatOptions, defaults: ChatOptions, keepModel: boolean): ChatOptions {
  return { ...defaults, model: keepModel ? (current.model ?? defaults.model) : defaults.model };
}
