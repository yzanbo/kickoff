// 流れの中のサブエージェントのカードの、見出しを押したときの開き方
import type { KeyboardEvent, MouseEvent } from "react";
import type { OpenPlace } from "@/features/chat/ui";

/** 字下げをやめる深さ（これより深い入れ子は字下げせず、見出しに外側からの道筋を添える） */
const FLAT_DEPTH = 3;

/**
 * カードの見出しを押したときの開き方と出し分け（純粋）: head = 設定（SUBAGENT_OPEN_IN）の場所に置ければそこ、置けなければ流れの中での開閉
 * （設定が別ウィンドウで別ウィンドウを開けないときも流れの中）/ sideLink = 「右の欄で開く」を出すか（右の欄を置けて、押しても右の欄に開かないとき）/
 * flat = 字下げをやめて道筋を添えるか
 */
export function subagentOpenModel({ openIn, canSide, canWindow, depth }: { openIn: OpenPlace; canSide: boolean; canWindow: boolean; depth: number }) {
  const head: OpenPlace = openIn === "window" && canWindow ? "window" : openIn === "side" && canSide ? "side" : "inline";
  return { head, sideLink: canSide && head !== "side", flat: depth >= FLAT_DEPTH };
}

/** 押したのが中のボタン・リンク・入力欄か、選び終えた文の上か（それぞれに任せ、カードは開かない） */
function leftToInside(e: MouseEvent<HTMLElement>): boolean {
  if ((e.target as Element).closest("button, a, input, textarea, select, label")) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.anchorNode && e.currentTarget.contains(selection.anchorNode));
}

/** カードの上の 2 行を押したとき（onTopClick）と、見出しのキー（Enter・Space。見出しそのものにピントがあるときだけ）で open を呼ぶ */
export function subagentOpenHandlers(open: () => void) {
  return {
    onTopClick: (e: MouseEvent<HTMLElement>) => {
      if (!leftToInside(e)) open();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      open();
    },
  };
}
