import type { FetchLike } from "../src/providers/types";

export interface Recording {
  status: number;
  body: unknown;
}

export interface SentRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export async function loadRecording(path: string): Promise<Recording> {
  return Bun.file(new URL(`./recordings/${path}`, import.meta.url)).json();
}

/** A fetch that replays recordings in order and keeps what was sent. No network. */
export function replayFetch(recordings: Recording[]): { fetch: FetchLike; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const queue = [...recordings];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected extra request to ${url}`);
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => text,
    };
  };
  return { fetch, sent };
}

export const failingFetch: FetchLike = async () => {
  throw new TypeError("Failed to fetch");
};
