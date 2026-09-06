/** @type {import('next').NextConfig} */

// Long-term immutable caching for the big static assets under /public.
// NOTE: replacing a model/HDR/audio file later requires a filename bump —
// browsers will not revalidate these for a year.
const IMMUTABLE_ASSET_PATHS = [
  '/models/:path*',
  '/home_models/:path*',
  '/hdr/:path*',
  '/draco/:path*',
  '/audio/:path*',
  '/images/:path*',
  '/fonts/:path*',
];

const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  compiler: {
    // Strip console.* from production bundles (debug logging stays in dev)
    // removeConsole: { exclude: ['error', 'warn'] },
  },
  async headers() {
    return IMMUTABLE_ASSET_PATHS.map((source) => ({
      source,
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    }));
  },
};

export default nextConfig;
