import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */

// Long-term immutable caching for the big static assets under /public.
// NOTE: replacing a model/HDR/audio file later requires a filename bump —
// browsers will not revalidate these for a year.
const IMMUTABLE_ASSET_PATHS = [
  '/models/:path*',
  '/store-models/:path*',
  // Where scripts/optimize-glb.sh writes. Both the store manifest and the
  // product presentation manifest point their heavy GLBs here, so it was the
  // one asset root actually being re-downloaded. @see public/config/stores.json
  '/ktx-optimized/:path*',
  '/home_models/:path*',
  '/hdr/:path*',
  '/draco/:path*',
  // The Basis transcoder, fetched once per session before the first KTX2
  // texture can be read. @see lib/three/gltfLoaders.ts
  '/basis/:path*',
  '/textures/:path*',
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

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

export default withNextIntl(nextConfig);
