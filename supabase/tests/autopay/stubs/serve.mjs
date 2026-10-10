// Stand-in voor deno.land/std/http/server.ts: de handler wordt niet gestart
// maar bewaard, zodat run.mjs hem met een Request kan aanroepen.
export function serve(handler) {
  globalThis.__handler = handler;
}
