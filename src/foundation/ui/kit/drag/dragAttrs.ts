import type { DropSide } from "@/foundation/ui/lib/moveInList";

/** 入る位置の印（before / after は線、into は中へ入れる枠、end は入りきらない物を入れた ▾ の枠） */
export type DropMark = DropSide | "into" | "end";

/** 並べ替える物に付ける属性（見た目は styles/state.css。ない印は付けない） */
export interface DragAttrs {
  "data-drop"?: DropMark;
  /** 縦の線（横に並んだ物）。入る位置があるときだけ */
  "data-drop-axis"?: "x";
  /** 前の線も ::after に引く（::before をほかの印に使う物）。入る位置があるときだけ */
  "data-drop-line"?: "after";
  "data-drag-source"?: "";
}

export interface DragAttrsOptions {
  /** 動かしている物か（薄くする） */
  source?: boolean;
  /** 物の並ぶ向き（x = 横に並ぶので線は縦。既定 y） */
  axis?: "x" | "y";
  /** 前の線を ::after に引く */
  line?: "after";
}

/** 入る位置 drop（なければ null・undefined・false）と動かしている物かから、並べ替える物の属性を作る */
export function dragAttrs(drop: DropMark | null | undefined | false, { source = false, axis = "y", line }: DragAttrsOptions = {}): DragAttrs {
  return {
    "data-drop": drop || undefined,
    "data-drop-axis": drop && axis === "x" ? "x" : undefined,
    "data-drop-line": drop && line ? line : undefined,
    "data-drag-source": source ? "" : undefined,
  };
}
