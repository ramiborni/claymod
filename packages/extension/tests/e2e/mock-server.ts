import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const fixturesDir = path.resolve(import.meta.dirname, "../fixtures");

/** What the fake model answers with. Tests replace it per scenario. */
export interface MockModel {
  status: number;
  /** Raw message content for a 200 answer, or the error body. */
  content: string;
}

export interface MockServer {
  origin: string;
  model: MockModel;
  /** Chat Completions request bodies received, newest last. */
  requests: Array<{ messages: Array<{ role: string; content: string }>; [key: string]: unknown }>;
  close(): Promise<void>;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body;
}

function completion(content: string) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: 0,
    model: "mock-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

/** Serves synthetic fixture pages and a fake OpenAI-compatible model on 127.0.0.1. */
export async function startMockServer(): Promise<MockServer> {
  const state: Omit<MockServer, "origin" | "close"> = {
    model: { status: 200, content: "{}" },
    requests: [],
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") return response.writeHead(204, CORS).end();
    if (url.pathname.startsWith("/fixtures/")) {
      const file = path.join(fixturesDir, path.basename(url.pathname));
      const html = await readFile(file, "utf8").catch(() => undefined);
      return html
        ? response.writeHead(200, { "content-type": "text/html" }).end(html)
        : response.writeHead(404).end();
    }
    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      state.requests.push(JSON.parse(await readBody(request)));
      const { status, content } = state.model;
      const body = status === 200 ? completion(content) : JSON.parse(content);
      return response
        .writeHead(status, { ...CORS, "content-type": "application/json" })
        .end(JSON.stringify(body));
    }
    response.writeHead(404).end();
  };
  const server = createServer((request, response) => void handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(state, {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}
