// 「AI に渡す」の「新しい子チャットで聞く」（attachments の handOffTargets に contributes.ts で登録する）:
// いちばん上の親の右の欄に、一言と札を入れた新しい子チャットのタブを開く。ノートのチャット・アーカイブしたチャットには作れないので出さない
import { captureOf, type HandOffTarget } from "@/features/attachments/ui";
import { chatTitle, openAskChild } from "@/features/chat/ui";
import type { Chat } from "@shared/chat/types";

/** 子チャットを作れるチャットか */
const canAskChild = (chat: Chat | null): chat is Chat => chat !== null && !chat.note_path && chat.archived_at === null;

export const childChatHandOff: HandOffTarget = {
  id: "child",
  order: 30,
  label: ({ mainChat }) => (canAskChild(mainChat) ? "新しい子チャットで聞く" : null),
  title: (item, chat) => `${item.what}を入れた新しい子チャット（「${chatTitle(chat?.title)}」の子）を右の欄に開く`,
  async run(item, chat) {
    if (!chat) return;
    const attachments = await captureOf(item);
    if (!attachments) return;
    openAskChild({ parentId: chat.id, eventId: null, quote: "", text: item.text, attachments });
  },
};
