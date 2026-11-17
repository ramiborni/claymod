import * as z from "zod";

/**
 * Extension pages forbid eval/new Function (MV3 CSP). Zod would probe for it on first use and
 * log a CSP violation; jitless mode skips the probe. Call once at the top of each entrypoint.
 */
export function useJitlessZod(): void {
  z.config({ jitless: true });
}
