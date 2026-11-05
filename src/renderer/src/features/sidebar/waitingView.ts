import { ArrowUpToLine, ListFilter, ListOrdered, type LucideIcon } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { SIDEBAR_WAITING_VIEW } from "@/lib/storageKeys";

/** 自分待ちがオンのときの表示: filter = プロジェクトで絞る / inbox = 一覧の上にまとめる / list = 1 列にまとめる */
export type WaitingView = SettingValue<typeof SIDEBAR_WAITING_VIEW>;
export const WAITING_VIEWS: readonly WaitingView[] = ["filter", "inbox", "list"];

/** 表示の名前（見出しのボタンの短い名前・メニューの説明）とアイコン */
export const WAITING_VIEW_META: Record<WaitingView, { icon: LucideIcon; short: string; label: string }> = {
  filter: { icon: ListFilter, short: "絞る", label: "プロジェクトで絞る（待っているチャットのあるプロジェクトだけを並べる）" },
  inbox: { icon: ArrowUpToLine, short: "上にまとめる", label: "上にまとめる（待っているチャットを一覧の上に。その下はすべて）" },
  list: { icon: ListOrdered, short: "1 列", label: "1 列にまとめる（プロジェクトをまたいで急ぐ順に並べる）" },
};

/** 自分待ちがオンのときの表示（どの部品から読んでもそろう） */
export const useWaitingView = () => useSetting(SIDEBAR_WAITING_VIEW);
