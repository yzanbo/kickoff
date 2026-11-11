// 録音（Chromium の MediaRecorder が作る WebM の Opus）を、Ogg の Opus に詰め替える。
// macOS の音声認識は WebM を読めないが、Ogg の Opus は読める。中の音声（Opus のパケット）はそのまま移すので、音は変わらない（ffmpeg も要らない）

/** WebM（Matroska）の要素の ID のうち、ここで見るもの */
const ID = {
  segment: 0x18538067,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  cluster: 0x1f43b675,
  blockGroup: 0xa0,
  block: 0xa1,
  simpleBlock: 0xa3,
} as const;

/** 中に要素が並ぶ要素（大きさが「不明」でも読めるよう、飛ばさずに中へ進む） */
const MASTERS = new Set<number>([ID.segment, ID.tracks, ID.trackEntry, ID.cluster, ID.blockGroup]);

/** WebM から取り出したもの */
export interface OpusStream {
  /** Opus の先頭の情報（OpusHead。チャンネル数・はじめに捨てるサンプル数など） */
  head: Uint8Array;
  /** 音声のパケット（録った順） */
  packets: Uint8Array[];
}

/** 要素の ID（先頭の 1 の位置で長さが決まる。印のビットも含めた値） */
function readId(bytes: Uint8Array, at: number): { value: number; next: number } | null {
  const first = bytes[at];
  if (first === undefined) return null;
  const length = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (length === 0 || at + length > bytes.length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i];
  return { value, next: at + length };
}

/** 長さつきの数（印のビットを除いた値。すべて 1 なら「不明」で null） */
function readVint(bytes: Uint8Array, at: number): { value: number | null; next: number } | null {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (at + length > bytes.length) return null;
  let value = first & (0xff >> length);
  let unknown = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const b = bytes[at + i];
    if (b !== 0xff) unknown = false;
    value = value * 256 + b;
  }
  return { value: unknown ? null : value, next: at + length };
}

/** WebM から Opus のトラックの先頭の情報とパケットを取り出す（Opus のトラックがなければ null） */
export function readWebmOpus(bytes: Uint8Array): OpusStream | null {
  const packets: Uint8Array[] = [];
  let head: Uint8Array | null = null;
  let opusTrack: number | null = null;
  // いま読んでいるトラックの情報（TrackEntry の中の順は決まっていないので、そろったところで決める）
  let entry: { number: number | null; codec: string | null; private: Uint8Array | null } = { number: null, codec: null, private: null };
  const closeEntry = () => {
    if (opusTrack === null && entry.codec === "A_OPUS" && entry.number !== null && entry.private) {
      opusTrack = entry.number;
      head = entry.private;
    }
    entry = { number: null, codec: null, private: null };
  };
  let at = 0;
  while (at < bytes.length) {
    const id = readId(bytes, at);
    const size = id && readVint(bytes, id.next);
    if (!id || !size) break;
    at = size.next;
    if (id.value === ID.trackEntry || id.value === ID.cluster) closeEntry();
    if (MASTERS.has(id.value)) continue;
    // 中身のある要素の大きさが不明・はみ出しているなら、ここまでで終える（録音の途中で切れた最後の要素）
    if (size.value === null || at + size.value > bytes.length) break;
    const body = bytes.subarray(at, at + size.value);
    at += size.value;
    if (id.value === ID.trackNumber) entry.number = body.reduce((n, b) => n * 256 + b, 0);
    else if (id.value === ID.codecId) entry.codec = new TextDecoder().decode(body).replace(/\0+$/, "");
    else if (id.value === ID.codecPrivate) entry.private = body;
    else if (id.value === ID.simpleBlock || id.value === ID.block) {
      // ブロック: トラックの番号・時刻（2 バイト）・フラグ（1 バイト）・音声
      const track = readVint(body, 0);
      if (!track || track.value !== opusTrack || track.next + 3 > body.length) continue;
      // 1 つのブロックにいくつも詰める形（lacing）は、MediaRecorder は使わない
      if (body[track.next + 2] & 0x06) return null;
      packets.push(body.subarray(track.next + 3));
    }
  }
  closeEntry();
  return head && packets.length > 0 ? { head, packets } : null;
}

/** Opus のパケットが持つ音の長さ（48kHz のサンプル数。先頭の 1 バイトで決まる） */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const config = packet[0] >> 3;
  // フレーム 1 つの長さ（48kHz のサンプル数）: SILK は 10 / 20 / 40 / 60ms、混合は 10 / 20ms、CELT は 2.5 / 5 / 10 / 20ms
  const frame = config < 12 ? [480, 960, 1920, 2880][config & 3] : config < 16 ? [480, 960][config & 1] : [120, 240, 480, 960][config & 3];
  const code = packet[0] & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frame * frames;
}

/** Ogg のページの検査の値（CRC-32。多項式 0x04C11DB7・初めの値 0・反転なし） */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let r = i << 24;
  for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  return r >>> 0;
});
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc;
}

/** ページのフラグ（最初のページ・最後のページ） */
const FIRST_PAGE = 0x02;
const LAST_PAGE = 0x04;

/** 1 ページに入れる音声のパケットの数の上限（1 ページがおよそ 1〜3 秒。区切りの数は 255 まで） */
const PACKETS_PER_PAGE = 50;

/** Ogg のページ 1 つ（パケットをまるごと入れる。granule はこのページの最後までのサンプル数） */
function oggPage(packets: Uint8Array[], opts: { flags: number; granule: number; serial: number; sequence: number }): Uint8Array {
  // 区切りの表: パケットごとに 255 を並べ、最後に 255 未満の端数（ちょうど割り切れたら 0）
  const lacing: number[] = [];
  for (const p of packets) {
    for (let rest = p.length; rest >= 255; rest -= 255) lacing.push(255);
    lacing.push(p.length % 255);
  }
  const size = packets.reduce((n, p) => n + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + size);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  page[5] = opts.flags;
  view.setBigUint64(6, BigInt(opts.granule), true);
  view.setUint32(14, opts.serial, true);
  view.setUint32(18, opts.sequence, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const p of packets) {
    page.set(p, at);
    at += p.length;
  }
  view.setUint32(22, oggCrc(page), true);
  return page;
}

/** Opus の説明のパケット（OpusTags。作ったものの名前だけで、コメントはなし） */
function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("Kickoff");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode("OpusTags"));
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  return tags;
}

/** Opus の先頭の情報とパケットを、Ogg のファイルの中身にする */
export function writeOggOpus({ head, packets }: OpusStream): Uint8Array {
  const serial = 0x4b49434b; // "KICK"
  const pages = [oggPage([head], { flags: FIRST_PAGE, granule: 0, serial, sequence: 0 }), oggPage([opusTags()], { flags: 0, granule: 0, serial, sequence: 1 })];
  let granule = 0;
  let group: Uint8Array[] = [];
  let segments = 0;
  const flush = (last: boolean) => {
    if (group.length === 0) return;
    pages.push(oggPage(group, { flags: last ? LAST_PAGE : 0, granule, serial, sequence: pages.length }));
    group = [];
    segments = 0;
  };
  packets.forEach((packet, i) => {
    const need = Math.floor(packet.length / 255) + 1;
    if (group.length >= PACKETS_PER_PAGE || segments + need > 255) {
      flush(false);
    }
    group.push(packet);
    segments += need;
    granule += opusPacketSamples(packet);
    if (i === packets.length - 1) flush(true);
  });
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** WebM の Opus を Ogg の Opus にする（Opus の録音でなければ null） */
export function webmToOgg(bytes: Uint8Array): Uint8Array | null {
  const stream = readWebmOpus(bytes);
  return stream ? writeOggOpus(stream) : null;
}
