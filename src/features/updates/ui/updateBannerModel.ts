// 設定のダイアログの上の帯と、⚙ の印の決まり（純粋な関数）
import type { UpdateState } from "@shared/updates/types";

/** 帯のボタン */
export const BANNER_ACTIONS = ["install", "skip", "cancel", "notes", "releases"] as const;
export type BannerAction = (typeof BANNER_ACTIONS)[number];
export const BANNER_ACTION_LABELS: Record<BannerAction, string> = {
  install: "更新して開き直す",
  skip: "この版は飛ばす",
  cancel: "取り消す",
  notes: "変わった点",
  releases: "ダウンロードのページを開く",
};

export interface UpdateBanner {
  /** error は入れられなかった・確かめられなかったとき */
  tone: "info" | "error";
  text: string;
  /** ダウンロードの進み具合（0〜100。出さないときは null） */
  percent: number | null;
  actions: BannerAction[];
}

/** 帯の中身（出さないときは null。currentVersion は「最新の版です」に添える、いまの版） */
export function bannerOf(state: UpdateState, currentVersion: string): UpdateBanner | null {
  const info = (text: string, actions: BannerAction[] = [], percent: number | null = null): UpdateBanner => ({ tone: "info", text, percent, actions });
  switch (state.kind) {
    case "idle":
      return null;
    case "checking":
      return info("新しい版を確かめています…");
    case "latest":
      return info(`最新の版です（${currentVersion}）`);
    case "unreachable":
      return { tone: "error", text: "新しい版を確かめられませんでした。ネットワークを確かめて、もう一度試してください", percent: null, actions: [] };
    case "downloading":
      return info(`新しい版 ${state.version} をダウンロードしています（${Math.floor(state.percent)}%）`, [], state.percent);
    case "ready":
      return info(`新しい版 ${state.version} があります`, ["install", "skip", "notes"]);
    case "waiting":
      return info(`作業が終わったら開き直します（作業中のチャット ${state.running} 件）`, ["cancel"]);
    case "installing":
      return info(`新しい版 ${state.version} を入れて開き直しています…`);
    case "failed":
      return { tone: "error", text: `新しい版 ${state.version} を入れられませんでした。ダウンロードのページから入れ直してください`, percent: null, actions: ["releases", "skip"] };
  }
}

/** ⚙ に印を付けるか（入れるか飛ばすまで残す。ダウンロード中・確かめた結果だけのときは付けない） */
export const showsBadge = (state: UpdateState): boolean => state.kind === "ready" || state.kind === "waiting" || state.kind === "installing" || state.kind === "failed";
