// conversation がアプリの根に置く物: 会話の文字の大きさ（<html> の CSS 変数）と、チャットの中の文言の全文検索のパネル
import type { AppHost } from "@/foundation/ui/shell/points";
import { useApplyChatFontSize } from "./display/chatFontSize";
import { ContentSearchDialog } from "./search/ContentSearchDialog";

export const conversationHosts: AppHost[] = [
  { id: "chatFontSize", windows: "both", useEffect: useApplyChatFontSize },
  { id: "contentSearch", windows: "main", order: 260, dialog: { id: "contentSearch", Dialog: ContentSearchDialog } },
];
