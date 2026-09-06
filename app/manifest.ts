import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'شهر امید - شوروم مجازی مبلمان',
    short_name: 'شهر امید',
    description: 'نمایشگاه سه‌بعدی مبلمان با واقعیت افزوده',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a1120',
    theme_color: '#172236',
    icons: [
      {
        src: '/images/pwa-logo.jpeg',
        sizes: '1254x1254',
        type: 'image/jpeg',
      },
    ],
  }
}
