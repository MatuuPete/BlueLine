import { ImageResponse } from 'next/og';

// PNG app icons for the manifest: the logo mark (a tiny last-10 strip around a line).
// Raster output cannot read CSS variables, so the --logo-* token values are inlined here.
const TILE = '#00539b';
const BAR = '#ffffff';
const BAR2 = '#8fb8e6';
const SIZES = new Set([180, 192, 512]);

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [...SIZES].map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });
  const u = size / 28; // the mark is drawn on a 28-unit grid
  const rect = (x: number, y: number, w: number, h: number, color: string) => (
    <div
      style={{
        position: 'absolute',
        left: x * u,
        top: y * u,
        width: w * u,
        height: h * u,
        background: color,
        borderRadius: Math.max(1, u * 0.6),
      }}
    />
  );
  return new ImageResponse(
    <div
      style={{ width: size, height: size, display: 'flex', position: 'relative', background: TILE }}
    >
      {rect(6, 6, 3, 8, BAR)}
      {rect(12.5, 14, 3, 6, BAR2)}
      {rect(19, 8, 3, 6, BAR)}
      {rect(4, 13.5, 20, 1.2, BAR)}
    </div>,
    { width: size, height: size },
  );
}
