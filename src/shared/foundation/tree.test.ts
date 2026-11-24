import assert from "node:assert/strict";
import { test } from "vitest";
import { ancestors, TREE_MAX_DEPTH, walkDown } from "./tree";

/** 親の ID で引く木（0 は根の印） */
const parents = (pairs: [number, number][]) => {
  const parent = new Map(pairs);
  const children = new Map<number, number[]>();
  for (const [id, p] of pairs) children.set(p, [...(children.get(p) ?? []), id]);
  return { parentOf: (id: number) => parent.get(id) || undefined, childrenOf: (id: number) => children.get(id) ?? [] };
};

test("ancestors: 根 → 親の順に返し、自分は入れない（親が分からなければそこまで）", () => {
  const { parentOf } = parents([[1, 0], [2, 1], [3, 2], [5, 9]]);
  assert.deepEqual(ancestors(3, parentOf), [1, 2]);
  assert.deepEqual(ancestors(1, parentOf), []);
  assert.deepEqual(ancestors(5, parentOf), [9]);
});

test("ancestors: 輪になっても止まり、深さの上限より上へは行かない", () => {
  const ring = parents([[1, 2], [2, 3], [3, 1]]);
  assert.deepEqual(ancestors(1, ring.parentOf), [3, 2]);
  const chain = parents(Array.from({ length: 50 }, (_, i) => [i + 2, i + 1] as [number, number]));
  assert.equal(ancestors(51, chain.parentOf).length, TREE_MAX_DEPTH);
  assert.deepEqual(ancestors(51, chain.parentOf, { max: 2 }), [49, 50]);
});

test("ancestors: key で同じものを見分ける（引くたびに別の物になる木）", () => {
  const nodes = (id: number) => ({ id, parent: id === 1 ? 2 : 1 });
  assert.deepEqual(ancestors(nodes(1), (n) => nodes(n.parent), { key: (n) => n.id }).map((n) => n.id), [2]);
});

test("walkDown: 親のすぐ下に子が続く順に、深さ（根が 0）を添えて通る", () => {
  const { childrenOf } = parents([[1, 0], [2, 1], [3, 1], [4, 2], [5, 0]]);
  const got: string[] = [];
  walkDown([1, 5], childrenOf, (id, depth) => void got.push(`${id}:${depth}`));
  assert.deepEqual(got, ["1:0", "2:1", "4:2", "3:1", "5:0"]);
});

test("walkDown: visit が false ならその下へ行かない・seen に渡したものと輪は通らない・深さの上限で止まる", () => {
  const { childrenOf } = parents([[1, 0], [2, 1], [3, 2], [4, 1]]);
  const got: number[] = [];
  walkDown([1], childrenOf, (id) => (got.push(id), id === 2 ? false : undefined));
  assert.deepEqual(got, [1, 2, 4]);
  const ring = parents([[1, 2], [2, 1]]);
  const inRing: number[] = [];
  walkDown(ring.childrenOf(1), ring.childrenOf, (id) => void inRing.push(id), { seen: [1] });
  assert.deepEqual(inRing, [2]);
  const chain = parents(Array.from({ length: 50 }, (_, i) => [i + 2, i + 1] as [number, number]));
  let deepest = 0;
  walkDown([1], chain.childrenOf, (_, depth) => void (deepest = Math.max(deepest, depth)));
  assert.equal(deepest, TREE_MAX_DEPTH);
});
