// 更新の様子の読み方（メインの移り変わり updateModel.ts と、画面の帯・設定の節が同じ決まりで読む）
import type { UpdateState } from "./types";

/** 新しい版を持っている様子 */
export type UpdateWithVersion = Extract<UpdateState, { version: string }>;
export const hasUpdateVersion = (s: UpdateState): s is UpdateWithVersion => "version" in s;

/** 様子の新しい版（なければ null） */
export const updateVersionOf = (s: UpdateState): string | null => (hasUpdateVersion(s) ? s.version : null);

/** 確かめない様子（ダウンロード中・開き直すのを待っている・入れている間は、確かめ直さない） */
export const blocksCheck = (s: UpdateState): boolean => s.kind === "downloading" || s.kind === "waiting" || s.kind === "installing";

/** 「アップデートを確認」を押せない様子（確かめている間と、確かめない様子） */
export const checkDisabled = (s: UpdateState): boolean => s.kind === "checking" || blocksCheck(s);
