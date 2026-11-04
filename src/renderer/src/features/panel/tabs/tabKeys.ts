/**
 * 新しいタブ・ペインのキー（"<prefix>:<時刻>:<乱数>"）。右のパネルのターミナルのタブと、下のパネルのタブ・ペインで同じ形。
 * ターミナルのキーは裏のシェルのキーにも使うので、同じ瞬間に 2 つ作っても重ならないよう乱数を添える
 */
export const newTabKey = (prefix: string) => `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
