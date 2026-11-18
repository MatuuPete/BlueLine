import type { MetadataRoute } from 'next';

// PWA manifest (spec §7). Colors are the --chrome / --bg tokens; manifests cannot read CSS.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BlueLine',
    short_name: 'BlueLine',
    description: 'NBA player props, read against the line. Research only, not betting advice.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#06122b',
    theme_color: '#012169',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
