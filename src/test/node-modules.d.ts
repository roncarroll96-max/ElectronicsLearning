/**
 * The few Node functions the tests use (they run in Node; the app runs in a
 * browser). Declared here instead of adding Node's types to the whole
 * project, which would mix Node's globals into the browser code's types.
 */
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array;
}
declare module 'node:zlib' {
  export function gunzipSync(data: Uint8Array): Uint8Array;
}
