import { Bot, User } from "lucide-react";
import type { SearchHit } from "@shared/chat/types";
import { Highlight } from "@/foundation/ui/kit/Highlight";
import { chatTitle } from "@/features/chat/ui";
import type { PaletteItem } from "@/features/palette/ui";

/** 全文検索の 1 件を、⌘K の行にする（押すとその発言へ移って強調する） */
export function messageItem(hit: SearchHit, projectName: (id: number) => string): PaletteItem {
  return {
    key: `m-${hit.event_id}`,
    label: <Highlight text={hit.snippet} marks={[[hit.match_start, hit.match_end]]} />,
    text: hit.snippet,
    hint: `${chatTitle(hit.chat_title)} · ${projectName(hit.project_id)}`,
    icon: hit.type === "user" ? <User size={15} aria-label="自分" /> : <Bot size={15} aria-label="AI" />,
    route: { name: "chat", projectId: hit.project_id, chatId: hit.chat_id, focus: hit.event_id },
  };
}
