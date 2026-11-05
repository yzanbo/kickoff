import { FoldHorizontal, Maximize2, Minimize2, UnfoldHorizontal } from "lucide-react";
import type { HTMLAttributes, RefObject } from "react";
import { IconButton } from "@/ui/IconButton";
import { leavesOf } from "./layout/paneTree";
import { SURFACES } from "./surfaces";
import { TabArchiveToggle } from "./tabs/TabArchiveToggle";
import { TabGroupingButton } from "./tabs/TabGroupingButton";
import { TabKindsButton } from "./tabs/TabKindsButton";
import type { PanelController } from "./usePanel";

/** 欄の殻（大きさを持つ側）から Panel に渡すもの。大きさの変え方は欄ごとに違うので、殻に残す */
export interface PanelFrame {
  /** 大きさを測る欄（パネルの aside に付ける。ボードの右のパネルの幅のドラッグ） */
  paneRef?: RefObject<HTMLElement | null>;
  /** 左端の幅のつまみ（ボードの右のパネル） */
  resizeHandle?: HTMLAttributes<HTMLDivElement>;
  /** 大きくする切り替えの状態（欄の決まり SURFACES の maximize で出す。disabled: 狭くて元の大きさに戻せない） */
  maximize?: { on: boolean; disabled?: boolean; toggle: () => void };
}

/**
 * タブの列の左の道具（左上のペインにだけ置く）: 閉じる（欄の決まりで先頭か最後。チャット欄は右上のレイアウトの開閉で閉じるので出さない）、
 * 表示するタブの種類（ほかの道具の前提になるので、閉じるのすぐ右。チャット欄では左端）、チャットのタブのまとめ方（まとめない・グループ別・作業場所別）、
 * アーカイブ済みを出すか（サイドバーと共通。まとめ方・アーカイブ済みはチャットのタブにだけ効くので、チャットを隠している欄では出さない）、
 * 大きくする切り替え（横幅いっぱい ⇔ 元の幅 / 最大化 ⇔ 元の高さ）
 */
export function PanelTools({ panel, frame }: { panel: PanelController; frame?: PanelFrame }) {
  const { closeButton, maximize, maximizeLabels, fixedKinds, heading } = SURFACES[panel.surface];
  // 分けているときは、欄の名前の札をアイコンだけにする（左上のペインのタブの入る幅を残す）
  const split = leavesOf(panel.layout.root).length > 1;
  const close = closeButton && (
    <IconButton type="button" icon={closeButton.icon} size={15} className="panel-control" label={closeButton.label} keys={closeButton.keys} onClick={panel.close} />
  );
  const state = frame?.maximize;
  return (
    <div className="panel-controls">
      {heading && (
        <span className="panel-heading" title={heading.title}>
          <heading.icon size={13} />
          {!split && <span>{heading.label}</span>}
        </span>
      )}
      {closeButton?.at === "start" && close}
      {!fixedKinds && <TabKindsButton panel={panel} />}
      {panel.kinds.has("chat") && <TabGroupingButton surface={panel.surface} />}
      {panel.kinds.has("chat") && <TabArchiveToggle />}
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
      {closeButton?.at === "end" && close}
    </div>
  );
}
