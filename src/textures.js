import * as THREE from 'three';

export function seededRandom(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

export function plaqueTexture(title, year) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2a2320';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a24e';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#f1dca6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 40px Georgia, serif';
    ctx.fillText(fitText(ctx, title, w - 60), w / 2, year ? 52 : h / 2);
    if (year) {
      ctx.font = '26px Georgia, serif';
      ctx.fillStyle = '#c9a24e';
      ctx.fillText(year, w / 2, 94);
    }
  });
}

export function incomingTexture() {
  return canvasTexture(640, 440, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, '#3a2f55');
    g.addColorStop(1, '#1b1630');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(227, 184, 92, 0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.setLineDash([]);

    // Hourglass
    const cx = w / 2;
    const cy = 128;
    ctx.fillStyle = '#e3b85c';
    ctx.fillRect(cx - 34, cy - 50, 68, 8);
    ctx.fillRect(cx - 34, cy + 42, 68, 8);
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 42);
    ctx.lineTo(cx + 26, cy - 42);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx + 26, cy + 42);
    ctx.lineTo(cx - 26, cy + 42);
    ctx.lineTo(cx - 4, cy);
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#e3b85c';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy + 38);
    ctx.lineTo(cx + 16, cy + 38);
    ctx.lineTo(cx, cy + 14);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff4e0';
    ctx.font = '600 64px Georgia, serif';
    ctx.fillText('Œuvre à venir', cx, 262);
    ctx.fillStyle = 'rgba(255, 244, 224, 0.6)';
    ctx.font = 'italic 28px Georgia, serif';
    ctx.fillText('Une nouvelle création se prépare…', cx, 326);
  });
}

export function placeholderTexture(title) {
  return canvasTexture(640, 480, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#3b3263');
    g.addColorStop(1, '#c46f5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, h);
      ctx.lineTo(Math.random() * w, 0);
      ctx.lineTo(Math.random() * w, h);
      ctx.fill();
    }
    ctx.fillStyle = '#fff4e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 48px Georgia, serif';
    ctx.fillText(fitText(ctx, title, w - 80), w / 2, h / 2);
  });
}
