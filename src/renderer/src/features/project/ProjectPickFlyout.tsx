import { Check, Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "@shared/types";
import { isComposing } from "@/lib/keys";
import { MenuFlyout } from "@/ui/MenuFlyout";
import { sidebarOrder } from "./projectOrder";
import { useProjects } from "@/stores/projects";

/**
 * メニューの項目の横に開く、プロジェクトを選ぶ一覧:
 * 上に「プロジェクトを検索または作成」の欄、その下に「新規プロジェクト」、区切り線、プロジェクトの一覧（サイドバーの並び。
 * いまのプロジェクトにチェック。しまったものは出さない）。Enter で絞り込んだ先頭を選び、合うものがなければ書いた名前で新しく作る。
 * 置き場所・↑↓・← で戻るは MenuFlyout
 */
export function ProjectPickFlyout({
  anchor,
  current,
  onPick,
  onCreate,
  onBack,
}: {
  /** 開いた項目（この横に出す。右に入らなければ左） */
  anchor: HTMLElement;
  /** いまのプロジェクト（チェックを付け、選んでも何もしない） */
  current: number;
  onPick: (project: Project) => void;
  /** 新しいプロジェクトを作る（検索欄に書いた名前を渡す） */
  onCreate: (name: string) => void;
  /** ← で一覧を閉じて項目に戻る */
  onBack: () => void;
}) {
  const { projects } = useProjects();
  const [query, setQuery] = useState("");

  const words = query.trim().toLowerCase();
  const shown = sidebarOrder(projects).filter((p) => !words || p.name.toLowerCase().includes(words));
  const pick = (project: Project) => (project.id === current ? onBack() : onPick(project));

  return (
    <MenuFlyout anchor={anchor} label="移動先のプロジェクト" className="project-pick" onBack={onBack}>
      <input
        className="project-pick-search"
        type="text"
        value={query}
        autoFocus
        placeholder="プロジェクトを検索または作成"
        aria-label="プロジェクトを検索または作成"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || isComposing(e)) return;
          e.preventDefault();
          if (shown[0]) pick(shown[0]);
          else if (words) onCreate(query.trim());
        }}
      />
      <button role="menuitem" onClick={() => onCreate(query.trim())}>
        <Plus size={14} aria-hidden /> {words && shown.length === 0 ? `「${query.trim()}」を新規プロジェクトとして作成` : "新規プロジェクト"}
      </button>
      <div className="menu-separator" role="separator" />
      <div className="project-pick-list">
        {shown.length === 0 && <div className="menu-label">合うプロジェクトはありません</div>}
        {shown.map((p) => (
          <button key={p.id} role="menuitemradio" aria-checked={p.id === current} onClick={() => pick(p)}>
            <span className="project-switch-item">{p.name}</span>
            {p.id === current && <Check size={14} className="project-pick-check" aria-hidden />}
          </button>
        ))}
      </div>
    </MenuFlyout>
  );
}
