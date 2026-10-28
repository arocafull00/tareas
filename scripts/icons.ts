import sharp from 'sharp';

const svg = 'assets/icon.svg';
const full = (size: number, out: string) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);

async function padded(size: number, out: string, scale: number, background: string) {
  const inner = Math.round(size * scale);
  const icon = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(out);
}

await Promise.all([
  full(192, 'public/icon-192.png'),
  full(512, 'public/icon-512.png'),
  full(32, 'app/icon.png'),
  padded(512, 'public/icon-maskable-512.png', 0.8, '#5b5bf0'),
  padded(180, 'app/apple-icon.png', 0.9, '#f6f5f3'),
]);
