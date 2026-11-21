// チャットの AI が利用者に知らせるツール（kickoff_chat の notify_user）。長い作業の途中で「ここまで済んだ」「この判断はあとで見てほしい」を届ける。
// 送るかは通知の中心（center.ts）が決める（そのチャットを見ている人には送らない・この Mac の通知は設定のとおり・スマホのプッシュには本文を載せない）。
// ここは確かめて、記録に残して、バスに知らせるだけ
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { BusEvent } from "@shared/foundation/contract";
import { AI_NOTIFY_MESSAGE_MAX, AI_NOTIFY_PER_TURN, NOTIFY_USER_VIEW, aiNoticeLine } from "@shared/notifications/tools";
import type { Store } from "@/features/chat/core/index";

/** 利用者に知らせるツールの使い方（MCP の instructions として AI に渡す） */
const NOTIFY_INSTRUCTIONS = [
  `notify_user は、長い作業の途中で手を止めずに「ここまで済んだ」「この判断はあとで見てほしい」を利用者に届ける（この Mac の通知とスマホのプッシュ。このチャットを見ている人には届かない）。message は ${AI_NOTIFY_MESSAGE_MAX} 文字まで、1 回の作業で ${AI_NOTIFY_PER_TURN} 回まで。`,
  "作業の終わり・利用者への質問（回答待ち）は Kickoff が自動で知らせるので、そのためには使わない。Claude Code の PushNotification は Kickoff の利用者に届かないので使えない（これを使う）。",
];

/** 知らせたら AI に返す文（できなければ理由の文で throw）。count はこの作業で知らせた回数 */
function notify(d: NotifyDeps, chatId: number, message: string, count: { sent: number }): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("知らせる文（message）が空です");
  if ([...text].length > AI_NOTIFY_MESSAGE_MAX) throw new Error(`知らせる文は ${AI_NOTIFY_MESSAGE_MAX} 文字までです（いま ${[...text].length} 文字）。短くしてください`);
  if (count.sent >= AI_NOTIFY_PER_TURN) throw new Error(`1 回の作業で知らせられるのは ${AI_NOTIFY_PER_TURN} 回までです。残りは作業の終わりの返答に書いてください（終わりは Kickoff が自動で知らせます）`);
  const store = d.store();
  const chat = store.chats.get(chatId);
  if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
  count.sent++;
  store.events.add(chatId, { type: "notice", message: aiNoticeLine(text) });
  d.publish({ type: "ai_notice", project_id: chat.project_id, chat_id: chatId, message: text });
  return `利用者に知らせました（この Mac の通知とスマホのプッシュ。このチャットを見ている人には送りません）。この作業で知らせられるのはあと ${AI_NOTIFY_PER_TURN - count.sent} 回です。作業はそのまま続けてください。`;
}

interface NotifyDeps {
  /** チャットと記録の店（chat はあとに作るので、呼ばれたときに引く） */
  store: () => Pick<Store, "chats" | "events">;
  publish: (event: BusEvent) => void;
}

/** 利用者に知らせるツールの組（どのチャットにも出す。並びは kickoff_chat のワークツリー（90）の次・画面（110）の前） */
export function notifyToolGroup(d: NotifyDeps): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 100,
    instructions: NOTIFY_INSTRUCTIONS,
    open() {
      return [
        defineAiTool({
          server: "kickoff_chat",
          name: NOTIFY_USER_VIEW.name,
          title: NOTIFY_USER_VIEW.label,
          description: `利用者に短い知らせを送る（長い作業の途中の区切り・あとで見てほしい判断。${AI_NOTIFY_MESSAGE_MAX} 文字まで・1 回の作業で ${AI_NOTIFY_PER_TURN} 回まで）`,
          input: { message: z.string().min(1).max(500).describe(`知らせる短い文（${AI_NOTIFY_MESSAGE_MAX} 文字まで）`) },
          // 1 回の作業で数える（作業ごとの値）
          run: ({ message }, turn) => notify(d, turn.chatId, message, turn.perTurn("notify_user", () => ({ sent: 0 }))),
        }),
      ];
    },
  };
}
