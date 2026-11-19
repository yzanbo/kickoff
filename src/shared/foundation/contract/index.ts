// 取り決め（HTTP・SSE）の部品の入口（名前を並べて出すだけ。使う所ができたものから並べる）
export type { Same } from "./phantom";
export { blob, empty, route, splitKey, sse } from "./route";
export type { Access, BodyOf, Contract, Method, ParamNames, PathOf, QueryOf, ResOf, RouteKey, RouteKind, RouteSpec } from "./route";
