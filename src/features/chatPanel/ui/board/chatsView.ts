// chatPanel がプロジェクトの画面の表（projectViews）に出す画面: チャット（ボードと分ける置き方のときだけ。分けないときはボードが URL と数を受け持つ）
import { MessageSquare } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { ChatsViewPage, useChatsBadge } from "./chatsViewPage";

export const chatsView: ProjectViewDef = {
  id: "chats",
  label: "チャット",
  icon: MessageSquare,
  group: "work",
  order: 20,
  common: true,
  places: ["center"],
  onlyWhenSeparate: { into: "board" },
  Page: ChatsViewPage,
  useBadge: useChatsBadge,
};
