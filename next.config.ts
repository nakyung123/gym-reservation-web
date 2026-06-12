import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 외부 이미지(운영 배너 등)는 Supabase Storage public URL을 쓴다.
    // next/image 최적화를 위해 해당 호스트를 허용한다.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
