declare global {
  interface CloudflareEnv {
    /** Optional Cloudflare KV binding used by the shared weather snapshot. */
    WEATHER_SNAPSHOTS?: KVNamespace;
    /** Bearer secret accepted only by the internal scheduled refresh route. */
    WEATHER_REFRESH_SECRET?: string;
  }
}

export {};
