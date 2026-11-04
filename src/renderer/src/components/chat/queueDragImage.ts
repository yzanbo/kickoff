/**
 * 送信待ちのドラッグの絵（小さな札）。カーソルの右下に少し離して出し、カーソルの位置に出る「入る位置の線」に被せない
 * （以前は行全体を写した絵をつかんだ位置に重ねていたので、すぐ下の線が絵に隠れて、どこに入るか見えなかった）。
 * kind: row = 1 件（文の初めの行）/ many = まとめて動かす（「n 件を移動」）/ stop = 「ここまで送ったら止めます」の印
 */
export function setQueueDragImage(dataTransfer: DataTransfer, label: string, kind: "row" | "many" | "stop") {
  // 外側は透明の余白（左上）だけで、札を余白の分だけカーソルから右下へずらす
  const wrap = document.createElement("div");
  wrap.className = "queued-drag-image";
  const badge = document.createElement("div");
  badge.className = `queued-drag-badge ${kind}`;
  badge.textContent = label;
  wrap.appendChild(badge);
  document.body.appendChild(wrap);
  dataTransfer.setDragImage(wrap, 0, 0);
  // 絵を写したらすぐ消す
  setTimeout(() => wrap.remove(), 0);
}
