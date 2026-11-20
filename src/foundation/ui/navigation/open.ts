// 「開く」の口: 部品・AI の open_view・通知・ウィンドウ間の知らせのすべてが open(行き先) を通る。
// 行き先の種類は、持ち主の機能が ui/openTargets.ts で OpenTargetMap に足し（declare module）、ui/contributes.ts で openTargets.item({ kind, open }) を出す
import { definePoint } from "@/foundation/ui/points";
import { isPopoutWindow } from "./popout";
import { postToMainWindow } from "./windowBus";

/** 機能が足していく行き先の表（declare module "@/foundation/ui/navigation/open" で足す。下の機能も上の機能の行き先を import なしで開ける） */
export interface OpenTargetMap {}
type OpenKind = keyof OpenTargetMap & string;
export type OpenTarget = { [K in OpenKind]: { kind: K } & OpenTargetMap[K] }[OpenKind];

/** 画面の置き場所。page = 真ん中の画面・side = いちばん上の親チャットの右の欄・window = 別ウィンドウ・inline = その場（流れの中のカード） */
export type OpenSurface = "page" | "side" | "window" | "inline";
export interface OpenOptions {
  /** 省けば行き先ごとの設定の開き方 */
  surface?: OpenSurface;
  /** どのチャットから開いたか（右の欄を決める。子チャットならいちばん上の親の欄） */
  fromChatId?: number | null;
  /** 画面の履歴に残さず置き換える */
  replace?: boolean;
  /** 開いた行き先を選ぶ（タブを開いて、その中の項目を選ぶ） */
  select?: boolean;
}
export interface OpenTargetHandler<K extends OpenKind = OpenKind> {
  kind: K;
  /** 開けたら true。surface を受けられないときは近いもので開く */
  open(target: { kind: K } & OpenTargetMap[K], options: OpenOptions): boolean;
}

declare module "./windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウでその行き先を開く（別ウィンドウで真ん中の画面・右の欄を頼まれた open） */
    open: { target: OpenTarget; options: OpenOptions };
  }
}

/** 行き先の受け手（key は kind） */
export const openTargets = definePoint<OpenTargetHandler>("openTargets", { key: (h) => h.kind });

/**
 * 行き先を開く。別ウィンドウで真ん中の画面・右の欄（surface が page・side）を頼まれたら、メインのウィンドウへ送って開く
 * （受けるのは popoutNavigation.ts の receiveForwarded）。受け手がなければ、開発中は投げ、製品では知らせを残して何もしない
 */
export function open(target: OpenTarget, options: OpenOptions = {}): boolean {
  if ((options.surface === "page" || options.surface === "side") && isPopoutWindow()) {
    postToMainWindow("open", { target, options });
    return true;
  }
  const handler = openTargets.items().find((h) => h.kind === target.kind);
  if (handler) return handler.open(target as never, options);
  const message = `行き先 ${target.kind} の受け手がない（持ち主の機能の ui/contributes.ts で openTargets.item を出す）`;
  if (import.meta.env.DEV) throw new Error(message);
  console.error(`[open] ${message}`);
  return false;
}
