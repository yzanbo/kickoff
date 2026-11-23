// 「AI に渡す」の共通の口: 各タブの 1 つのもの（issue・PR・DB のつながらない様子など）を、押した時点の中身の札にして、選んだチャットの入力欄に入れる。
// どの渡し先でも入力欄で止め、送るのは自分で。渡し先は上の機能が handOffTargets に登録する（この機能は入力欄・子チャット・新しいチャットを知らない）
import type { Attachment, Chat, GitHubLink } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { definePoint } from "@/foundation/ui/points";

/**
 * 渡し先: 新しいチャットで始める / このチャット（右の欄の足す先のチャット）に追加 / パスをこのチャットに追加 / 中のチャット（右の欄の中の子チャット・ノートのチャット）に追加 /
 * パスを中のチャットに追加 / 新しい子チャットで聞く / ほかのチャットに追加
 */
export const HAND_OFF_TARGET_IDS = ["new", "this", "thisPath", "inner", "innerPath", "child", "other"] as const;
export type HandOffTargetId = (typeof HAND_OFF_TARGET_IDS)[number];

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
  /** ファイルのフルパス（あれば、足す先のチャットに「パスを追加」も出す。コードの行の右クリック） */
  path?: string;
  /** 出さない渡し先（渡すものに合わないもの） */
  hide?: readonly HandOffTargetId[];
}

/** 開いた所: 右の欄・別ウィンドウの足す先のチャット（なければ null）と、その中の別のチャット（右の欄の中の子チャット・ノートのチャット。呼び名つき） */
export interface HandOffPlace {
  mainChat: Chat | null;
  inner: { chat: Chat; name: string } | null;
}

/**
 * 渡し先 1 つ（composer が this・thisPath・inner・innerPath・other、childChats が child、chatPanel が new を登録する）。
 * chat は渡す先のチャット（chatOf の値。既定は place.mainChat。other は選んだチャット）
 */
export interface HandOffTarget {
  id: HandOffTargetId;
  order: number;
  /** 渡すもの（既定は一言と札。path はファイルのフルパスで、item.path があるときだけ出す） */
  hands?: "path";
  /** メニューの項目の文（null なら出さない） */
  label(place: HandOffPlace): string | null;
  /** 渡す先のチャット（既定は place.mainChat） */
  chatOf?(place: HandOffPlace): Chat | null;
  /** 乗せたときの説明 */
  title(item: HandOffItem, chat: Chat | null): string;
  run(item: HandOffItem, chat: Chat | null): Promise<void>;
  /** 押すと、このプロジェクトの最近動いたチャットから選ぶ（「ほかのチャットに追加 ▸」） */
  pickChat?: boolean;
}

/** 「AI に渡す」の渡し先（order の順） */
export const handOffTargets = definePoint<HandOffTarget>("handOffTargets", { key: (t) => t.id, order: (a, b) => a.order - b.order });

/** メニューに出す渡し先（渡すものが隠すもの・渡すもの（一言と札・パス）がないもの・足す先のチャットがなくて出せないものを除く） */
export function visibleHandOffTargets(targets: readonly HandOffTarget[], item: HandOffItem, place: HandOffPlace): HandOffTarget[] {
  const hide = new Set(item.hide ?? []);
  const has = { text: item.text !== "" || item.capture !== undefined, path: item.path !== undefined };
  return targets.filter((t) => !hide.has(t.id) && has[t.hands ?? "text"] && t.label(place) !== null);
}

/** 渡す先のチャット（chatOf がなければ足す先のチャット） */
export const handOffChatOf = (target: HandOffTarget, place: HandOffPlace): Chat | null => (target.chatOf ? target.chatOf(place) : place.mainChat);

const failed = reportFailure("AI に渡す中身を取れませんでした");

/** 押した時点の中身を取る（札のないものは空。取れなければ知らせて null） */
export async function captureOf(item: HandOffItem): Promise<Attachment[] | null> {
  if (!item.capture) return [];
  try {
    return [await item.capture()].flat();
  } catch (e) {
    failed(e);
    return null;
  }
}

/** まだどれにも結び付いていないチャットなら、issue・PR に結び付ける */
export function linkChat(item: HandOffItem, chat: Pick<Chat, "id" | "github_number">) {
  if (item.link && chat.github_number === null) void api.setChatGitHub(chat.id, item.link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}
