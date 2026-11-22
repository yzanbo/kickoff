// チャットの右の欄の「＋ ▾」の拡張点 chatSideAdds: 項目はプロジェクトの画面の表（projectViews）から作り、項目の代わりに出すもの（ノートの最近・DB の接続の
// 子のメニュー、変更のタブを開く）だけを持ち主の機能が登録する（agents/AgentPanelAdds.tsx が読む）
import type { ComponentType } from "react";
import type { Chat } from "@shared/chat/types";
import { definePoint } from "@/foundation/ui/points";

/** 項目に渡すもの */
export interface ChatSideAddProps {
  /** 右の欄のチャット */
  chat: Chat;
  /** 右の欄の欄のキー */
  panelKey: string;
  /** その画面のタブを、この右の欄に開く */
  openView(): void;
}

export interface ChatSideAdd {
  /** 代わりに出すプロジェクトの画面の名前（並び・名前・アイコンは画面の表から。右の欄に置けない画面（変更）も、これがあれば出す） */
  view: string;
  /** 項目の説明（なければ「プロジェクトの「名前」タブと同じ画面を開く」） */
  title?: string;
  /** 押したとき（なければその画面のタブを開く） */
  open?(props: ChatSideAddProps): void;
  /** 押す代わりに横に開く一覧 */
  Submenu?: ComponentType<ChatSideAddProps>;
}

export const chatSideAdds = definePoint<ChatSideAdd>("chatSideAdds", { key: (a) => a.view });
