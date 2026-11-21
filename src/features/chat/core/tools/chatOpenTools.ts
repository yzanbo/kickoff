// kickoff_chat の画面に頼むツール（open_note・open_chat・open_file・open_diff・open_sql・add_draft）の組（order 40）。open_note・open_file・open_diff・open_sql の中身は aiOpen.ts、
// 家系のチャットの open_chat・add_draft は定義ごと open.ts（ほかも持ち主の機能へ移すまで、使い方の文とツールの並びはこの組のまま）
import { defineAiTool, type AiToolDef } from "@/foundation/core/aiTools/tool";
import { z } from "zod";
import type { AiOpenTools } from "./aiOpen";
import { openPlaceInput } from "./open";

/** 画面に頼むツールの使い方（MCP の instructions として AI に渡す） */
export const OPEN_INSTRUCTIONS = [
  "open_note は、このプロジェクトのノート（ノートのフォルダの .md・.html）を Kickoff の画面に開く。path はノートのフォルダからの相対パスか、ノートのフォルダの中の絶対パス。",
  "open_chat は、このチャットと同じ家系のチャット（list_family_chats の一覧）を Kickoff の画面に開く。子チャット・孫チャットは右の欄か別ウィンドウ、いちばん上の親チャットはチャットのパネルに開く。",
  "open_file は、このチャットの作業場所のファイルを開く（line でその行を目立たせる）。open_diff は、作業場所のまだコミットしていない変更を開く（path でそのファイルの位置へ）。利用者に「ここを見てください」と見せるときに使う。",
  "place は side（いちばん上の親チャットの画面の右の欄。子チャットの中からでも親の右の欄に開く）か window（別ウィンドウ）。利用者が「右で」「右の欄で」「サイドで」と言ったら side、「別ウィンドウで」「新しいウィンドウで」と言ったら window。場所を言われなければ省く（ノート・チャットは利用者の設定の開き方、ファイル・差分は右の欄）。",
  "open_sql は、このプロジェクトの DB の接続（AI に見せる接続だけ）の新しい SQL のタブに SQL を入れて開く。流さない（流すのは利用者）。書き込みの SQL を用意して、利用者に確かめてから流してもらうときに使う。",
  "add_draft は、同じ家系のチャット（list_family_chats の一覧。親チャット・子チャットなど）の入力欄に下書きを入れる。書きかけがあれば、その後ろに足す（消さない）。親チャットに入れると「子チャットから渡した」の印も付く。送るのは利用者。利用者が「親チャットに渡して」「〇〇の入力欄に入れて」と頼んだときに使う。",
  "どれも開く・入れるだけで何も変えないので、聞かずに頼む。頼まれていないのに開かない・入れない。開けたかは返らない（画面に頼むだけ）。",
];

/** 画面に頼むツール（聞かずに頼む。家系のチャットの 2 つは chat の open.ts の定義を並びの中に置く） */
export function openTools(open: AiOpenTools, family: { openChat: AiToolDef; addDraft: AiToolDef }): AiToolDef[] {
  const place = openPlaceInput();
  return [
    defineAiTool({
      server: "kickoff_chat",
      name: "open_note",
      description: "このプロジェクトのノートを Kickoff の画面（右の欄・別ウィンドウ）に開く（開くだけ）",
      input: { path: z.string().min(1).describe("ノートのフォルダからの相対パス（「機能の仕様/図.html」）か、ノートのフォルダの中の絶対パス"), place },
      run: (args) => open.openNote(args),
    }),
    family.openChat,
    defineAiTool({
      server: "kickoff_chat",
      name: "open_file",
      description: "このチャットの作業場所のファイルを Kickoff の画面に開く（行を目立たせられる。開くだけ）",
      input: {
        path: z.string().min(1).describe("作業場所からの相対パス（「src/app.ts」）か、作業場所の中の絶対パス"),
        line: z.number().int().min(1).optional().describe("目立たせる行（1 から）"),
        place,
      },
      run: (args) => open.openFile(args),
    }),
    defineAiTool({
      server: "kickoff_chat",
      name: "open_diff",
      description: "このチャットの作業場所のまだコミットしていない変更を Kickoff の画面に開く（開くだけ）",
      input: { path: z.string().optional().describe("そのファイルの差分の位置へ移る（作業場所からの相対パスか、中の絶対パス）。省くと変更の全体"), place },
      run: (args) => open.openDiff(args),
    }),
    defineAiTool({
      server: "kickoff_chat",
      name: "open_sql",
      description: "このプロジェクトの DB の接続の新しい SQL のタブに SQL を入れて開く（流さない）",
      input: {
        sql: z.string().min(1).describe("入れる SQL（いくつかの文でもよい）"),
        connection: z.string().optional().describe("接続の名前（AI に見せる接続が 1 つだけなら省ける）"),
      },
      run: (args) => open.openSql(args),
    }),
    family.addDraft,
  ];
}
