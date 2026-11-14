// kickoff_chat の利用者に知らせるツール（notify_user）。中身は core/chat/aiNotify.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AI_NOTIFY_MESSAGE_MAX, AI_NOTIFY_PER_TURN } from "@shared/chat/aiNotify";
import type { AiNotifyTools } from "../../chat/aiNotify.js";
import { run } from "./chatToolResult.js";

/** 利用者に知らせるツールの使い方（MCP の instructions として AI に渡す） */
export const NOTIFY_INSTRUCTIONS = [
  `notify_user は、長い作業の途中で手を止めずに「ここまで済んだ」「この判断はあとで見てほしい」を利用者に届ける（この Mac の通知とスマホのプッシュ。このチャットを見ている人には届かない）。message は ${AI_NOTIFY_MESSAGE_MAX} 文字まで、1 回の作業で ${AI_NOTIFY_PER_TURN} 回まで。`,
  "作業の終わり・利用者への質問（回答待ち）は Kickoff が自動で知らせるので、そのためには使わない。Claude Code の PushNotification は Kickoff の利用者に届かないので使えない（これを使う）。",
];

/** 利用者に知らせるツール（聞かずに送る） */
export function notifyTools(notify: AiNotifyTools) {
  return [
    tool(
      "notify_user",
      `利用者に短い知らせを送る（長い作業の途中の区切り・あとで見てほしい判断。${AI_NOTIFY_MESSAGE_MAX} 文字まで・1 回の作業で ${AI_NOTIFY_PER_TURN} 回まで）`,
      { message: z.string().min(1).max(500).describe(`知らせる短い文（${AI_NOTIFY_MESSAGE_MAX} 文字まで）`) },
      run((args) => notify.notify(args)),
    ),
  ];
}
