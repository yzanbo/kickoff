import { GitBranch, MessageSquare, PanelTop } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { Segmented } from "@/ui/Segmented";
import { useChatPane, useChatPaneState, type ChatShowing } from "./chatPaneContext";
import { useChatHeaderItems } from "./ChatDisplayMenu";
import { TextWidthToggle } from "./TextWidthToggle";

/**
 * チャットの見出しの行の右の道具: 会話 / 動きの切り替え（同じタブの中で見え方を変える。動きの間は、会話だけに効く道具を出さない）・文の幅（パネルの大きさは変えず、発言の流れとチャット欄の幅の上限を外す。パネルが狭くて変わらないときは押せない）・
 * 上に置く指示の帯の表示・非表示（出しているかは色で示す。どのチャットでも同じ）・このチャットの中の検索欄（いつもここにあり、⌘F でピントが入る）。
 * タブの列の「表示」→「見出しの項目」で隠した道具は出さない。ただし会話 / 動きは、動きを見ている間は出す（会話へ戻れるように）。
 * 検索欄は見出しが渡す（隠したときは見出しが浮かせて出すので、ここには null）
 */
export function ChatHeaderTools({ find }: { find: ReactNode }) {
  const { root, show } = useChatPane();
  const showing = useChatPaneState((s) => s.showing) ?? "conversation";
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const shows = useChatHeaderItems();
  return (
    <>
      {(shows("showing") || showing === "activity") && (
        <Segmented<ChatShowing>
          className="chat-show-toggle"
          label="会話と動き"
          value={showing}
          onChange={(next) => show(next)}
          options={[
            {
              value: "conversation",
              label: "会話",
              icon: MessageSquare,
              tip: "会話（自分の指示と AI の返答の流れ。サブエージェントは流れの中のカード）",
            },
            {
              value: "activity",
              label: "動き",
              icon: GitBranch,
              tip: "動き（メインとすべてのサブエージェントの動きを、時刻の順に 1 本に並べる）",
            },
          ]}
        />
      )}
      {shows("textWidth") && <TextWidthToggle panel={root} />}
      {showing === "conversation" && (
        <>
          {shows("sticky") && (
            <IconButton
              icon={PanelTop}
              label={stickyHidden ? "指示の帯を表示" : "指示の帯を隠す"}
              title={stickyHidden ? "指示の帯を表示（読んでいる返答の元の指示を上に出す）" : "指示の帯を隠す"}
              aria-pressed={!stickyHidden}
              className={cx("chat-sticky-toggle", !stickyHidden && "on")}
              onClick={() => setStickyHidden(!stickyHidden)}
            />
          )}
          {find}
        </>
      )}
    </>
  );
}
