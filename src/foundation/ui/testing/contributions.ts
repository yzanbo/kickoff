import { onTestFinished } from "vitest";
import { swapContributions, type Contribution } from "@/foundation/ui/points";

/** テストの中だけ拡張点に入れる（テストが終わったら、入れる前に戻す。テストどうしで登録を残さない） */
export function useTestContributions(list: readonly Contribution<unknown>[]): void {
  onTestFinished(swapContributions(list));
}
