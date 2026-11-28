// 版の見せ方（設定の「Kickoff について」と、メニューの「Kickoff について」の窓で同じ文にする）
import { BUILD_KIND_LABELS, type BuildInfo, type BuildStamp } from "./types";

/** 版のあとに添える括弧の中（ビルド番号・短い SHA・作り方）。何もなければ null */
export function buildDetail(stamp: BuildStamp): string | null {
  const parts = [stamp.buildNumber === null ? null : `ビルド ${stamp.buildNumber}`, stamp.commit, BUILD_KIND_LABELS[stamp.kind]].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join("・") : null;
}

/** 1 行の版の文（「0.1.0-beta.1（ビルド 812・1a2b3c4・手元ビルド）」） */
export function buildLabel(info: BuildInfo): string {
  const detail = buildDetail(info);
  return detail === null ? info.version : `${info.version}（${detail}）`;
}
