/** 制限をオフにしたチャットの入力欄に出す文（画面とスマホで同じ内容） */
export function restrictionNotice(sandboxEnabled: boolean | undefined, editScopeEnabled: boolean | undefined, draft = false): string {
  const off = [sandboxEnabled === false ? "コマンドのサンドボックス" : null, editScopeEnabled === false ? "編集先の制限" : null].filter((label): label is string => label !== null);
  if (!off.length) return "";
  return `${draft ? "新しいチャットの既定" : "このチャット"}: ${off.join("・")}は通常時オフです。計画モードなどでは別の制限がかかります。`;
}
