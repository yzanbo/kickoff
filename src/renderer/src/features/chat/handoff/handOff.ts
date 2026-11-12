// 「AI に渡す」の共通の口: 各タブの 1 つのもの（issue・PR・DB のつながらない様子など）を、押した時点の中身の札にして、選んだチャットの入力欄に入れる。
// どの渡し先でも入力欄で止め、送るのは自分で
import type { Attachment, Chat, GitHubLink } from "@shared/types";
import { api } from "@/api";
import { showToast } from "@/ui/toast";
import { reportFailure } from "@/ui/dialogs";
import { chatTargetName } from "@/features/chat/chatTitle";
import { openAskChild } from "@/features/chat/children/openChild";
import { addToChat } from "@/features/chat/pane/addToChat";
import { chatPaneOf } from "@/features/chat/pane/windowMessages";
import { chooseWorkplace, openSeededChat } from "./workplace";

/** 渡し先: 新しいチャットで始める / このチャット（右の欄の足す先のチャット）に追加 / 新しい子チャットで聞く / ほかのチャットに追加 */
export const HAND_OFF_TARGETS = ["new", "this", "child", "other"] as const;
export type HandOffTarget = (typeof HAND_OFF_TARGETS)[number];

/** 渡すもの 1 つ（各タブが作る） */
export interface HandOffItem {
  projectId: number;
  /** 何を渡すか（乗せたときの説明。「issue #12 の題名・本文・コメント」） */
  what: string;
  /** 入力欄に入れる一言（書き換えられる。空なら札だけ） */
  text: string;
  /** 押した時点の中身を添付にする（コアが鍵らしい値を伏せて保存した札。ブラウザの画面とコンソールのように、いくつかまとめてもよい）。なければ一言だけ（選んだ文の引用など） */
  capture?: () => Promise<Attachment | Attachment[]>;
  /** 結び付ける issue・PR（新しいチャット・まだ結び付いていないチャットに付ける） */
  link?: GitHubLink;
  /** 新しいワークツリーの名前の案（なければ作業場所を聞かずに本体で始める） */
  branch?: string;
  /** 出さない渡し先（渡すものに合わないもの） */
  hide?: readonly HandOffTarget[];
}

const failed = reportFailure("AI に渡す中身を取れませんでした");

/** 押した時点の中身を取る（札のないものは空。取れなければ知らせて null） */
async function captureOf(item: HandOffItem): Promise<Attachment[] | null> {
  if (!item.capture) return [];
  try {
    return [await item.capture()].flat();
  } catch (e) {
    failed(e);
    return null;
  }
}

/** まだどれにも結び付いていないチャットなら、issue・PR に結び付ける */
function linkChat(item: HandOffItem, chat: Pick<Chat, "id" | "github_number">) {
  if (item.link && chat.github_number === null) void api.setChatGitHub(chat.id, item.link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}

/** 新しいチャットで始める（作業場所を選んでから。branch がなければ本体で）。中身は押した時点のもの */
export async function handOffToNewChat(item: HandOffItem) {
  const captured = captureOf(item);
  const place = item.branch ? await chooseWorkplace(item.projectId, item.branch) : { kind: "main" as const };
  const attachments = await captured;
  if (!place || !attachments) return;
  openSeededChat(item.projectId, place, { text: item.text, attachments, link: item.link });
}

/** このチャット（右の欄の足す先のチャット。画面が開いている）の入力欄に足す */
export async function handOffToThisChat(item: HandOffItem, chat: Chat) {
  const attachments = await captureOf(item);
  if (!attachments) return;
  addToChat(chat.id, item.text, attachments);
  linkChat(item, chat);
}

/** 新しい子チャットで聞く（いちばん上の親の右の欄に、一言と札を入れた新しい子チャットのタブを開く） */
export async function handOffToChild(item: HandOffItem, chat: Chat) {
  const attachments = await captureOf(item);
  if (!attachments) return;
  openAskChild({ parentId: chat.id, eventId: null, quote: "", text: item.text, attachments });
}

/** ほかのチャットに追加（画面は移さない。開いていなければ書きかけの文と添付に足し、「〇〇に追加しました［開く］」と知らせる） */
export async function handOffToOtherChat(item: HandOffItem, chat: Chat) {
  const attachments = await captureOf(item);
  if (!attachments) return;
  const open = chatPaneOf(chat.id) !== undefined;
  addToChat(chat.id, item.text, attachments);
  // 画面があれば入力欄に入る（知らせは開いていないときに addToChat が出す）
  if (open) showToast(`${chatTargetName(chat)}に追加しました`);
  linkChat(item, chat);
}
