/** 랜딩은 서버 없이 정적 파일(out/)로 내보내 어디서나 호스팅할 수 있게 한다. */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
