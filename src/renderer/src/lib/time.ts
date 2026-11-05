// 時刻の表示（相対時刻・使用枠のリセットまでの時間）

/** 「たった今」「5分前」「3時間前」、1 日より前は日付 */
export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** 狭い所（サイドバーの行）向けの短い経過時間: 今・5分・23時間・3日、それより前は 11/1（「前」は付けない） */
export function shortRelativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}日`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/** リセットまでの表示（5 時間枠は残り時間、週枠は日時） */
export function formatReset(resetsAt: string | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const at = new Date(resetsAt);
  const diffMin = Math.max(0, Math.round((at.getTime() - now) / 60_000));
  if (diffMin < 24 * 60) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `あと ${h > 0 ? `${h}時間` : ""}${m}分でリセット`;
  }
  const date = at.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  const time = at.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time} にリセット`;
}

/** リセットまでの残りを短く（"3日後" / "5時間後" / "12分後"） */
export function resetInShort(resetsAt: string | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const min = Math.max(0, Math.round((new Date(resetsAt).getTime() - now) / 60_000));
  if (min >= 24 * 60) return `${Math.round(min / (24 * 60))}日後`;
  if (min >= 60) return `${Math.round(min / 60)}時間後`;
  return `${min}分後`;
}

/** 時刻だけ（"14:05"） */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/** 日時を、今日・昨日は時刻つきの短い形で（"今日 22:06" / "昨日 21:25" / "10月25日 22:01" / "2025/3/1"）。履歴の表に使う */
export function formatDayTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  const clock = formatClock(iso);
  if (diff === 0) return `今日 ${clock}`;
  if (diff === 1) return `昨日 ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 発言の時刻: 今日なら時刻（"14:05"）、7 日以内なら曜日と時刻（"水曜 14:05"）、それより前は日付（"10月25日" / "2025/3/1"）。
 * 乗せたときの title には、いつでも年月日と時刻を出す（formatFullDateTime）
 */
export function formatMessageTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff <= 0) return formatClock(iso);
  if (diff < 7) return `${"日月火水木金土"[date.getDay()]}曜 ${formatClock(iso)}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** 年月日と時刻（"2026/11/3 14:05"。乗せたときの title に） */
export function formatFullDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${formatClock(iso)}`;
}

/** かかった時間を短く（"8秒" / "1分23秒" / "1時間5分"）。作業中の経過時間・作業にかかった時間に使う */
export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分${sec % 60 ? `${sec % 60}秒` : ""}`;
  return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ""}`;
}

/** 秒まで出す時刻（"08:34:12"） */
const clockWithSeconds = (date: Date) => date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** 日付の部分（今年なら "11/4"、ほかの年は "2025/11/4"） */
const shortDay = (date: Date, now: Date) =>
  date.getFullYear() === now.getFullYear() ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

/** 処理の時刻（秒まで。ツールの実行・思考など）: 今日なら時刻だけ（"08:34:12"）、別の日なら日付も（"11/4 08:34:12" / "2025/11/4 08:34:12"） */
export function formatStamp(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return sameDay(date, now) ? clockWithSeconds(date) : `${shortDay(date, now)} ${clockWithSeconds(date)}`;
}

/**
 * 処理の時間の範囲（"08:34:12 – 08:36:40"）。終わりが始まりと同じ日なら終わりには日付を付けず、日をまたいだら付ける。
 * 始まりと終わりが同じ秒なら 1 つだけ（"08:34:12"）
 */
export function formatStampRange(start: string, end: string, now = new Date()): string {
  const from = new Date(start);
  const to = new Date(end);
  if (sameDay(from, to) && clockWithSeconds(from) === clockWithSeconds(to)) return formatStamp(start, now);
  return `${formatStamp(start, now)} – ${sameDay(from, to) ? clockWithSeconds(to) : `${shortDay(to, now)} ${clockWithSeconds(to)}`}`;
}

/** 実行時間（"8秒" / "1分0秒" / "1時間2分5秒"）。いちばん大きい単位から下はすべて出す（formatElapsed と違い、ちょうどでも下の単位を省かない） */
export function formatRunTime(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

/**
 * 出している開始と終了の時刻の差（秒より下を切り捨てた時刻どうしの差。"13:27:37 – 13:27:38" なら 1秒）。
 * 実際の長さ（0.6 秒など）を切り捨てると、時刻は 1 秒違うのに「0秒」と出て、並べた時刻と合わなかった
 */
export function formatStampRunTime(start: string, end: string): string {
  const seconds = Math.floor(Date.parse(end) / 1000) - Math.floor(Date.parse(start) / 1000);
  return formatRunTime(seconds * 1000);
}

/**
 * 終わった処理の範囲と実行時間（"08:34:12 – 08:36:40 · 2分28秒"。1 件の行の「始めた時刻 · かかった時間」と同じ形）。
 * 実行時間は、並べた開始と終了の時刻の差（formatStampRunTime）。始まりと終わりが同じ秒で時刻が 1 つだけになるときは、実行時間を添えない
 */
export function formatStampRangeWithRunTime(start: string, end: string, now = new Date()): string {
  const range = formatStampRange(start, end, now);
  return range === formatStamp(start, now) ? range : `${range} · ${formatStampRunTime(start, end)}`;
}

/** 年月日と秒までの時刻（"2026/11/5 08:34:12"。処理の時刻に乗せたときの title に） */
export function formatFullStamp(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${clockWithSeconds(date)}`;
}
