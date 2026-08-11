import denoJson from '../deno.json' with { type: 'json' };

/**
 * The version this build reports.
 *
 * Read from deno.json rather than kept alongside it, so releasing is still a
 * one-line change and a compiled binary can't disagree with the package it
 * came from. JSON imports are part of the module graph, so `deno compile`
 * bakes the value in.
 */
export const VERSION: string = denoJson.version;
