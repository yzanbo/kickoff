import type { ModelOption } from "../../core/types";

/** 一覧での並び順（性能の高い順） */
const FAMILY_ORDER = ["fable", "opus", "sonnet", "haiku"];

export interface ModelGroup {
  family: string;
  items: { value: string; version: string; description: string }[];
}

/** "Opus 5.5" → { family: "Opus", version: "5.5" }。バージョンが整数なら "5.0" と表記する */
export function splitModelLabel(label: string): { family: string; version: string } {
  const m = label.match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
  if (!m) return { family: label, version: "" };
  const version = m[2].includes(".") ? m[2] : `${m[2]}.0`;
  return { family: m[1], version };
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
    .map((g) => ({ ...g, items: g.items.sort((a, b) => Number(b.version) - Number(a.version)) }))
    .sort((a, b) => rank(a.family) - rank(b.family));
}

/** 閉じた状態で見せる名前（"Opus 5.5"） */
export function modelDisplayName(models: ModelOption[], value: string | null): string {
  const m = models.find((x) => x.value === value);
  if (!m) return value ?? "読み込み中…";
  const { family, version } = splitModelLabel(m.label);
  return version ? `${family} ${version}` : family;
}
