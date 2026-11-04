import { PanelTop } from "lucide-react";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { ChatFind } from "@/features/chat/find/ChatFind";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";
import { useChatPane } from "./chatPaneContext";
import { TextWidthToggle } from "./TextWidthToggle";

/**
 * チャットの見出しの行の右の道具: 文の幅（パネルの大きさは変えず、発言の流れとチャット欄の幅の上限を外す。パネルが狭くて変わらないときは押せない）・
 * 上に置く指示の帯の表示・非表示（出しているかは色で示す。どのチャットでも同じ）・このチャットの中の検索欄（いつもここにあり、⌘F でピントが入る）
 */
export function ChatHeaderTools({ items, version }: { items: TimelineItem[]; version: unknown }) {
  const { root } = useChatPane();
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  return (
    <>
      <TextWidthToggle panel={root} />
      <IconButton
        icon={PanelTop}
        label={stickyHidden ? "指示の帯を表示" : "指示の帯を隠す"}
        title={stickyHidden ? "指示の帯を表示（読んでいる返答の元の指示を上に出す）" : "指示の帯を隠す"}
        aria-pressed={!stickyHidden}
        className={cx("chat-sticky-toggle", !stickyHidden && "on")}
        onClick={() => setStickyHidden(!stickyHidden)}
      />
      <ChatFind items={items} version={version} />
    </>
  );
}
