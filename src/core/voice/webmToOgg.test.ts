// 録音の詰め替え（WebM の Opus → Ogg の Opus）
import assert from "node:assert/strict";
import { test } from "node:test";
import { oggCrc, opusPacketSamples, readWebmOpus, webmToOgg } from "./webmToOgg.js";

/** WebM の要素 1 つ（size を省けば中身の長さ。"unknown" なら、MediaRecorder が書く「大きさ不明」） */
function element(id: number[], body: Uint8Array | number[], size?: "unknown"): Uint8Array {
  const data = Uint8Array.from(body);
  const length = size === "unknown" ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] : data.length < 127 ? [0x80 | data.length] : [0x40 | (data.length >> 8), data.length & 0xff];
  return Uint8Array.from([...id, ...length, ...data]);
}
const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
const text = (s: string) => new TextEncoder().encode(s);

/** OpusHead（モノラル・48kHz） */
const HEAD = Uint8Array.from([...text("OpusHead"), 1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
/** ブロック（トラック 1・時刻・フラグのあとに音声） */
const block = (packet: number[], track = 1) => element([0xa3], [0x80 | track, 0, 0, 0x80, ...packet]);

/** MediaRecorder が作る形の WebM（Segment と Cluster は大きさ不明） */
function webm(packets: number[][], codec = "A_OPUS"): Uint8Array {
  const track = element([0xae], join(element([0xd7], [1]), element([0x86], text(codec)), element([0x63, 0xa2], HEAD)));
  return join(
    element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x82], text("webm"))),
    element([0x18, 0x53, 0x80, 0x67], [], "unknown"),
    element([0x16, 0x54, 0xae, 0x6b], track),
    element([0x1f, 0x43, 0xb6, 0x75], [], "unknown"),
    element([0xe7], [0]),
    ...packets.map((p) => block(p)),
  );
}

/** Ogg のページを読む（詰め替えた結果の確かめ） */
function pages(ogg: Uint8Array) {
  const out: { flags: number; granule: number; sequence: number; packets: Uint8Array[]; crcOk: boolean }[] = [];
  for (let at = 0; at < ogg.length; ) {
    assert.equal(new TextDecoder().decode(ogg.subarray(at, at + 4)), "OggS");
    const view = new DataView(ogg.buffer, ogg.byteOffset + at);
    const count = ogg[at + 26];
    const lacing = [...ogg.subarray(at + 27, at + 27 + count)];
    const size = lacing.reduce((n, v) => n + v, 0);
    const page = ogg.slice(at, at + 27 + count + size);
    const crc = view.getUint32(22, true);
    page.set([0, 0, 0, 0], 22);
    const packets: Uint8Array[] = [];
    let start = 27 + count;
    let length = 0;
    for (const v of lacing) {
      length += v;
      if (v < 255) {
        packets.push(page.subarray(start, start + length));
        start += length;
        length = 0;
      }
    }
    out.push({ flags: ogg[at + 5], granule: Number(view.getBigUint64(6, true)), sequence: view.getUint32(18, true), packets, crcOk: oggCrc(page) === crc });
    at += page.length;
  }
  return out;
}

test("Opus のパケットの長さ: 先頭の 1 バイトから 48kHz のサンプル数を出す", () => {
  // CELT 20ms・フレーム 1 つ
  assert.equal(opusPacketSamples(Uint8Array.from([0xf8, 1])), 960);
  // SILK 60ms・フレーム 1 つ
  assert.equal(opusPacketSamples(Uint8Array.from([0x18, 1])), 2880);
  // 混合 10ms・フレーム 2 つ
  assert.equal(opusPacketSamples(Uint8Array.from([0x61, 1])), 960);
  // CELT 20ms・フレームの数を 2 バイト目に書く形（3 つ）
  assert.equal(opusPacketSamples(Uint8Array.from([0xfb, 3])), 2880);
  assert.equal(opusPacketSamples(new Uint8Array()), 0);
});

test("Ogg の検査の値: 決まった入力の値と合う", () => {
  assert.equal(oggCrc(text("123456789")), 0x89a1897f);
});

test("WebM の Opus を読む: 大きさ不明の Segment・Cluster の中から、Opus のトラックの先頭の情報とパケットを取り出す", () => {
  const stream = readWebmOpus(webm([[0xf8, 1, 2], [0xf8, 3]]));
  assert.deepEqual(stream?.head, HEAD);
  assert.deepEqual(stream?.packets.map((p) => [...p]), [[0xf8, 1, 2], [0xf8, 3]]);
  // ほかのトラックのブロックは入れない。途中で切れた最後のブロックは捨てる
  const mixed = join(webm([[0xf8, 1]]), block([0xf8, 9], 2), Uint8Array.from([0xa3, 0x90, 0x81, 0, 0]));
  assert.deepEqual(readWebmOpus(mixed)?.packets.map((p) => [...p]), [[0xf8, 1]]);
  // Opus でない・音声がない・WebM でないものは null
  assert.equal(readWebmOpus(webm([[1, 2]], "A_VORBIS")), null);
  assert.equal(readWebmOpus(webm([])), null);
  assert.equal(readWebmOpus(Uint8Array.from([1, 2, 3])), null);
});

test("Ogg に詰め替える: 先頭の情報・説明・音声のページの順に、パケットはそのまま、位置はサンプル数の合計、最後のページに終わりの印", () => {
  // 20ms のパケットを 120 個（50 個ごとにページを分ける）。1 つは 255 バイトちょうど・1 つは 300 バイト
  const packets = Array.from({ length: 120 }, (_, i) => [0xf8, ...new Array<number>(i === 3 ? 254 : i === 4 ? 299 : 5).fill(i)]);
  const ogg = webmToOgg(webm(packets));
  assert.ok(ogg);
  const read = pages(ogg);
  assert.ok(read.every((p) => p.crcOk));
  assert.deepEqual(read.map((p) => p.sequence), [0, 1, 2, 3, 4]);
  assert.deepEqual(read.map((p) => p.flags), [2, 0, 0, 0, 4]);
  assert.deepEqual(read[0].packets, [HEAD]);
  assert.equal(new TextDecoder().decode(read[1].packets[0].subarray(0, 8)), "OpusTags");
  assert.deepEqual(read.map((p) => p.granule), [0, 0, 50 * 960, 100 * 960, 120 * 960]);
  assert.deepEqual(read.slice(2).flatMap((p) => p.packets.map((packet) => [...packet])), packets);
  assert.equal(webmToOgg(Uint8Array.from([1, 2, 3])), null);
});
