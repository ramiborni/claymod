// Preloaded by `bun test` (see bunfig.toml). Unit tests must never touch the network:
// providers are tested with recorded responses passed in as `fetch`.
globalThis.fetch = Object.assign(
  async (input: unknown) => {
    throw new Error(`Unit tests must not use the network (tried to fetch ${String(input)}).`);
  },
  { preconnect: () => undefined },
) as typeof fetch;
