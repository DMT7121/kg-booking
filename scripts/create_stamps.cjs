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
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@700;800;900&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap" rel="stylesheet">
  <style>
    body { background: #111; color: white; margin: 0; padding: 20px; font-family: sans-serif; }
  </style>
</head>
<body>
  <h1>Rendering Luxury Stamps & Brand Logo...</h1>
  <canvas id="paidCanvas" width="800" height="800"></canvas>
  <canvas id="pendingCanvas" width="800" height="800"></canvas>
  <canvas id="logoCanvas" width="800" height="740"></canvas>

  <script>
    async function run() {
      await Promise.all([
        document.fonts.load("800 66px 'Playfair Display'"),
        document.fonts.load("700 66px 'Playfair Display'")
      ]);
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 350));

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
          // Support both white-on-black mask and alpha-cropped stag
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
            // Already alpha masked
            data[i] = rgbColor.r;
            data[i + 1] = rgbColor.g;
            data[i + 2] = rgbColor.b;
          } else if (r < 60) {
            data[i + 3] = 0;
          } else {
            const alpha = Math.min(255, Math.round(((r - 60) / 195) * 255));
            data[i] = rgbColor.r;
            data[i + 1] = rgbColor.g;
            data[i + 2] = rgbColor.b;
            data[i + 3] = alpha;
          }
        }
        offCtx.putImageData(imgData, 0, 0);
        return offCanvas;
      }

      // 1. Render Tightly-Cropped Brand Logo (#0f172a deep slate-navy)
      const logoCanvas = document.getElementById('logoCanvas');
      const logoCtx = logoCanvas.getContext('2d');
      logoCtx.clearRect(0, 0, 800, 740);
      const tintedLogo = createTintedStag({ r: 15, g: 23, b: 42 });
      const scale = Math.min(764 / cropW, 708 / cropH);
      const drawW = Math.round(cropW * scale);
      const drawH = Math.round(cropH * scale);
      logoCtx.drawImage(tintedLogo, Math.round((800 - drawW) / 2), Math.round((740 - drawH) / 2), drawW, drawH);

      // 2. Render Luxury Stamps ("ĐÃ CỌC" & "CHỜ CỌC")
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

      function drawSideOrnament(ctx, cx, cy, dir, color) {
        drawFourPointStar(ctx, cx, cy, 17, 5.8, color);
        drawFourPointStar(ctx, cx + dir * 24, cy, 7.5, 2.8, color);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + dir * 38, cy);
        ctx.lineTo(cx + dir * 64, cy);
        ctx.stroke();
        ctx.restore();
      }

      function drawStamp(canvas, label, hexColor, rgbColor) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 800, 800);

        function roundRect(x, y, w, h, r) {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        }

        // Draw Outer Border
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 14;
        roundRect(35, 35, 730, 730, 48);
        ctx.stroke();

        // Draw Inner Border
        ctx.lineWidth = 5;
        roundRect(55, 55, 690, 690, 36);
        ctx.stroke();

        // Draw Tinted Stag on Canvas
        const tintedStag = createTintedStag(rgbColor);
        const sScale = Math.min(490 / cropW, 470 / cropH);
        const sW = Math.round(cropW * sScale);
        const sH = Math.round(cropH * sScale);
        ctx.drawImage(tintedStag, Math.round((800 - sW) / 2), 92, sW, sH);

        // Draw Refined Editorial Serif Text: "ĐÃ CỌC" / "CHỜ CỌC"
        const textY = 664;
        ctx.save();
        ctx.fillStyle = hexColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "800 66px 'Playfair Display', Georgia, serif";
        if ('letterSpacing' in ctx) {
          ctx.letterSpacing = '5px';
        }
        ctx.fillText(label, 403, textY);
        const metrics = ctx.measureText(label);
        const halfTextW = metrics.width / 2;
        ctx.restore();

        // Symmetrical side ornaments
        const ornamentOffset = Math.max(halfTextW + 44, 210);
        drawSideOrnament(ctx, 400 - ornamentOffset, textY - 2, -1, hexColor);
        drawSideOrnament(ctx, 400 + ornamentOffset, textY - 2, 1, hexColor);
      }

      // Draw Paid (#961825 crimson red)
      const paidCanvas = document.getElementById('paidCanvas');
      drawStamp(paidCanvas, 'ĐÃ CỌC', '#961825', { r: 150, g: 24, b: 37 });

      // Draw Pending (#1c365d deep navy)
      const pendingCanvas = document.getElementById('pendingCanvas');
      drawStamp(pendingCanvas, 'CHỜ CỌC', '#1c365d', { r: 28, g: 54, b: 93 });

      await fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid: paidCanvas.toDataURL('image/png'),
          pending: pendingCanvas.toDataURL('image/png'),
          logo: logoCanvas.toDataURL('image/png')
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
      const logoBase64 = data.logo.replace(/^data:image\/png;base64,/, '');

      fs.writeFileSync('public/images/stamps/paid.png', paidBuf);
      fs.writeFileSync('public/images/stamps/pending.png', pendingBuf);

      const cleanBrandSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="740" viewBox="0 0 800 740" preserveAspectRatio="xMidYMid meet"><image width="800" height="740" href="data:image/png;base64,${logoBase64}" xlink:href="data:image/png;base64,${logoBase64}"/></svg>`;
      fs.writeFileSync('public/images/brand-logo.svg', cleanBrandSvg);

      console.log('Saved paid.png (' + paidBuf.length + 'B), pending.png (' + pendingBuf.length + 'B), and brand-logo.svg (' + cleanBrandSvg.length + 'B)!');

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
