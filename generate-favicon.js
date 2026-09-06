const fs = require('fs');
const path = require('path');

// Simple 32x32 ICO generator with uncompressed BMP bitmap data
function create32x32Ico() {
  const width = 32;
  const height = 32;
  const bpp = 32; // 32-bit BGRA
  const imageSize = width * height * 4;
  const headerSize = 40; // BITMAPINFOHEADER
  const maskSize = (width * height) / 8;
  const totalBmpSize = headerSize + imageSize + maskSize;
  
  // 1. Icon Dir (6 bytes)
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // Reserved
  dir.writeUInt16LE(1, 2); // Type 1 = Icon
  dir.writeUInt16LE(1, 4); // 1 Image

  // 2. Icon Directory Entry (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width, 0);       // Width
  entry.writeUInt8(height, 1);      // Height
  entry.writeUInt8(0, 2);           // Color count (0 for >= 8bpp)
  entry.writeUInt8(0, 3);           // Reserved
  entry.writeUInt16LE(1, 4);        // Color planes
  entry.writeUInt16LE(32, 6);       // Bits per pixel
  entry.writeUInt32LE(totalBmpSize, 8); // Size of image data in bytes
  entry.writeUInt32LE(6 + 16, 12);  // Offset of image data

  // 3. BITMAPINFOHEADER (40 bytes)
  const bih = Buffer.alloc(headerSize);
  bih.writeUInt32LE(40, 0);         // Header size
  bih.writeInt32LE(width, 4);       // Width
  bih.writeInt32LE(height * 2, 8);  // Height * 2 for ICO (XOR + AND masks)
  bih.writeUInt16LE(1, 12);         // Planes
  bih.writeUInt16LE(32, 14);        // Bit count
  bih.writeUInt32LE(0, 16);         // Compression (0 = BI_RGB)
  bih.writeUInt32LE(imageSize, 20); // Image size
  bih.writeInt32LE(0, 24);          // X pixels per meter
  bih.writeInt32LE(0, 28);          // Y pixels per meter
  bih.writeUInt32LE(0, 32);         // Colors used
  bih.writeUInt32LE(0, 36);         // Important colors

  // 4. Pixel Data (32x32 BGRA, Bottom-up)
  const pixels = Buffer.alloc(imageSize);
  
  // Draw TRADEWH Logo Icon
  // Colors: BG = #1C212D (B=45, G=33, R=28, A=255)
  // Border = #CBB193 (B=147, G=177, R=203)
  // Trendline = #CBB193 / #FFFFFF
  // Dot = #FFFFFF
  
  // Trendline points in (x, y) [0..31, 0..31 with (0,0) top-left]
  // Invert y for bottom-up BMP
  const points = [
    { x: 6, y: 19 },
    { x: 11, y: 24 },
    { x: 16, y: 13 },
    { x: 20, y: 19 },
    { x: 26, y: 8 }
  ];

  function drawThickLine(p1, p2, color, thickness = 2.2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.ceil(dist * 5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const curX = p1.x + (p2.x - p1.x) * t;
      const curY = p1.y + (p2.y - p1.y) * t;
      for (let ox = -Math.ceil(thickness); ox <= Math.ceil(thickness); ox++) {
        for (let oy = -Math.ceil(thickness); oy <= Math.ceil(thickness); oy++) {
          if (Math.hypot(ox, oy) <= thickness / 2) {
            const px = Math.round(curX + ox);
            const py = Math.round(curY + oy);
            if (px >= 1 && px <= 30 && py >= 1 && py <= 30) {
              const bmpY = 31 - py;
              const idx = (bmpY * 32 + px) * 4;
              pixels[idx + 0] = color.b;
              pixels[idx + 1] = color.g;
              pixels[idx + 2] = color.r;
              pixels[idx + 3] = color.a;
            }
          }
        }
      }
    }
  }

  // Fill background with rounded corner rectangle
  for (let py = 0; py < 32; py++) {
    for (let px = 0; px < 32; px++) {
      const bmpY = 31 - py;
      const idx = (bmpY * 32 + px) * 4;
      
      // Corner radius check (radius 6)
      const r = 6;
      let inCorner = false;
      if (px < r && py < r && Math.hypot(px - r, py - r) > r) inCorner = true;
      if (px >= 32 - r && py < r && Math.hypot(px - (31 - r), py - r) > r) inCorner = true;
      if (px < r && py >= 32 - r && Math.hypot(px - r, py - (31 - r)) > r) inCorner = true;
      if (px >= 32 - r && py >= 32 - r && Math.hypot(px - (31 - r), py - (31 - r)) > r) inCorner = true;

      if (inCorner) {
        pixels[idx + 0] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0; // Transparent
      } else {
        // Check border
        const isBorder = (px === 1 || px === 30 || py === 1 || py === 30 ||
          (px < r && py < r && Math.abs(Math.hypot(px - r, py - r) - r) < 1.2) ||
          (px >= 32 - r && py < r && Math.abs(Math.hypot(px - (31 - r), py - r) - r) < 1.2) ||
          (px < r && py >= 32 - r && Math.abs(Math.hypot(px - r, py - (31 - r)) - r) < 1.2) ||
          (px >= 32 - r && py >= 32 - r && Math.abs(Math.hypot(px - (31 - r), py - (31 - r)) - r) < 1.2)
        );

        if (isBorder) {
          pixels[idx + 0] = 147; // B (#CBB193)
          pixels[idx + 1] = 177; // G
          pixels[idx + 2] = 203; // R
          pixels[idx + 3] = 255; // Alpha
        } else {
          pixels[idx + 0] = 45;  // B (#1C212D)
          pixels[idx + 1] = 33;  // G
          pixels[idx + 2] = 28;  // R
          pixels[idx + 3] = 255; // Alpha
        }
      }
    }
  }

  // Draw 'W' trendline
  for (let i = 0; i < points.length - 1; i++) {
    const isLast = (i === points.length - 2);
    const col = isLast ? { r: 255, g: 255, b: 255, a: 255 } : { r: 203, g: 177, b: 147, a: 255 };
    drawThickLine(points[i], points[i+1], col, 2.5);
  }

  // Draw breakout point dot at peak (26, 8)
  const peak = points[4];
  for (let ox = -3; ox <= 3; ox++) {
    for (let oy = -3; oy <= 3; oy++) {
      if (Math.hypot(ox, oy) <= 2.8) {
        const px = peak.x + ox;
        const py = peak.y + oy;
        if (px >= 0 && px < 32 && py >= 0 && py < 32) {
          const bmpY = 31 - py;
          const idx = (bmpY * 32 + px) * 4;
          pixels[idx + 0] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  // 5. AND Mask (all 0 for 32-bit transparent BGRA)
  const mask = Buffer.alloc(maskSize, 0);

  const icoBuffer = Buffer.concat([dir, entry, bih, pixels, mask]);
  
  // Write to public/favicon.ico and src/app/favicon.ico
  const publicPath = path.join(__dirname, 'public', 'favicon.ico');
  const appPath = path.join(__dirname, 'src', 'app', 'favicon.ico');
  
  fs.writeFileSync(publicPath, icoBuffer);
  fs.writeFileSync(appPath, icoBuffer);
  console.log('✅ Generated favicon.ico successfully for both public/ and src/app/!');
}

create32x32Ico();
