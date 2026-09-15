import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  //不顯示GET/POST字樣在終端
  logging: {
    incomingRequests: false,
  },
};

export default nextConfig;
