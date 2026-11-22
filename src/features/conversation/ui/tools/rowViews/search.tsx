import { isFileNameSearch, searchModeOf, toolKindOf } from "@shared/ai/claudeTools";
import { SearchResult, SearchTitle } from "@/features/conversation/ui/tools/ToolResultCode";
import type { ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";

/** 文字列の入力（なければ undefined） */
const strOf = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** 検索: 行は探したもの（正規表現は色付き・ファイル名はパスの形）と探した場所、開くと見つけたもの */
export const searchView: ToolRowView = {
  match: (name, input) => toolKindOf(name) === "search" && typeof input.pattern === "string",
  Arg: ({ call, input, rel }) => <SearchTitle glob={isFileNameSearch(call.use.data.name)} pattern={String(input.pattern)} path={rel(strOf(input.path) ?? "")} highlight />,
  hasDetail: ({ content, result }) => Boolean(content && !result?.is_error),
  Detail: ({ call, input, content, rel }) => <SearchResult content={rel(content)} mode={searchModeOf(call.use.data.name, input)} path={strOf(input.path)} highlight />,
};
