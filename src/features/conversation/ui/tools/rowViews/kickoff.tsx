import { isCreateChatTool } from "@shared/chat/aiCreateChat";
import { AI_GET_USER_VIEW_TOOL, userViewSummaryOf } from "@shared/userView/tools";
import { CreatedChatToolDetail } from "@/features/childChats/ui";
import type { ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";

/** 利用者の画面を見る: 引数がないので、画面を見たか・読めなかった事情を結果の 1 行目から */
export const userViewView: ToolRowView = {
  match: AI_GET_USER_VIEW_TOOL,
  Arg: ({ result }) => userViewSummaryOf(result?.content) ?? "",
};

/** AI が作ったチャット: 開くと送った依頼の全文と作ったチャットの札（結果の文も下に出す） */
export const createdChatView: ToolRowView = {
  match: (name, input) => isCreateChatTool(name) && typeof input.text === "string",
  Detail: ({ input, result }) => <CreatedChatToolDetail text={String(input.text)} result={result?.content} />,
  result: "also",
};
