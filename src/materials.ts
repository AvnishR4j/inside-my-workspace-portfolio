import * as THREE from 'three';

export function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 1024) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; return texture;
}

export function woodTexture() {
  return canvasTexture((c, w, h) => {
    c.fillStyle = '#785035'; c.fillRect(0, 0, w, h);
    let seed = 42;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 3500; i++) {
      const y = random() * h; const light = random() > .43;
      c.strokeStyle = light ? `rgba(216,164,103,${random() * .1})` : `rgba(32,18,10,${random() * .22})`;
      c.lineWidth = random() * 2 + .25; c.beginPath(); c.moveTo(0, y);
      c.bezierCurveTo(w * .3, y + random() * 20, w * .7, y - random() * 15, w, y + random() * 5); c.stroke();
    }
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(25,13,7,.42)'; c.fillRect(0, i * h / 6, w, 2);
    }
  });
}

export function textTexture(lines: string[], options: { background?: string; color?: string; size?: number; accent?: string } = {}) {
  return canvasTexture((c, w, h) => {
    c.fillStyle = options.background ?? '#18201f'; c.fillRect(0, 0, w, h);
    c.fillStyle = options.color ?? '#dfc39b'; c.font = `${options.size ?? 60}px Georgia`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((line, i) => c.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 90, w * .84));
    c.strokeStyle = options.accent ?? '#a17a4b'; c.lineWidth = 3; c.strokeRect(35, 35, w - 70, h - 70);
  }, 768, 1024);
}

export function terminalTexture() {
  return canvasTexture((c, w, h) => {
    c.fillStyle = '#09151d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1c2832'; c.fillRect(0, 0, w, 48);
    ['#d67b6c', '#dcb45d', '#7bbf9b'].forEach((col, i) => {c.fillStyle = col; c.beginPath(); c.arc(22 + i * 22, 24, 6, 0, 7); c.fill();});
    c.fillStyle = '#6f8994'; c.font = '18px monospace'; c.fillText('avnish / workspace', 125, 31);
    c.fillStyle = '#15222c'; c.fillRect(0, 48, 160, h);
    c.font = '15px monospace'; c.fillStyle = '#6f8390';
    ['EXPLORER', '', ' src', '   projects/', '   studio/', '   thoughts/', '', ' package.json', ' README.md'].forEach((s, i) => c.fillText(s, 15, 85 + i * 30));
    c.font = '22px monospace';
    const code = ['const developer = {', '  name: "Avnish Raj",', '  focus: ["systems", "AI"],', '  building: "with purpose"', '};', '', '$ lifeline resume', '', '✓ Session captured.', '✓ Context restored.', '', 'Ready to continue.'];
    code.forEach((line, i) => { c.fillStyle = i === 8 || i === 9 ? '#8fc9ad' : i < 5 ? '#a5bccb' : '#d7e3e4'; c.fillText(line, 205, 110 + i * 35); });
    c.fillStyle = '#c79760'; c.fillRect(205, 547, 12, 25);
  }, 1024, 640);
}

export function keyboardTexture() {
  return canvasTexture((c, w, h) => {
    c.fillStyle = '#12191d'; c.fillRect(0, 0, w, h);
    const rows = ['esc  1  2  3  4  5  6  7  8  9  0  −  +  del', 'tab  Q  W  E  R  T  Y  U  I  O  P  [  ]  \\', 'caps A  S  D  F  G  H  J  K  L  ;  \'  enter', 'shift Z  X  C  V  B  N  M  ,  .  /  shift', 'fn  ctrl  opt  cmd                   cmd  opt  ◀  ▲  ▶'];
    c.font = '17px monospace'; c.fillStyle = '#a0adb2';
    rows.forEach((row, i) => {c.fillText(row, 18, 38 + i * 59);});
  }, 1024, 320);
}

export function spineTexture(title: string, background: string) {
  return canvasTexture((c, w, h) => {
    c.fillStyle = background; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#aa98745a'; c.strokeRect(9, 8, w - 18, h - 16);
    c.fillStyle = '#c9b895'; c.font = '44px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(title, w / 2, h / 2, w * .9);
  }, 1024, 128);
}

export function paperTexture() {
  return canvasTexture((c, w, h) => {
    c.fillStyle = '#e9ddc6'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 18000; i++) {c.fillStyle = `rgba(60,43,20,${Math.random() * .055})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1);}
  }, 512, 512);
}

export function contactShadow() {
  return canvasTexture((c, w, h) => {const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(.65, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);}, 256, 256);
}

/** Small, repeatable surface relief; data maps must stay in linear color space. */
export function surfaceRelief(kind: 'leather' | 'plaster' | 'woven') {
  const texture = canvasTexture((c, w, h) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    let seed = 193;
    const random = () => {seed = seed * 16807 % 2147483647; return seed / 2147483647;};
    for (let i = 0; i < 21000; i++) {
      const tone = 70 + Math.floor(random() * 105);
      c.fillStyle = `rgb(${tone},${tone},${tone})`;
      const x = random() * w, y = random() * h;
      if (kind === 'leather') {c.beginPath(); c.ellipse(x, y, 1 + random() * 2, .5 + random(), random() * 3, 0, Math.PI * 2); c.fill();}
      else c.fillRect(x, y, 1 + random() * 2, 1 + random() * 2);
    }
    if (kind === 'woven') {
      for (let i = 0; i < w; i += 4) {c.fillStyle = i % 8 ? '#b8b8b8' : '#505050'; c.fillRect(i, 0, 1, h); c.fillRect(0, i, w, 1);}
    }
  }, 512, 512);
  texture.colorSpace = THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'plaster' ? 6 : 3, kind === 'plaster' ? 6 : 3);
  return texture;
}

export function notebookTexture() {
  return canvasTexture((c, w, h) => {
    c.fillStyle = '#ddc8a4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8d78622e'; c.lineWidth = 1;
    for (let y = 130; y < h - 70; y += 55) {c.beginPath(); c.moveTo(65, y); c.lineTo(w - 60, y); c.stroke();}
    c.fillStyle = '#504435'; c.font = 'italic 48px Georgia'; c.fillText('Next up.', 85, 100);
    c.font = 'italic 29px Georgia';
    ['Improve SCAR accuracy', 'Polish Lifeline UX', 'Make something useful', 'Keep looking closer'].forEach((line, i) => {
      const y = 205 + i * 110; c.strokeStyle = '#675946'; c.strokeRect(85, y - 24, 23, 23); c.fillText(line, 135, y, w - 190);
    });
    c.font = 'italic 35px Georgia'; c.fillText('Small steps. Every day.', 85, h - 120);
  }, 768, 1024);
}
