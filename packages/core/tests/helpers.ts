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

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/**
 * A fetch for the vendor SDKs under LangChain that replays recordings in order and keeps
 * what was sent. No network.
 */
export function replayFetch(recordings: Recording[]): { fetch: typeof fetch; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const queue = [...recordings];
  const replay = async (input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    sent.push({ url, headers, body: JSON.parse(String(init?.body ?? "{}")) });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected extra request to ${url}`);
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: Object.assign(replay, { preconnect: () => undefined }) as typeof fetch, sent };
}

export const failingFetch = Object.assign(
  async () => {
    throw new TypeError("Failed to fetch");
  },
  { preconnect: () => undefined },
) as typeof fetch;
