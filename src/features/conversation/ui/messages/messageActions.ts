// 発言の右クリックと、文を選んだときのボタンに上の機能が足す項目（ノート・GitHub が ui/contributes.ts で登録する）
import type { ComponentType } from "react";
import { definePoint, type LazyPart } from "@/foundation/ui/points";

/** 右クリックの項目に渡すもの（text は選んだ部分、なければ項目の全体） */
export interface MessageMenuContext {
  projectId: number;
  chatId: number;
  text: string;
}

/** 選んだ範囲の上のボタンに渡すもの（chatId は出どころのチャット。メニューを開いている間は onHold(true)、済んだら onDone） */
export interface SelectionContext {
  projectId: number;
  chatId: number;
  text: string;
  onHold: (hold: boolean) => void;
  onDone: () => void;
}

export type MessageAction =
  | { kind: "menu"; id: string; order: number; Items: LazyPart<MessageMenuContext> }
  | { kind: "selection"; id: string; order: number; Button: LazyPart<SelectionContext> };

/** 発言のメニュー・選んだときのボタンの項目（order の順） */
export const messageActions = definePoint<MessageAction>("messageActions", { key: (a) => a.id, order: (a, b) => a.order - b.order });

/** 右クリックの項目（チャットの画面の中で、ノート・issue にするの順） */
export const menuActions = (): ComponentType<MessageMenuContext>[] => messageActions.items().flatMap((a) => (a.kind === "menu" ? [a.Items] : []));

/** 選んだ範囲の上の、足す先のボタンの横に置くもの（「ノート ▾」） */
export const selectionActions = (): ComponentType<SelectionContext>[] => messageActions.items().flatMap((a) => (a.kind === "selection" ? [a.Button] : []));

/** 項目の部品を先に読む（右クリック・選んだときに読み込みを待たずに描けるように。何度呼んでも 1 回） */
export function preloadMessageActions(): void {
  for (const a of messageActions.items()) void (a.kind === "menu" ? a.Items : a.Button).preload();
}
