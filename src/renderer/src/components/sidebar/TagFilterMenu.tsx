import { CircleDashed, Layers, Tag, Tags } from "lucide-react";
import { UNTAGGED } from "../../../../core/projectTags";
import { tagLabel, useProjectTagFilter } from "../../projectTagFilter";
import { HeadMenu } from "./HeadMenu";

/** ボタンの下の段に出すタグ名の長さ（長いタグでボタンの幅が広がりすぎないよう、ここで切る） */
const SHORT = 4;
const short = (tag: string) => {
  const label = tagLabel(tag);
  return label.length > SHORT ? `${label.slice(0, SHORT)}…` : label;
};

/**
 * 見出しの「プロジェクト」の行の「タグ」: タグでプロジェクトを絞り込む（複数選べ、選んだタグのどれかが付いているものを出す。「タグなし」も選べる）。
 * 下の段はいまの値（すべて / タグ名 / n 個）。絞り込んでいる間はアクセントの色にする。
 * 値はサイドバー・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替えで共通（useProjectTagFilter）
 */
export function TagFilterMenu() {
  const filter = useProjectTagFilter();
  const { tags, selected, active } = filter;
  const value = !active ? "すべて" : selected.length === 1 ? short(selected[0]) : `${selected.length} 個`;
  const choices = [...tags, UNTAGGED];
  const check = { role: "menuitemcheckbox" as const };
  return (
    <HeadMenu
      id="tags"
      icon={active ? Tag : Tags}
      label="タグ"
      value={value}
      values={["すべて", ...choices.map(short), `${choices.length} 個`]}
      title={active ? `タグで絞り込み中: ${selected.map(tagLabel).join("、")}` : "タグでプロジェクトを絞り込む（プロジェクトの右クリック・編集でタグを付けられます）"}
      highlight={active}
      sections={[
        { items: [{ role: "menuitemradio", key: "all", icon: Layers, label: "すべて（絞り込まない）", checked: !active, onSelect: filter.clear }] },
        {
          label: tags.length > 0 ? "タグ（どれかが付いているもの）" : "タグはまだありません",
          items: [
            ...tags.map((tag) => ({ ...check, key: `tag:${tag}`, icon: Tag, label: tag, checked: selected.includes(tag), onSelect: () => filter.toggle(tag) })),
            { ...check, key: "untagged", icon: CircleDashed, label: "タグなし", checked: selected.includes(UNTAGGED), onSelect: () => filter.toggle(UNTAGGED) },
          ],
        },
      ]}
    />
  );
}
