// database が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { AI_DB_QUERY_TOOL } from "@shared/database/tools";
import { toolRowViews, type ToolRowProps } from "@/features/conversation/ui";
import { lazyPart } from "@/foundation/ui/points";
import { projectViews } from "@/features/projects/ui";
import { chatSideAdds } from "@/features/chatPanel/ui";
import { databaseChatSideAdd, databaseView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { databasePopout } from "./popoutKinds";

export const contributes = [
  projectViews.item(databaseView),
  chatSideAdds.item(databaseChatSideAdd),
  popoutKinds.item(databasePopout),
  // チャットの AI が DB に流した SQL: 開くと全文と「SQL のタブで開く」（結果の文も下に出す）。承認カードは SQL を全文 SQL の色で
  toolRowViews.item({
    match: (name, input) => name === AI_DB_QUERY_TOOL && typeof input.sql === "string",
    Detail: lazyPart<ToolRowProps>(() => import("./dbQueryRowView").then((m) => ({ default: m.DbQueryRowDetail }))),
    result: "also",
    ApprovalBody: lazyPart<{ input: Record<string, unknown>; name: string }>(() => import("./dbQueryRowView").then((m) => ({ default: m.DbQuerySql }))),
  }),
];
