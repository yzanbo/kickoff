import { useState, type CSSProperties, type DragEvent } from "react";
import type { Run } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { cx } from "../../cx";
import { startRunDrag } from "../../groups";
import type { useRunRename } from "../../hooks/useRunRename";
import type { SidePanelController } from "../sidePanel/useSidePanel";
import type { BoardEntry } from "./boardColumns";
import { RunCardContent, RunRowContent } from "./RunCard";
import { runCardProps } from "./runCardProps";

/** カードの右クリックメニューの状態（どこに・どのチャットの） */
export type CardMenuAt = { x: number; y: number; run: Run };

/** カードの右クリックメニュー（開いている間はパネルを Esc で閉じない: useSidePanel の holdEsc に isOpen を渡す） */
export function useCardMenu() {
  const [at, setAt] = useState<CardMenuAt | null>(null);
  return { at, isOpen: at !== null, open: (where: { x: number; y: number }, run: Run) => setAt({ ...where, run }), close: () => setAt(null) };
}

interface Options {
  panel: SidePanelController;
  rename: ReturnType<typeof useRunRename>;
  menu: ReturnType<typeof useCardMenu>;
  /** カードを押したとき（パネルで開く。プロジェクトのボードは URL も変える） */
  onOpen: (run: Run) => void;
  /** ドラッグで移せるボード（グループのボード）だけ。hint は読み上げの「（ドラッグで…）」 */
  drag?: { hint: string };
  /** ボードごとのカードのクラス（プロジェクト名つきなど。共通の archived の後・selected / in-tab より前に付く） */
  classFor?: (run: Run) => string | false | undefined;
  style?: (run: Run) => CSSProperties | undefined;
  /** 全プロジェクトのボードでは、カードにプロジェクト名を出す */
  projectName?: (run: Run) => string | undefined;
}

/**
 * ボードのカード（ボードの表示）と行（リストの表示）の描き方。カンバンとグループのボードで共通:
 * クリック・Enter で開く / 右クリックでメニュー / ドラッグで移す（グループのボードだけ）/ 名前をその場で変える。
 * どのボードでも、アーカイブ済みのカードは archived（ArchivedFold の中で薄く出す）、ボードのカードには回答待ちの依頼の数（「回答 n件」）を付ける。
 * パネルで表示中なら selected、タブで開いていれば in-tab
 */
export function useBoardCards({ panel, rename, menu, onOpen, drag, classFor, style, projectName }: Options) {
  const { pendingCount } = useRunStates();
  // ドラッグしている途中のチャット（薄く出す）
  const [dragRun, setDragRun] = useState<number>();
  const cardProps = (run: Run) => ({
    ...runCardProps(run, {
      dragHint: drag?.hint,
      onOpen: () => onOpen(run),
      onMenu: (at) => menu.open(at, run),
      onDragStart: drag
        ? (e: DragEvent) => {
            startRunDrag(e, run.id);
            setDragRun(run.id);
          }
        : undefined,
      onDragEnd: drag ? () => setDragRun(undefined) : undefined,
      editing: Boolean(rename.editorFor(run)),
    }),
    style: style?.(run),
  });
  const cardClass = (run: Run) => cx(run.archived_at && "archived", classFor?.(run), dragRun === run.id && "dragging", panel.isShowing(run.id) && "selected", panel.hasTab(run.id) && "in-tab");
  return {
    cardProps,
    cardClass,
    /** ボードのカード */
    card: ({ run, state }: BoardEntry) => (
      <article key={run.id} className={cx("board-card", cardClass(run))} {...cardProps(run)}>
        <RunCardContent run={run} state={state} projectName={projectName?.(run)} pending={pendingCount(run.id)} rename={rename.editorFor(run)} />
      </article>
    ),
    /** リストの行 */
    row: ({ run, state }: BoardEntry) => (
      <div key={run.id} className={cx("list-row", cardClass(run))} {...cardProps(run)}>
        <RunRowContent run={run} state={state} projectName={projectName?.(run)} rename={rename.editorFor(run)} />
      </div>
    ),
  };
}
