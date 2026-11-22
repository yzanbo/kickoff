// 設定の節と欄の拡張点: 持ち主の機能が節（左の一覧の 1 項目と右の中身）・節の中の欄を登録し、ダイアログが scope ごとに order の順で並べる。
// いまはプロジェクトの編集（scope: "project"。projects の ProjectEditDialog）だけが読む（アプリの設定のダイアログを節に分けるのは後の段）
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { definePoint } from "@/foundation/ui/points";

/** 節・欄に渡すもの（projectId はプロジェクトの編集で開いたとき。プロジェクトそのものは projects の useEditedProject） */
export interface SettingsPartProps {
  projectId?: number;
}

export interface SettingsSectionDef {
  /** 節の名前（開くときに選ぶ項目。同じ scope で重ねない） */
  id: string;
  /** project はプロジェクトの編集のダイアログ、app はアプリの設定 */
  scope: "app" | "project";
  label: string;
  icon: LucideIcon;
  order: number;
  /** 削除など（一覧のいちばん下に置き、選ぶと赤くする） */
  danger?: boolean;
  Component: ComponentType<SettingsPartProps>;
}

export interface SettingsItemDef {
  id: string;
  /** 入れる節の id（節が自分の欄の並びの中に描く） */
  section: string;
  order: number;
  Component: ComponentType<SettingsPartProps>;
}

export const settingsSections = definePoint<SettingsSectionDef>("settingsSections", { key: (s) => `${s.scope}:${s.id}`, order: (a, b) => a.order - b.order });
export const settingsItems = definePoint<SettingsItemDef>("settingsItems", { key: (i) => i.id, order: (a, b) => a.order - b.order });

/** その scope の節（order の順） */
export const settingsSectionsOf = (scope: SettingsSectionDef["scope"]): SettingsSectionDef[] => settingsSections.items().filter((s) => s.scope === scope);

/** その節の欄（order の順） */
export const settingsItemsOf = (section: string): SettingsItemDef[] => settingsItems.items().filter((i) => i.section === section);
