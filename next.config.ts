import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep browser-test builds separate from the developer's running server.
  distDir: process.env.NEXT_TEST_BUILD === "1" ? ".next-test" : ".next",
};

export default nextConfig;
