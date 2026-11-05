import { AppWindow, FoldHorizontal, Maximize2, Minimize2, UnfoldHorizontal } from "lucide-react";
import type { HTMLAttributes, RefObject } from "react";
import { IconButton } from "@/ui/IconButton";
import { focusedPane } from "./layout/paneTree";
import { canPopOut, popOutTab } from "./tabs/popOutTab";
import { SURFACES } from "./surfaces";
import { PanelViewButton, type PanelViewMenu } from "./tabs/PanelViewMenu";
import type { PanelController } from "./usePanel";

/** 欄の殻（大きさを持つ側）から Panel に渡すもの。大きさの変え方は欄ごとに違うので、殻に残す */
export interface PanelFrame {
  /** 大きさを測る欄（パネルの aside に付ける。ボードの右のパネルの幅のドラッグ） */
  paneRef?: RefObject<HTMLElement | null>;
  /** 左端の幅のつまみ（ボードの右のパネル） */
  resizeHandle?: HTMLAttributes<HTMLDivElement>;
  /** 大きくする切り替えの状態（欄の決まり SURFACES の maximize で出す。disabled: 狭くて元の大きさに戻せない） */
  maximize?: { on: boolean; disabled?: boolean; toggle: () => void };
  /** 欄が画面そのもの（ボードと分けた「チャット」タブ）で、閉じるボタンを出さない */
  fixed?: boolean;
}

/**
 * タブの列の左の道具（左上のペインにだけ置く）: 左から、閉じる（欄の決まりで先頭か最後。チャット欄は右上のレイアウトの開閉で
 * 閉じるので出さない）・大きくする切り替え（横幅いっぱい ⇔ 元の幅 / 最大化 ⇔ 元の高さ）・「表示」のメニューのボタン（表示するタブ・チャットのまとめ方・
 * アーカイブ済み・ボードツールバーの置き方。usePanelViewMenu。タブの列の何もないところの右クリックでも同じメニュー）。
 * よく使い、状態が見た目で分かってほしい閉じる・大きくするはアイコンのまま、たまにしか変えない表示の選び方は 1 つのメニューにまとめる
 */
export function PanelTools({ panel, frame, view }: { panel: PanelController; frame?: PanelFrame; view: PanelViewMenu }) {
  const { closeButton, maximize, maximizeLabels } = SURFACES[panel.surface];
  const close = closeButton && !frame?.fixed && (
    <IconButton type="button" icon={closeButton.icon} size={15} className="panel-control" label={closeButton.label} keys={closeButton.keys} onClick={panel.close} />
  );
  const state = frame?.maximize;
  // ピントのあるペインで表示しているタブ（別ウィンドウで開けるものなら、ボタンを出す）
  const shown = panel.shownTabOf(focusedPane(panel.layout));
  const poppable = shown !== null && canPopOut(panel.tabs.find((t) => t.key === shown));
  return (
    <div className="panel-controls">
      {closeButton?.at === "start" && close}
      {maximize === "width" && state && (
        // 横にだけ広がるので、横向きの矢印。いつも出し、見た目どおりに切り替える（狭くてボードを覆っているときは「元の幅に戻す」で、
        // ボードが残る幅まで縮める。サイドバー・チャット欄を開いて狭くなっても隠さない）
        <IconButton
          type="button"
          icon={state.on ? FoldHorizontal : UnfoldHorizontal}
          size={15}
          className="panel-control"
          label={state.on ? (maximizeLabels?.on ?? "元の幅に戻す") : (maximizeLabels?.off ?? "横幅いっぱいに広げる")}
          title={
            state.on
              ? `${maximizeLabels?.on ?? "元の幅に戻す"}${state.disabled ? "（画面が狭いため、元の幅に戻せません）" : ""}`
              : (maximizeLabels?.off ?? "横幅いっぱいに広げる")
          }
          aria-pressed={state.on}
          disabled={state.disabled}
          onClick={state.toggle}
        />
      )}
      {maximize === "height" && state && (
        <IconButton
          type="button"
          icon={state.on ? Minimize2 : Maximize2}
          className="panel-control"
          label={state.on ? "元の高さに戻す" : "フッターを最大化"}
          aria-pressed={state.on}
          onClick={state.toggle}
        />
      )}
      {poppable && (
        <IconButton
          type="button"
          icon={AppWindow}
          size={15}
          className="panel-control"
          label="表示しているタブを別ウィンドウで開く"
          onClick={() => popOutTab(panel, shown)}
        />
      )}
      <PanelViewButton view={view} />
      {closeButton?.at === "end" && close}
    </div>
  );
}
