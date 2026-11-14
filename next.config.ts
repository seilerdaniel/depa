/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 👇 ESTO EVITA QUE EL BUILD DE TAURI FALLE
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;