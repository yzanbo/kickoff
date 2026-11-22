import { toolKindOf } from "@shared/ai/claudeTools";
import { toolImageType } from "@shared/attachments/toolImage";
import { ReadImage } from "@/features/conversation/ui/tools/ReadImage";
import { ReadResult, ToolPath } from "@/features/conversation/ui/tools/ToolResultCode";
import type { ToolRowProps, ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";

/** 画像を読んだか（読んだ画像は記録に残らない。結果は「[image]」の文字だけ） */
const isImage = ({ input, result }: ToolRowProps) => Boolean(result && !result.is_error && toolImageType(String(input.file_path)));

/** 読む: 行はパス、開くと行番号付きの中身。読んだ画像は、開いてから入力のパスで、いまのファイルを読んで出す */
export const readView: ToolRowView = {
  match: (name, input) => toolKindOf(name) === "read" && typeof input.file_path === "string",
  Arg: ({ input, rel }) => <ToolPath path={rel(String(input.file_path))} />,
  hasDetail: (props) => isImage(props) || Boolean(props.content && !props.result?.is_error),
  Detail: (props) =>
    isImage(props) ? (
      <ReadImage chatId={props.call.use.chat_id} path={String(props.input.file_path)} readAt={props.call.result?.created_at} />
    ) : (
      <ReadResult content={props.rel(props.content)} path={String(props.input.file_path)} highlight />
    ),
};
