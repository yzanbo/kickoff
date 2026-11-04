import { Check, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Project } from "@shared/types";
import { sidebarOrder } from "./projectOrder";
import { useProjects } from "@/stores/projects";

/** 横に開く一覧の幅（位置の計算と CSS で同じ値） */
const FLYOUT_WIDTH = 280;

/**
 * メニューの項目の横に開く、プロジェクトを選ぶ一覧（形）:
 * 上に「プロジェクトを検索または作成」の欄、その下に「新規プロジェクト」、区切り線、プロジェクトの一覧（サイドバーの並び。
 * いまのプロジェクトにチェック。しまったものは出さない）。Enter で絞り込んだ先頭を選び、合うものがなければ書いた名前で新しく作る。
 * メニューの中の要素なので、外側クリックでメニューごと閉じる。↑↓ はこの一覧の中だけで動く（data-menu-scope）
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
  // 位置が決まるまでは見せない（visibility: hidden にすると検索欄にピントを置けないので、透明にする）
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const ref = useRef<HTMLDivElement>(null);
  // 項目の横に置く（右に入らなければメニューの左。下にはみ出すなら上へ寄せる）
  useLayoutEffect(() => {
    const item = anchor.getBoundingClientRect();
    const menu = anchor.closest(".menu")?.getBoundingClientRect() ?? item;
    const height = ref.current?.offsetHeight ?? 0;
    const left = menu.right + 4 + FLYOUT_WIDTH <= window.innerWidth ? menu.right + 4 : Math.max(8, menu.left - 4 - FLYOUT_WIDTH);
    const top = Math.max(8, Math.min(item.top - 6, window.innerHeight - height - 8));
    setStyle({ left, top });
  }, [anchor, query]);

  const words = query.trim().toLowerCase();
  const shown = sidebarOrder(projects).filter((p) => !words || p.name.toLowerCase().includes(words));
  const pick = (project: Project) => (project.id === current ? onBack() : onPick(project));

  return (
    <div
      ref={ref}
      className="menu project-pick"
      style={style}
      role="menu"
      aria-label="移動先のプロジェクト"
      data-menu-scope
      onKeyDown={(e) => {
        // ← は項目の上でだけ（検索欄では文字の間を動く）
        if (e.key === "ArrowLeft" && (e.target as HTMLElement).tagName === "BUTTON") {
          e.preventDefault();
          onBack();
        }
      }}
    >
      <input
        className="project-pick-search"
        type="text"
        value={query}
        autoFocus
        placeholder="プロジェクトを検索または作成"
        aria-label="プロジェクトを検索または作成"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
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
    </div>
  );
}
