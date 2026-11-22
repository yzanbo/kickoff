// 会話の画面が中で持つツールの見せ方（上から順に引く）
import type { ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";
import { bashView } from "./bash";
import { editView } from "./edit";
import { createdChatView, userViewView } from "./kickoff";
import { readView } from "./read";
import { searchView } from "./search";

export const BUILTIN_ROW_VIEWS: readonly ToolRowView[] = [bashView, searchView, editView, readView, userViewView, createdChatView];
