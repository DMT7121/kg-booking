const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');

const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const m = svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
const stagBase64 = m ? m[1] : '';

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Playfair+Display:ital,wght@1,700&display=swap" rel="stylesheet">
  <style>
    body { background: #111; color: white; margin: 0; padding: 20px; font-family: sans-serif; }
  </style>
</head>
<body>
  <h1>Rendering Stamps...</h1>
  <canvas id="paidCanvas" width="800" height="800"></canvas>
  <canvas id="pendingCanvas" width="800" height="800"></canvas>

  <script>
    async function run() {
      await document.fonts.ready;
      
      const stagImg = new Image();
      stagImg.src = "data:image/png;base64,${stagBase64}";
      await new Promise(r => stagImg.onload = r);

      function drawStamp(canvas, text, hexColor, rgbColor) {
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

        // Offscreen canvas for stag mask
        const offCanvas = document.createElement('canvas');
        offCanvas.width = stagImg.width;
        offCanvas.height = stagImg.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(stagImg, 0, 0);

        const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // If dark background in mask -> make transparent
          if (r < 80 && g < 80 && b < 80) {
            data[i + 3] = 0;
          } else {
            // Stag lines
            const brightness = (r + g + b) / (3 * 255);
            data[i] = rgbColor.r;
            data[i + 1] = rgbColor.g;
            data[i + 2] = rgbColor.b;
            data[i + 3] = Math.round(brightness * 255);
          }
        }
        offCtx.putImageData(imgData, 0, 0);

        // Draw Tinted Stag on Canvas
        const stagW = 510;
        const stagH = 510;
        const stagX = (800 - stagW) / 2;
        const stagY = 85;
        ctx.drawImage(offCanvas, stagX, stagY, stagW, stagH);

        // Draw Calligraphy Text: "❖ Đã Nhận Cọc ❖" or "❖ Chờ Cọc ❖"
        ctx.fillStyle = hexColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // High elegance calligraphy font
        ctx.font = "bold italic 72px 'Dancing Script', 'Playfair Display', cursive, serif";
        ctx.fillText(text, 400, 675);
      }

      // Draw Paid (#921a24 crimson red)
      const paidCanvas = document.getElementById('paidCanvas');
      drawStamp(paidCanvas, '❖  Đã Nhận Cọc  ❖', '#961825', { r: 150, g: 24, b: 37 });

      // Draw Pending (#1c365d deep navy)
      const pendingCanvas = document.getElementById('pendingCanvas');
      drawStamp(pendingCanvas, '❖  Chờ Cọc  ❖', '#1c365d', { r: 28, g: 54, b: 93 });

      const paidData = paidCanvas.toDataURL('image/png');
      const pendingData = pendingCanvas.toDataURL('image/png');

      await fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: paidData, pending: pendingData })
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
      console.log('Saved ultra-crisp paid.png (' + paidBuf.length + ' bytes) and pending.png (' + pendingBuf.length + ' bytes)!');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
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
