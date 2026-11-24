import { toolKindOf } from "@shared/ai/claudeTools";
import { toolText } from "@/features/chat/ui";
import { HighlightedCode } from "@/foundation/ui/kit/HighlightedCode";
import { BashOutput } from "@/features/conversation/ui/tools/BashOutput";
import type { ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";

/** コマンド: 行はシェルの文法で色を付けた 1 行（改行は空白に見える）、開くとコマンドと出力（失敗の知らせも）を 1 つの枠で（結果の欄は使わない） */
export const bashView: ToolRowView = {
  match: (name, input) => toolKindOf(name) === "command" && typeof input.command === "string",
  Arg: ({ input, rel }) => <HighlightedCode code={rel(String(input.command))} lang="shellscript" />,
  Detail: ({ input, result, rel }) => <BashOutput command={String(input.command)} result={result} rel={rel} highlight />,
  result: "never",
  ApprovalBody: ({ input, name }) => <HighlightedCode code={toolText().describeApprovalInput(name, input)} lang="shellscript" />,
};
