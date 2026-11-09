import { ArrowUpToLine, FolderTree, FolderUp, ListFilter, ListTree, type LucideIcon } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_WAITING_VIEW } from "@/lib/storageKeys";
import type { WaitingOrder, WaitingScope, WaitingView } from "./waitingAxes";

// 保存する値の一覧が、2 つの軸で扱う表示（waitingAxes.ts）と食い違わないことを型で確かめる
const _views: readonly WaitingView[] = SIDEBAR_WAITING_VIEW.choices;
void _views;

/** 名前とアイコン（見出しの「要対応」の行の出し方・並べ方） */
interface AxisMeta {
  icon: LucideIcon;
  /** 切り替えに出す短い名前 */
  short: string;
  /** 説明（乗せたとき・メニュー） */
  label: string;
}

/** 出し方（要対応だけ / 一覧の上に / プロジェクト内の上に） */
export const WAITING_SCOPE_META: Record<WaitingScope, AxisMeta> = {
  only: { icon: ListFilter, short: "要対応だけ", label: "要対応だけ（待っているチャットだけを並べる）" },
  top: { icon: ArrowUpToLine, short: "一覧の上に", label: "一覧の上にまとめる（待っているチャットを一覧全体のいちばん上に。その下はすべて）" },
  project: { icon: FolderUp, short: "プロジェクト内", label: "プロジェクト内の上にまとめる（待っているチャットを各プロジェクトの中のいちばん上に。その下はすべて）" },
};

/**
 * 並べ方（プロジェクト別 / 状態順）。「〜別」は見出しに分ける、「〜順」は並べる順（チャットの並び順の「最近動いた順 / 状態順」と同じ言い方）。
 * 状態順のアイコンはチャットの並び順の状態順と同じ
 */
export const WAITING_ORDER_META: Record<WaitingOrder, AxisMeta> = {
  project: { icon: FolderTree, short: "プロジェクト別", label: "プロジェクト別（プロジェクトの見出しに分ける）" },
  status: { icon: ListTree, short: "状態順", label: "状態順（プロジェクトをまたいで、回答待ち → エラー → 未読の見出しに分ける）" },
};

/** 要対応がオンのときの表示（どの部品から読んでもそろう） */
export const useWaitingView = () => useSetting(SIDEBAR_WAITING_VIEW);
