// 「AI に渡す」の「新しいチャットで始める」（attachments の handOffTargets に contributes.ts で登録する）:
// 作業場所を選んでから（branch がなければ本体で）、押した時点の中身を入れた新しいチャットのタブを開く
import { captureOf, type HandOffTarget } from "@/features/attachments/ui";
import { chooseWorkplace, openSeededChat } from "./openSeededChat";

export const newChatHandOff: HandOffTarget = {
  id: "new",
  order: 10,
  label: () => "新しいチャットで始める",
  title: (item) => (item.branch ? `作業場所（新しいワークツリー・本体・いまあるワークツリー）を選んで、${item.what}を入れた新しいチャットを開く` : `${item.what}を入れた新しいチャットを開く`),
  async run(item) {
    const captured = captureOf(item);
    const place = item.branch ? await chooseWorkplace(item.projectId, item.branch) : { kind: "main" as const };
    const attachments = await captured;
    if (!place || !attachments) return;
    openSeededChat(item.projectId, place, { text: item.text, attachments, link: item.link });
  },
};
