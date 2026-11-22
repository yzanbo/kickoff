// 殻の口: アプリの根に置く物（appHosts）・下の帯の項目（footerItems）・アプリのダイアログ（AppDialogMap・openAppDialog）。
// ダイアログの種類と開くときに渡すものは、持ち主の機能が declare module "@/foundation/ui/shell/points" で AppDialogMap に足す
import type { ComponentType, ReactNode } from "react";
import { definePoint, type LazyPart } from "@/foundation/ui/points";
import { createSignal } from "@/foundation/ui/store";
import { isPopoutWindow } from "@/foundation/ui/navigation/popout";
import { onWindowMessage, postToMainWindow } from "@/foundation/ui/navigation/windowBus";

/** 下の帯の項目 */
export interface FooterItem {
  id: string;
  side: "start" | "end";
  order: number;
  /** いまのプロジェクトを受ける */
  Item: LazyPart<{ projectId: number | undefined }> | ComponentType<{ projectId: number | undefined }>;
  /** この項目を隠しているときに代わりに出すもの */
  Fallback?: ComponentType;
  when?(): boolean;
}
/** 下の帯の項目（key は id、order で並べる） */
export const footerItems = definePoint<FooterItem>("footerItems", { key: (i) => i.id, order: (a, b) => a.order - b.order });

/** 機能が足していくアプリのダイアログの表（キーが種類、値が開くときに渡すもの。渡すものがなければ null） */
export interface AppDialogMap {}
type AppDialogId = keyof AppDialogMap & string;
/** ダイアログを開く頼み */
export type AppDialogRequest = { [K in AppDialogId]: { id: K; detail: AppDialogMap[K] } }[AppDialogId];

/** アプリのダイアログの部品が受けるもの */
export interface AppDialogProps {
  detail: unknown;
  onClose(): void;
}

/** アプリの根に置く物 */
export interface AppHost {
  id: string;
  windows: "main" | "popout" | "both";
  /** 根に置く部品（ダイアログの受け口・知らせの帯）。並びは order（ドラッグ領域より後ろに置くものは大きい数） */
  Host?: ComponentType;
  /** 殻の中で呼ぶ hook（全体の副作用。ウィンドウ間の知らせの受け手もここで onWindowMessage） */
  useEffect?: () => void;
  /** 殻の中身を包むもの（外部リンクの開き先など） */
  Provider?: ComponentType<{ children: ReactNode }>;
  /** アプリのダイアログ（openAppDialog(id) で開く。detail は開くときに渡したもの） */
  dialog?: { id: AppDialogId; Dialog: LazyPart<AppDialogProps> | ComponentType<AppDialogProps> };
  order?: number;
}
/** アプリの根に置く物（key は id、order で並べる） */
export const appHosts = definePoint<AppHost>("appHosts", { key: (h) => h.id, order: (a, b) => (a.order ?? 0) - (b.order ?? 0) });

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウでアプリのダイアログを開く（別ウィンドウの中から開いた設定・⌘⇧A・新しいプロジェクトなど。openAppDialog） */
    appDialog: { id: string; detail: unknown };
  }
}

/** このウィンドウで頼んだダイアログ（メインのウィンドウの殻が受ける） */
const appDialogRequested = createSignal<AppDialogRequest>();

/** 渡すものがない（値が null の）ダイアログは種類だけで開く */
type DetailArgs<K extends AppDialogId> = AppDialogMap[K] extends null ? [] : [detail: AppDialogMap[K]];

/** アプリのダイアログを開く（別ウィンドウからは、メインのウィンドウへ送って開く。中身はウィンドウをまたげる値だけ） */
export function openAppDialog<K extends AppDialogId>(id: K, ...args: DetailArgs<K>): void {
  const detail = args.length > 0 ? args[0] : null;
  if (isPopoutWindow()) postToMainWindow("appDialog", { id, detail });
  else appDialogRequested.emit({ id, detail } as AppDialogRequest);
}

/** メインのウィンドウの殻: このウィンドウと別ウィンドウから頼まれたダイアログを受ける（やめるときは返り値を呼ぶ） */
export function onAppDialogRequested(handler: (request: AppDialogRequest) => void): () => void {
  const offLocal = appDialogRequested.subscribe(handler);
  const offWindow = onWindowMessage("appDialog", (m) => handler(m as AppDialogRequest));
  return () => {
    offLocal();
    offWindow();
  };
}
