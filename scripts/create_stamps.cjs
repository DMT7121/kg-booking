const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');

const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const m = svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/) || svg.match(/href="data:image\/png;base64,([^"]+)"/);
const stagBase64 = m ? m[1] : '';

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hurricane&display=swap" rel="stylesheet">
  <style>
    body { background: #111; color: white; margin: 0; padding: 20px; font-family: sans-serif; }
    .preload-font { font-family: 'Hurricane', cursive; font-size: 140px; position: absolute; left: -9999px; }
  </style>
</head>
<body>
  <div class="preload-font">Chờ cọc Đã cọc</div>
  <h1>Rendering Hurricane Ink-Textured Stamps...</h1>
  <canvas id="paidCanvas" width="800" height="800"></canvas>
  <canvas id="pendingCanvas" width="800" height="800"></canvas>

  <script>
    async function run() {
      // Explicitly load both Latin and Vietnamese subsets of Hurricane
      await document.fonts.load("164px 'Hurricane'", "Chờ cọc Đã cọc");
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 450));

      const stagImg = new Image();
      stagImg.src = "data:image/png;base64,${stagBase64}";
      await new Promise(r => stagImg.onload = r);

      // Compute exact non-empty bounding box of the stag emblem
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = stagImg.width;
      tempCanvas.height = stagImg.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(stagImg, 0, 0);
      const rawData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

      let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
      for (let y = 0; y < tempCanvas.height; y++) {
        for (let x = 0; x < tempCanvas.width; x++) {
          const idx = (y * tempCanvas.width + x) * 4;
          const lum = Math.max(rawData[idx], rawData[idx + 1], rawData[idx + 2]);
          const alpha = rawData[idx + 3];
          const isForeground = alpha < 250 ? alpha > 60 : lum > 80;
          if (isForeground) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;

      function createTintedStag(rgbColor) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = cropW;
        offCanvas.height = cropH;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(stagImg, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        const imgData = offCtx.getImageData(0, 0, cropW, cropH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const a = data[i + 3];
          if (a < 250) {
            const boostedAlpha = a > 35 ? Math.min(255, Math.round(Math.pow(a / 255, 0.58) * 255 * 1.12)) : a;
            data[i] = rgbColor.r;
            data[i + 1] = rgbColor.g;
            data[i + 2] = rgbColor.b;
            data[i + 3] = boostedAlpha;
          } else if (r < 55) {
            data[i + 3] = 0;
          } else {
            const norm = Math.max(0, Math.min(1, (r - 55) / 175));
            const alpha = Math.min(255, Math.round(Math.pow(norm, 0.58) * 255));
            data[i] = rgbColor.r;
            data[i + 1] = rgbColor.g;
            data[i + 2] = rgbColor.b;
            data[i + 3] = alpha;
          }
        }
        offCtx.putImageData(imgData, 0, 0);
        return offCanvas;
      }

      // Deterministic PRNG & Smooth Value Noise
      function mulberry32(a) {
        return function() {
          var t = a += 0x6D2B79F5;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }

      function createNoiseGrid(size, seed) {
        const rng = mulberry32(seed);
        const grid = new Float32Array(size * size);
        for (let i = 0; i < grid.length; i++) grid[i] = rng();
        return { grid, size };
      }

      function sampleNoise(noiseObj, x, y) {
        const { grid, size } = noiseObj;
        const gx = ((x % size) + size) % size;
        const gy = ((y % size) + size) % size;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = (x0 + 1) % size;
        const y1 = (y0 + 1) % size;
        const sx = gx - x0;
        const sy = gy - y0;
        // Quintic Perlin smootherstep: 6t^5 - 15t^4 + 10t^3 (zero hard-edge artifacts)
        const u = sx * sx * sx * (sx * (sx * 6 - 15) + 10);
        const v = sy * sy * sy * (sy * (sy * 6 - 15) + 10);
        const n00 = grid[y0 * size + x0];
        const n10 = grid[y0 * size + x1];
        const n01 = grid[y1 * size + x0];
        const n11 = grid[y1 * size + x1];
        return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
      }

      function fbm(n1, n2, n3, x, y) {
        return (
          0.55 * sampleNoise(n1, x * 0.014, y * 0.014) +
          0.30 * sampleNoise(n2, x * 0.038, y * 0.038) +
          0.15 * sampleNoise(n3, x * 0.095, y * 0.095)
        );
      }

      function drawFourPointStar(ctx, cx, cy, outerR, innerR, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4 - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawClassicFleurOrnament(ctx, cx, cy, dir, color) {
        drawFourPointStar(ctx, cx, cy, 19.5, 6.8, color);
        drawFourPointStar(ctx, cx + dir * 22, cy - 11.0, 7.8, 3.1, color);
        drawFourPointStar(ctx, cx + dir * 22, cy + 11.0, 7.8, 3.1, color);
        drawFourPointStar(ctx, cx + dir * 34, cy, 9.2, 3.4, color);
      }

      function drawStamp(canvas, label, hexColor, rgbColor, seed) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 800, 800);

        // 1. Base vector & typography layer
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = 800;
        baseCanvas.height = 800;
        const bCtx = baseCanvas.getContext('2d');

        function roundRect(c, x, y, w, h, r) {
          c.beginPath();
          c.moveTo(x + r, y);
          c.arcTo(x + w, y, x + w, y + h, r);
          c.arcTo(x + w, y + h, x, y + h, r);
          c.arcTo(x, y + h, x, y, r);
          c.arcTo(x, y, x + w, y, r);
          c.closePath();
        }

        // Bold Authoritative Double Seal Frame
        bCtx.strokeStyle = hexColor;
        bCtx.lineWidth = 21;
        roundRect(bCtx, 34, 34, 732, 732, 48);
        bCtx.stroke();

        bCtx.lineWidth = 8.5;
        roundRect(bCtx, 60, 60, 680, 680, 34);
        bCtx.stroke();

        // Tinted Stag Emblem
        const tintedStag = createTintedStag(rgbColor);
        const sScale = Math.min(485 / cropW, 452 / cropH);
        const sW = Math.round(cropW * sScale);
        const sH = Math.round(cropH * sScale);
        bCtx.drawImage(tintedStag, Math.round((800 - sW) / 2), 78, sW, sH);

        // Google Font "Hurricane" with prominent size (160px), letter-spacing, and heavy bold calligraphy ink weight
        const textY = 648;
        bCtx.save();
        bCtx.fillStyle = hexColor;
        bCtx.strokeStyle = hexColor;
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.font = "400 160px 'Hurricane', cursive";
        if ('letterSpacing' in bCtx) {
          bCtx.letterSpacing = '3px';
        }
        bCtx.lineJoin = 'round';
        bCtx.lineCap = 'round';
        // Bold outer stroke + solid inner fill for unmistakable stamp prominence without closing inner loops
        bCtx.lineWidth = 7.6;
        bCtx.strokeText(label, 400, textY);
        bCtx.fillText(label, 400, textY);

        const metrics = bCtx.measureText(label);
        const halfTextW = metrics.width / 2;
        bCtx.restore();

        // Flanking ornaments with balanced inner-frame & text margins
        const ornamentOffset = Math.min(256, Math.max(halfTextW + 46, 236));
        drawClassicFleurOrnament(bCtx, 400 - ornamentOffset, textY + 6, -1, hexColor);
        drawClassicFleurOrnament(bCtx, 400 + ornamentOffset, textY + 6, 1, hexColor);

        // 2. Crisp Ink Bleed / Halo Layer (Freshly inked seal press)
        const bleedCanvas = document.createElement('canvas');
        bleedCanvas.width = 800;
        bleedCanvas.height = 800;
        const bleedCtx = bleedCanvas.getContext('2d');
        bleedCtx.filter = 'blur(1.4px)';
        bleedCtx.globalAlpha = 0.48;
        bleedCtx.drawImage(baseCanvas, 0, 0);
        bleedCtx.filter = 'blur(3.2px)';
        bleedCtx.globalAlpha = 0.16;
        bleedCtx.drawImage(baseCanvas, 0, 0);
        bleedCtx.filter = 'none';
        bleedCtx.globalAlpha = 1.0;

        ctx.drawImage(bleedCanvas, 0, 0);
        ctx.drawImage(baseCanvas, 0, 0);

        // 3. Rich High-Density Rubber-Stamp Ink Shader (Bold & Prominent, subtle organic texture)
        const n1 = createNoiseGrid(64, seed);
        const n2 = createNoiseGrid(128, seed + 101);
        const n3 = createNoiseGrid(256, seed + 202);
        const nFine = createNoiseGrid(512, seed + 303);
        const rng = mulberry32(seed + 777);

        const srcData = ctx.getImageData(0, 0, 800, 800);
        const dstImg = ctx.createImageData(800, 800);
        const s = srcData.data;
        const d = dstImg.data;

        for (let y = 0; y < 800; y++) {
          const gradPressure = 0.96 + 0.06 * Math.sin((y / 800) * Math.PI * 0.85);
          for (let x = 0; x < 800; x++) {
            const origIdx = (y * 800 + x) * 4;

            // Subtle capillary edge wobble ("lem viền nhẹ")
            const wx = (sampleNoise(n3, x * 0.22, y * 0.22) - 0.5) * 1.8;
            const wy = (sampleNoise(n3, (x + 91) * 0.22, (y + 47) * 0.22) - 0.5) * 1.8;
            const sx = Math.min(799, Math.max(0, Math.round(x + wx)));
            const sy = Math.min(799, Math.max(0, Math.round(y + wy)));
            const dispIdx = (sy * 800 + sx) * 4;

            const aOrig = s[origIdx + 3];
            const aDisp = s[dispIdx + 3];
            const baseAlpha = Math.max(aOrig, Math.round(aDisp * 0.85));
            if (baseAlpha < 4) continue;

            // High-opacity ink transfer: keeps stamp solid & vibrant (88%-100%) with subtle organic variation
            const cloud = fbm(n1, n2, n3, x, y); // ~ 0.15 .. 0.85
            const cornerFade = 0.98 - 0.04 * ((x / 800) * (1 - y / 800));
            const smoothCurve = Math.pow(Math.max(0.0, Math.min(1.0, (cloud - 0.18) / 0.58)), 0.72);
            let inkDensity = (0.87 + 0.22 * smoothCurve) * cornerFade * gradPressure;

            // Subtle paper-fiber micro-pores (never washes out strokes)
            const pore1 = sampleNoise(nFine, x * 0.62, y * 0.62);
            const pore2 = sampleNoise(n3, x * 0.28, y * 0.28);
            if (pore1 < 0.11 && pore2 < 0.26) {
              inkDensity *= 0.78 + (pore1 / 0.11) * 0.18;
            }

            // Extra ink pooling at stroke rims (authentic crisp dark outline of freshly inked stamp)
            const isRim = aOrig > 85 && aOrig < 240;
            if (isRim) {
              inkDensity = Math.min(1.18, inkDensity * 1.15);
            }

            // Deepen pigment where ink pools; never whiten/wash out pigment
            const colorShift = isRim || inkDensity > 0.98 ? -16 : inkDensity > 0.92 ? -8 : 0;

            d[origIdx] = Math.min(255, Math.max(0, rgbColor.r + colorShift));
            d[origIdx + 1] = Math.min(255, Math.max(0, rgbColor.g + colorShift));
            d[origIdx + 2] = Math.min(255, Math.max(0, rgbColor.b + colorShift));
            d[origIdx + 3] = Math.min(255, Math.max(0, Math.round(baseAlpha * Math.min(1.12, inkDensity))));
          }
        }

        // 4. Subtle micro ink-bleed fibers along stroke edges
        for (let y = 12; y < 788; y += 2) {
          for (let x = 12; x < 788; x += 2) {
            const idx = (y * 800 + x) * 4;
            const a = s[idx + 3];
            if (a > 70 && a < 215 && rng() < 0.038) {
              const angle = rng() * Math.PI * 2;
              const dist = 1.0 + rng() * 2.6;
              const tx = Math.round(x + Math.cos(angle) * dist);
              const ty = Math.round(y + Math.sin(angle) * dist);
              const tIdx = (ty * 800 + tx) * 4;
              if (d[tIdx + 3] < 90) {
                d[tIdx] = rgbColor.r;
                d[tIdx + 1] = rgbColor.g;
                d[tIdx + 2] = rgbColor.b;
                d[tIdx + 3] = Math.max(d[tIdx + 3], Math.round(55 + rng() * 90));
              }
            }
          }
        }

        ctx.putImageData(dstImg, 0, 0);
      }

      // Draw Paid (#B41222 rich crimson seal red): "Đã cọc"
      const paidCanvas = document.getElementById('paidCanvas');
      drawStamp(paidCanvas, 'Đã cọc', '#B41222', { r: 180, g: 18, b: 34 }, 2026);

      // Draw Pending (#10357A deep royal cobalt seal blue): "Chờ cọc"
      const pendingCanvas = document.getElementById('pendingCanvas');
      drawStamp(pendingCanvas, 'Chờ cọc', '#10357A', { r: 16, g: 53, b: 122 }, 6202);

      await fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid: paidCanvas.toDataURL('image/png'),
          pending: pendingCanvas.toDataURL('image/png')
        })
      });
      document.body.innerHTML += '<h2>Saved successfully!</h2>';
    }
    run();
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.url === '/render') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.url === '/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const paidBuf = Buffer.from(data.paid.replace(/^data:image\/png;base64,/, ''), 'base64');
      const pendingBuf = Buffer.from(data.pending.replace(/^data:image\/png;base64,/, ''), 'base64');

      fs.writeFileSync('public/images/stamps/paid.png', paidBuf);
      fs.writeFileSync('public/images/stamps/pending.png', pendingBuf);
      console.log('Saved Hurricane ink-stamped paid.png (' + paidBuf.length + 'B) and pending.png (' + pendingBuf.length + 'B)!');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 400);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(9876, () => {
  console.log('Server listening on http://localhost:9876/render');
  const edgePath = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"';
  exec(`${edgePath} --headless --disable-gpu http://localhost:9876/render`, (err) => {
    if (err) console.error('Edge exec error:', err);
  });
});
