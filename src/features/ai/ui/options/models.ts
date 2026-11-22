import type { ModelOption } from "@shared/ai/types";
import { EFFORT_LEVELS, PERMISSION_MODES, type EffortLevel, type PermissionMode } from "@shared/settings/types";

/** 一覧での並び順（性能の高い順） */
const FAMILY_ORDER = ["fable", "opus", "sonnet", "haiku", "astra", "sol", "terra", "luna"];

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
