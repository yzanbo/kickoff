// 履歴の手元のブランチの右クリックに、ほかの機能が足す項目（github の「プッシュして PR を作る」）。プッシュの項目の下に並ぶ
import { definePoint } from "@/foundation/ui/points";
import type { WorkplaceRef } from "@/foundation/ui/workplace/workplace";

/** 送ったあとに出す知らせ */
export interface BranchMenuNotice {
  title: string;
  message: string;
}

export interface BranchMenuItem {
  id: string;
  /** 項目の文（remote は追いかけているリモート。なければ origin） */
  label: (branch: string, remote: string) => string;
  /** 実行中の名前（失敗の見出し「…できませんでした」にも） */
  busyLabel: string;
  /** 送る前の確かめ（false ならやめる） */
  confirm: (branch: string) => Promise<boolean>;
  /** 送る（終わったら Git の状態と履歴を取り直す。返した知らせを出す） */
  send: (target: WorkplaceRef, branch: string) => Promise<BranchMenuNotice | null>;
}

export const branchMenuItems = definePoint<BranchMenuItem>("branchMenuItems", { key: (item) => item.id });
