import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Playwright and local devices may reach the dev server through the loopback IP.
	allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
