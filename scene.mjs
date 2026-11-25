/* ============================================================
   scene.mjs — 3D-вид памятника (three.js + WebGL).

   Вся фактура рисуется процедурно на canvas: файлов-картинок в
   проекте нет, конструктор работает офлайн и на любом хостинге.

   Камень — MeshStandardMaterial с env-освещением (RoomEnvironment):
   иначе полированный габбро выглядит серым plastic'ом.

   Точка входа: create(host, cfg) -> { update, view, bg, png, resize, destroy }
     cfg    — каталог из config.js (нужен для lookup камня/покрытия)
     state  — состояние конструктора (схема в engine.js)
   ============================================================ */
import * as THREE from "three";
import { OrbitControls } from "./vendor/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "./vendor/examples/jsm/environments/RoomEnvironment.js";
import { CATALOG } from "./forms.mjs?v=2";

const RAD = Math.PI / 180;
const T = {};                     // кэш фактур: одна запись каталога = один холст
let ANISO = 1;                    // считаем после появления рендерера

/* ------------------------------------------------------------ */
/*  Фактура камня. База + мягкие пятна + зерно + прожилки.      */
/* ------------------------------------------------------------ */
const STONE_ART = {
  gabbro:    { base: "#17181c", blobs: ["#14161a", "#1d1f24", "#22252a"], grains: ["#3a3d43", "#4e5258", "#6a6f76", "#0f1013"], n: 6500, gmin: 0.4, gmax: 1.5, ga0: 0.12, ga1: 0.55, rough: 0.14, env: 1.0 },
  ampho:     { base: "#24272b", blobs: ["#1c1f22", "#2f3337", "#3b4045"], grains: ["#c9ccce", "#9aa0a3", "#6d7275", "#15171a"], n: 7000, gmin: 0.6, gmax: 2.4, ga0: 0.16, ga1: 0.6, rough: 0.20, env: 0.85 },
  dym:       { base: "#6e4f45", blobs: ["#5c453d", "#7d5f4f", "#8f6a58"], grains: ["#a8887a", "#c2a291", "#46352e", "#d8bcae"], n: 7200, gmin: 0.7, gmax: 2.6, ga0: 0.16, ga1: 0.62, rough: 0.26, env: 0.6 },
  red:       { base: "#8c4a38", blobs: ["#7c3f30", "#9a5741", "#a8654a"], grains: ["#c07f5f", "#d59a74", "#512519", "#6e3628"], n: 6800, gmin: 0.7, gmax: 2.4, ga0: 0.16, ga1: 0.62, rough: 0.22, env: 0.7 },
  susks:     { base: "#a5908f", blobs: ["#988484", "#b3a0a0", "#8d7a7b"], grains: ["#cbbabb", "#e3d5d4", "#6f5f61", "#5b4e50"], n: 7000, gmin: 0.6, gmax: 2.3, ga0: 0.16, ga1: 0.6, rough: 0.24, env: 0.65, light: true },
  indian:    { base: "#3a2b21", blobs: ["#31241b", "#46342a", "#584231"], grains: ["#8a6b4e", "#6d5440", "#1f1812", "#a3835f"], n: 5200, gmin: 0.5, gmax: 2.0, ga0: 0.14, ga1: 0.55, vein: "#8a6b4e", rough: 0.20, env: 0.75 },
  gray:      { base: "#a2a6a8", blobs: ["#979b9d", "#aeb1b3", "#8c9093"], grains: ["#6a6d70", "#7e8285", "#c6c9cb", "#565a5d"], n: 7200, gmin: 0.7, gmax: 2.5, ga0: 0.16, ga1: 0.62, rough: 0.24, env: 0.65, light: true },
  mansur:    { base: "#c0c1bd", blobs: ["#b5b6b2", "#cdcfc9", "#aaada9"], grains: ["#8f938f", "#a6aaa6", "#d8d9d4", "#7c807c"], n: 6800, gmin: 0.6, gmax: 2.0, ga0: 0.16, ga1: 0.6, rough: 0.28, env: 0.55, light: true },
  marble:    { base: "#e4e1d8", blobs: ["#dbd8cf", "#eeebe3", "#d5d1c7"], grains: ["#c8c4ba", "#b8b3a8", "#f1efe8"], n: 2600, gmin: 0.5, gmax: 1.4, ga0: 0.10, ga1: 0.4, vein: "#b6b1a4", rough: 0.30, env: 0.55, light: true }
};

function cvs(s) {
  const c = document.createElement("canvas");
  c.width = c.height = s;
  return c;
}
function tex(cv, rx, ry) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = ANISO;
  return t;
}
function blobs(g, size, list, count, amin, aadd, rmin, radd) {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = amin + Math.random() * aadd;
    g.fillStyle = list[i % list.length];
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, rmin + Math.random() * radd, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
}
function veins(g, size, color, n) {
  g.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.10 + Math.random() * 0.18;
    g.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * size;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 120,
                    size * 0.7, y + (Math.random() - 0.5) * 120,
                    size, y + (Math.random() - 0.5) * 60);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function stoneTex(art) {
  const key = "stone_" + art.base + art.n;
  if (T[key]) return T[key];
  const s = 512, c = cvs(s), g = c.getContext("2d");
  g.fillStyle = art.base; g.fillRect(0, 0, s, s);
  blobs(g, s, art.blobs, 70, 0.10, 0.10, 22, 40);
  if (art.vein) veins(g, s, art.vein, 16);
  for (let i = 0; i < art.n; i++) {
    g.fillStyle = art.grains[i % art.grains.length];
    g.globalAlpha = art.ga0 + Math.random() * (art.ga1 - art.ga0);
    const r = art.gmin + Math.random() * (art.gmax - art.gmin);
    g.beginPath();
    g.arc(Math.random() * s, Math.random() * s, r, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  return (T[key] = tex(c, 1, 1));
}

/* колотый бок: сколы-гранях, светлее и шершавее полировки */
function splitStoneTex(art) {
  const key = "split_" + art.base;
  if (T[key]) return T[key];
  const s = 256, c = cvs(s), g = c.getContext("2d");
  g.fillStyle = art.base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * s, y = Math.random() * s, w = 8 + Math.random() * 34, h = 5 + Math.random() * 20;
    g.globalAlpha = 0.10 + Math.random() * 0.35;
    g.fillStyle = art.grains[i % art.grains.length];
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y + (Math.random() - 0.5) * h);
    g.lineTo(x + w * 0.6, y + h);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  return (T[key] = tex(c, 2, 1));
}

/* ------------------------------------------------------------ */
/*  Образец камня для выбора: та же фактура, что рисует модель,  */
/*  только маленький рисунок прямо в плитке. Никаких файлов —    */
/*  рисунок считается на canvas при первом открытии.             */
/* ------------------------------------------------------------ */
const SW = {};
export function stoneSwatch(pal) {
  const key = pal || "gabbro";
  if (SW[key]) return SW[key];
  const art = STONE_ART[key] || STONE_ART.gabbro;
  const w = 220, h = 130;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");

  /* фон и крупные пятна — общий тон камня */
  g.fillStyle = art.base;
  g.fillRect(0, 0, w, h);
  blobs(g, Math.max(w, h), art.blobs, 26, 0.12, 0.16, 9, 22);

  /* прожилки, если они есть у этого камня */
  if (art.vein) {
    g.strokeStyle = art.vein;
    for (let i = 0; i < 7; i++) {
      g.globalAlpha = 0.10 + Math.random() * 0.16;
      g.lineWidth = 1 + Math.random() * 2.4;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.35, y + (Math.random() - 0.5) * 34,
                      w * 0.7, y + (Math.random() - 0.5) * 34,
                      w, y + (Math.random() - 0.5) * 20);
      g.stroke();
    }
  }

  /* зерно: те же цвета и размеры, что на модели, плотность по площади */
  const n = Math.round(art.n * (w * h) / (512 * 512) * 1.7);
  for (let i = 0; i < n; i++) {
    g.fillStyle = art.grains[i % art.grains.length];
    g.globalAlpha = art.ga0 + Math.random() * (art.ga1 - art.ga0);
    const r = art.gmin + Math.random() * (art.gmax - art.gmin);
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, r, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;

  /* лёгкий блик полировки, чтобы образец не выглядел плоским */
  const sh = g.createLinearGradient(0, 0, w, h);
  sh.addColorStop(0, "rgba(255,255,255,0.16)");
  sh.addColorStop(0.45, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.18)");
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);

  return (SW[key] = c.toDataURL("image/jpeg", 0.9));
}

/* ------------------------------------------------------------ */
/*  Покрытия участка: грунт, крошка, брус, плитка 30×30.        */
/* ------------------------------------------------------------ */
function coverTex(entry) {
  const key = "cover_" + entry.id;
  if (T[key]) return T[key];
  const s = 512, c = cvs(s), g = c.getContext("2d");
  const span = 1.2;                                   // метров на текстуру

  if (entry.cell) {
    const cell = entry.cell;
    const px = s * (cell / span);
    const j = Math.max(1, px * 0.05);                 // расшивка ~1 см
    g.fillStyle = entry.id === "pavers" ? "#6a6f72" : "#5f6466";
    g.fillRect(0, 0, s, s);
    const pal = entry.id === "tiles"
      ? ["#9aa0a2", "#8f9598", "#a4aaac", "#868c8f"]
      : ["#7f858a", "#8a9095", "#767c81", "#949a9f"];
    let i = 0;
    for (let y = 0; y < s; y += px + j) {
      for (let x = 0; x < s; x += px + j) {
        const off = ((y / px) | 0) % 2 ? px / 2 : 0;  // кирпичная раскладка
        g.fillStyle = pal[(i++) % pal.length];
        g.globalAlpha = 1;
        g.fillRect(x + off + j, y + j, px - j, px - j);
        if (entry.gloss) {
          g.globalAlpha = 0.10;
          g.fillStyle = "#ffffff";
          g.fillRect(x + off + j, y + j, px - j, (px - j) * 0.35);
        }
      }
    }
    g.globalAlpha = 1;
  } else if (entry.pal === "soil") {
    g.fillStyle = "#6a5c48"; g.fillRect(0, 0, s, s);
    blobs(g, s, ["#5e5140", "#75664f", "#83745c"], 160, 0.25, 0.35, 6, 26);
    for (let i = 0; i < 1800; i++) {
      g.globalAlpha = 0.15 + Math.random() * 0.35;
      g.fillStyle = i % 9 === 0 ? "#546b3d" : ["#4c4234", "#8a7a60", "#5b5040"][i % 3];
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, 0.8 + Math.random() * 2.6, 0, 6.283);
      g.fill();
    }
  } else {
    const base = entry.pal === "chips" ? "#8a8378" : "#7f8386";
    const pal = entry.pal === "chips"
      ? ["#b4884f", "#c9a06a", "#9c7443", "#7f6b4f", "#d8bb8e"]
      : ["#6b6f72", "#7f8386", "#93989b", "#5d6163", "#a7acad"];
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = pal[i % pal.length];
      g.globalAlpha = 0.30 + Math.random() * 0.55;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, 1.4 + Math.random() * 4.2, 0, 6.283);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return (T[key] = tex(c, 1, 1));
}

function lawnTex() {
  if (T.lawn) return T.lawn;
  const s = 512, c = cvs(s), g = c.getContext("2d");
  g.fillStyle = "#5c6f47"; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = 0.18 + Math.random() * 0.5;
    g.fillStyle = ["#4e6039", "#6b7f52", "#77895d", "#455634"][i % 4];
    g.beginPath();
    g.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  return (T.lawn = tex(c, 6, 6));
}

/* ------------------------------------------------------------ */
/*  Материалы                                                  */
/* ------------------------------------------------------------ */
function stoneArt(cfg, state) {
  const st = window.ENGINE.find(cfg.stones || [], state.stela.stone) || {};
  return STONE_ART[st.pal || st.id] || STONE_ART.gabbro;
}
function stoneMat(cfg, state) {
  const a = stoneArt(cfg, state);
  return new THREE.MeshStandardMaterial({
    map: stoneTex(a), color: 0xffffff, roughness: a.rough, metalness: 0.05, envMapIntensity: a.env
  });
}
function edgeMat(cfg, state) {
  const a = stoneArt(cfg, state);
  const sides = window.ENGINE.find(cfg.sides || [], state.stela.sides) || {};
  if (sides.id === "polish") return stoneMat(cfg, state);
  const map = sides.id === "thermo"
    ? (T.thermo || (T.thermo = mkThermo()))
    : splitStoneTex(a);
  return new THREE.MeshStandardMaterial({ map: map, color: 0xdfe0e0, roughness: 0.85, metalness: 0.02, envMapIntensity: 0.3 });
}
function mkThermo() {
  const s = 256, c = cvs(s), g = c.getContext("2d");
  g.fillStyle = "#3f4449"; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.fillStyle = ["#33383c", "#4b5157", "#2a2e31"][i % 3];
    g.beginPath();
    g.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 4, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  return tex(c, 3, 1);
}

/* ------------------------------------------------------------ */
/*  Гравировка и портрет — одна текстура на всю лицевую грань.  */
/* ------------------------------------------------------------ */
const imgCache = {};
function imgOf(dataURL, onReady) {
  if (!dataURL) return null;
  let im = imgCache[dataURL];
  if (im) return im.complete && im.naturalWidth ? im : null;
  im = new Image();
  im.onload = () => { imgCache[dataURL] = im; onReady(); };
  im.onerror = () => { imgCache[dataURL] = { naturalWidth: 0 }; onReady(); };
  im.src = dataURL;
  imgCache[dataURL] = im;
  return null;
}

/* холст под размер той части грани, где идёт надпись: пикселей на метр
   держим ~1000, чтобы текст читался на экране и не стоил полмегабайта */
function faceCanvas(state, FZ, maxPx) {
  const dens = Math.min(1000, maxPx / Math.max(FZ.w, FZ.h));
  return { w: Math.max(256, Math.round(FZ.w * dens)), h: Math.max(256, Math.round(FZ.h * dens)) };
}

/* Гравировка и портрет лежат отдельной плоскостью над гранью камня.
   Зазор в 8 мм визуально не заметен, зато без него и без polygonOffset
   плоскость начинает спорять с поверхностью камня: на косых ракурсах
   буквы и фото мерцают, то проявляясь, то пропадая. */
const DECAL_Z = 0.008;
function faceMat(tex) {
  return new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.5, metalness: 0.02, envMapIntensity: 0.35,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
}

/* ---------- узоры на камне ----------
   Всё рисуется теми же линиями и тем же цветом, что и буквы (INK), поэтому
   узор выглядит одной работой с надписью. Узоры — отдельный слой: их можно
   включить вместе с текстом и портретом. Размер всех узоров задаёт один
   ползунок (en.uzScale), границы срезаёт движок. */
function uzVase(g, cx, cy, s) {
  g.save();
  g.strokeStyle = INK.line; g.lineWidth = Math.max(2, s * 0.05); g.lineCap = "round";
  /* чаша вазы */
  g.beginPath();
  g.moveTo(cx - s * 0.30, cy - s * 0.20);
  g.quadraticCurveTo(cx - s * 0.22, cy + s * 0.24, cx, cy + s * 0.30);
  g.quadraticCurveTo(cx + s * 0.22, cy + s * 0.24, cx + s * 0.30, cy - s * 0.20);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - s * 0.36, cy - s * 0.22); g.lineTo(cx + s * 0.36, cy - s * 0.22);
  g.moveTo(cx - s * 0.12, cy + s * 0.34); g.lineTo(cx + s * 0.12, cy + s * 0.34);
  g.stroke();
  /* три цветка на стеблях */
  for (let i = -1; i <= 1; i++) {
    const fx = cx + i * s * 0.24, fy = cy - s * (0.52 - Math.abs(i) * 0.10);
    g.beginPath();
    g.moveTo(cx, cy - s * 0.24);
    g.quadraticCurveTo(cx + i * s * 0.10, cy - s * 0.40, fx, fy + s * 0.12);
    g.stroke();
    g.beginPath();
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      const px = fx + Math.cos(a) * s * 0.11, py = fy + Math.sin(a) * s * 0.11;
      if (p === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.stroke();
    g.beginPath(); g.arc(fx, fy, s * 0.045, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

/* лавровая ветвь: дуга с листьями; dir = -1 (влево) или 1 (вправо) */
function uzBranch(g, cx, cy, s, dir) {
  g.save();
  g.strokeStyle = INK.line; g.lineWidth = Math.max(2, s * 0.04); g.lineCap = "round";
  const x0 = cx + dir * s * 0.12, y0 = cy + s * 0.42;
  const xm = cx + dir * s * 0.92, ym = cy + s * 0.52;
  const x1 = cx + dir * s * 1.02, y1 = cy - s * 0.22;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(xm, ym, x1, y1); g.stroke();
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const px = a * x0 + b * xm + c * x1, py = a * y0 + b * ym + c * y1;
    g.save();
    g.translate(px, py);
    g.rotate(dir * (1.15 - t * 1.5));
    g.beginPath(); g.ellipse(0, -s * 0.11, s * 0.06, s * 0.15, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  g.restore();
}

/* лучи за крестом */
function uzRays(g, kx, ky, s) {
  g.save();
  g.strokeStyle = INK.line; g.lineWidth = Math.max(1.5, s * 0.025); g.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = s * 0.52, r1 = s * (i % 2 ? 0.70 : 0.84);
    g.beginPath();
    g.moveTo(kx + Math.cos(a) * r0, ky + Math.sin(a) * r0);
    g.lineTo(kx + Math.cos(a) * r1, ky + Math.sin(a) * r1);
    g.stroke();
  }
  g.restore();
}

/* лента-табличка под датами: рисуем до текста, чтобы буквы легли поверх */
function uzRibbon(g, cx, cy, w, h) {
  g.save();
  g.strokeStyle = INK.line; g.lineWidth = Math.max(2, h * 0.07); g.lineJoin = "round";
  const x = cx - w / 2, y = cy - h / 2, t = h * 0.5;
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h);
  g.closePath(); g.stroke();
  g.beginPath();
  g.moveTo(x, y + h * 0.12); g.lineTo(x - t, y - h * 0.12);
  g.lineTo(x - t, y + h * 1.12); g.lineTo(x, y + h * 0.88);
  g.moveTo(x + w, y + h * 0.12); g.lineTo(x + w + t, y - h * 0.12);
  g.lineTo(x + w + t, y + h * 1.12); g.lineTo(x + w, y + h * 0.88);
  g.stroke();
  g.restore();
}

/* резной бордюр по краю площадки: рамка и ряд ромбиков вдоль неё */
function uzBordur(g, F, d) {
  const inset = Math.min(F.w, F.h) * 0.055;
  const x = inset, y = inset, w = F.w - inset * 2, h = F.h - inset * 2;
  g.save();
  g.strokeStyle = INK.line; g.lineWidth = Math.max(1.5, d * 0.22);
  g.strokeRect(x, y, w, h);
  const dia = (px, py) => {
    g.beginPath();
    g.moveTo(px, py - d); g.lineTo(px + d, py); g.lineTo(px, py + d); g.lineTo(px - d, py);
    g.closePath(); g.stroke();
  };
  const nx = Math.max(2, Math.round(w / (d * 5)));
  for (let i = 1; i < nx; i++) { const px = x + (w * i) / nx; dia(px, y); dia(px, y + h); }
  const ny = Math.max(2, Math.round(h / (d * 5)));
  for (let i = 1; i < ny; i++) { const py = y + (h * i) / ny; dia(x, py); dia(x + w, py); }
  g.restore();
}

function drawFace(state, img, FZ) {
  const F = faceCanvas(state, FZ, 1024);
  const c = cvs(1), g = c.getContext("2d");
  c.width = F.w; c.height = F.h;
  g.clearRect(0, 0, F.w, F.h);
  setInk(stoneArt(CFGREF, state));         // тон гравировки под подбирается под камень

  const en = state.engr;
  const cx = F.w / 2;
  /* покупатель может сделать надпись больше или меньше; верхняя граница
     такая, чтобы строки всё равно помещались на гравировальной площадке */
  const ts = Math.min(1.8, Math.max(0.6, en.textScale || 1));
  const uz = en.uz || {};
  const us = Math.min(1.8, Math.max(0.6, en.uzScale || 1));
  const ubase = Math.min(F.w, F.h) * 0.10;   /* базовая единица узора */

  /* Элементы грани правятся порознь: буквы, портрет и любой узор можно
     сдвинуть, повернуть и изменить в размере вокруг своей точки.
     dy положительный — элемент едет вверх, так человеку понятнее. */
  const MPP = F.w / Math.max(0.2, state.stela.w);      /* пикселов в одном метре грани */
  function withTf(id, px, py, draw) {
    const t = (en.tf && en.tf[id]) || null;
    if (!t) { draw(); return; }
    const sc = Math.min(2.5, Math.max(0.4, t.sc || 1));
    g.save();
    g.translate(px + (t.dx || 0) * MPP, py - (t.dy || 0) * MPP);
    if (t.rot) g.rotate((t.rot * Math.PI) / 180);
    if (sc !== 1) g.scale(sc, sc);
    g.translate(-px, -py);
    draw();
    g.restore();
  }

  /* Рамку и бордюр рисуем первыми: они остаются позади букв и портрета. */
  if (uz.bordur) withTf("bordur", F.w / 2, F.h / 2, () => uzBordur(g, F, ubase * 0.14 * us));
  if (uz.ramka) withTf("ramka", F.w / 2, F.h / 2, () => {
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = INK.line;
    g.lineWidth = Math.max(2, F.w * 0.006);
    rr(g, F.w * 0.06, F.h * 0.04, F.w * 0.90, F.h * 0.90, F.w * 0.04);
    g.restore();
  });

  let y = F.h * 0.16;

  /* портрет: в камне — обесцвеченный, в стекле — тёмная рамка,
     на табличке — светлая рамка-металл */
  if (en.photoMode !== "none" && img && img.naturalWidth) {
    /* портрет регулируемый (photoScale), но ниже половины площадки не
       пускаем: под ним должны уместиться ФИО и даты */
    const ps = Math.min(1.6, Math.max(0.6, en.photoScale || 1));
    let pw = Math.min(F.w * 0.52, F.h * 0.42) * ps;
    let ph = pw * 1.2;
    if (ph > F.h * 0.56) { ph = F.h * 0.56; pw = ph / 1.2; }
    const px = cx - pw / 2, py = F.h * 0.06;
    g.save();
    withTf("photo", cx, py + ph / 2, () => {
    if (en.photoMode === "glass") {
      g.fillStyle = "rgba(10,12,14,0.92)";
      rr(g, px - pw * 0.10, py - ph * 0.06, pw * 1.2, ph * 1.14, 10); g.fill();
      g.strokeStyle = "rgba(190,196,200,0.55)"; g.lineWidth = Math.max(2, F.w * 0.006);
      rr(g, px - pw * 0.10, py - ph * 0.06, pw * 1.2, ph * 1.14, 10); g.stroke();
    } else if (en.photoMode === "metal") {
      g.fillStyle = "rgba(196,198,196,0.9)";
      rr(g, px - pw * 0.10, py - ph * 0.05, pw * 1.2, ph * 1.12, 8); g.fill();
    }
    const src = cropFit(img, pw, ph);
    g.drawImage(src, px, py, pw, ph);
    if (en.photoMode === "stone") {                     // обесцветить и вжать в камень
      g.globalCompositeOperation = "saturation";
      g.fillStyle = "#808080";
      g.fillRect(px, py, pw, ph);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.35;
      g.fillStyle = "rgba(18,20,22,0.9)";
      g.fillRect(px, py, pw, ph);
      g.globalAlpha = 1;
    }
    });
    g.restore();
    y = py + ph * 1.16;
  }

  /* ФИО, даты, эпитафия: светлое «пескоструйное» письмо по тёмному.
     Размер подбираем под ширину грани, чтобы не обрезалось на длинном ФИО */
  const fio = String(en.fio || "").trim();
  if (fio) {
    const size = fitFont(g, fio.toUpperCase(), F.w * Math.min(0.94, 0.86 * ts), F.w * 0.10 * ts, 14,
      (s) => "700 " + s + "px Georgia, 'Times New Roman', serif");
    g.textAlign = "center"; g.textBaseline = "top";
    withTf("fio", cx, y + size * 0.4, () => engr(g, fio.toUpperCase(), cx, y, size));
    y += size * 1.5;
  }
  const yrs = String(en.years || "").trim();
  if (yrs) {
    const size = fitFont(g, yrs, F.w * 0.62 * ts, F.w * 0.065 * ts, 12, (s) => s + "px Georgia, serif");
    g.textAlign = "center"; g.textBaseline = "top";
    /* дату правим вместе с лентой: лента под цифрами, как на гравированных
       табличках, и едет следом за датами, если двигать их */
    withTf("years", cx, y + size * 0.45, () => {
      if (uz.lenta) withTf("lenta", cx, y + size * 0.45, () => {
        g.font = size + "px Georgia, serif";
        const mw = g.measureText(yrs).width;
        uzRibbon(g, cx, y + size * 0.45, mw + size * 1.1, size * 1.5);
      });
      engr(g, yrs, cx, y, size);
    });
    y += size * 1.5;
  }
  if (en.epitaph) {
    const size = Math.max(12, F.w * 0.042 * ts);
    g.font = "italic " + size + "px Georgia, serif";
    g.textAlign = "center"; g.textBaseline = "top";
    withTf("epitaph", cx, y, () => wrapEngr(g, en.epitaph, cx, y, size, F.w * 0.86));
  }

  /* Низ площадки: крест (с лучами, если включён узор) и ваза с цветами.
     Если включены и то и другое — нижнюю зону делим, чтобы узоры не
     налепляли друг на друга. Ветви идут по бокам и с надписью не
     пересекаются. Общий размер узоров задаёт ползунок uzScale. */
  const crossOn = !!(uz.krest || uz.luchi);  /* лучи сами по себе не рисуем: вместе с лучами включаем и крест */
  const vaseOn = !!uz.vaza;
  const zY = F.h * 0.58, zH = F.h - zY;
  const uzc = Math.min(1.25, Math.max(0.7, us));
  if (uz.vetvi) {
    const bs = Math.min(F.w * 0.16, zH * 0.50) * uzc;
    withTf("vetvi", cx, zY + zH * 0.66, () => {
      uzBranch(g, cx - F.w * 0.05, zY + zH * 0.66, bs, -1);
      uzBranch(g, cx + F.w * 0.05, zY + zH * 0.66, bs, 1);
    });
  }
  if (vaseOn) {
    const vy = zY + zH * (crossOn ? 0.76 : 0.52);
    withTf("vaza", cx, vy, () =>
      uzVase(g, cx, vy, Math.min(F.w * 0.28, zH * (crossOn ? 0.26 : 0.40)) * uzc));
  }
  if (crossOn) {
    const ky = zY + zH * (vaseOn ? 0.28 : 0.34);
    const k = Math.min(F.w * 0.22, zH * (vaseOn ? 0.32 : 0.58)) * uzc;
    withTf("krest", cx, ky, () => {
      if (uz.luchi) withTf("luchi", cx, ky, () => uzRays(g, cx, ky, k * 1.05));
      g.strokeStyle = INK.line;
      g.lineWidth = Math.max(3, k * 0.09);
      g.beginPath();
      g.moveTo(cx, ky - k * 0.5); g.lineTo(cx, ky + k * 0.5);
      g.moveTo(cx - k * 0.30, ky - k * 0.22); g.lineTo(cx + k * 0.30, ky - k * 0.22);
      g.moveTo(cx - k * 0.22, ky + k * 0.16); g.lineTo(cx + k * 0.22, ky + k * 0.12);
      g.stroke();
    });
  }
  return c;
}
/* цвет гравировки зависит от камня: на тёмном габбро письмо светлое
   (пескоструй), на светлом граните и мраморе — наоборот тёмное,
   иначе надпись на белом камне просто не видно */
let INK = { fill: "rgba(238,240,242,0.96)", shade: "rgba(8,10,12,0.62)", line: "rgba(222,226,228,0.75)" };
function setInk(art) {
  if (art.light) {
    INK = { fill: "rgba(24,26,28,0.94)", shade: "rgba(252,250,246,0.75)", line: "rgba(30,32,30,0.75)" };
  } else {
    INK = { fill: "rgba(238,240,242,0.96)", shade: "rgba(8,10,12,0.62)", line: "rgba(222,226,228,0.78)" };
  }
}
function engr(g, txt, x, y, size) {
  g.fillStyle = INK.shade;
  g.fillText(txt, x + size * 0.03, y + size * 0.03);
  g.fillStyle = INK.fill;
  g.fillText(txt, x, y);
}
/* подбираем кегль под ширину грани: длинное ФИО не должно обрезаться */
function fitFont(g, txt, maxW, startPx, minPx, fontOf) {
  let size = startPx;
  for (let i = 0; i < 14 && size > minPx; i++) {
    g.font = fontOf(size);
    if (g.measureText(txt).width <= maxW) break;
    size = Math.max(minPx, size * 0.93);
  }
  g.font = fontOf(size);
  return size;
}
/* Размер плоскости гравировки под контур стелы. Прямоугольник не задаём
   руками для каждой формы: ищем самый большой, который весь лежит внутри
   контура. Так буквы не залезают ни на плечи, ни на стрелку, ни на вырез. */
function outlinePoints(cmds) {
  const pts = [], N = 12;
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const c of cmds) {
    if (c[0] === "M") { x = sx = c[1]; y = sy = c[2]; pts.push([x, y]); }
    else if (c[0] === "L") { x = c[1]; y = c[2]; pts.push([x, y]); }
    else if (c[0] === "Q") {
      const cx = c[1], cy = c[2], ex = c[3], ey = c[4];
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        pts.push([u * u * x + 2 * u * t * cx + t * t * ex,
                  u * u * y + 2 * u * t * cy + t * t * ey]);
      }
      x = ex; y = ey;
    } else if (c[0] === "C") {
      const ax = c[1], ay = c[2], bx = c[3], by = c[4], ex = c[5], ey = c[6];
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        pts.push([u * u * u * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * ex,
                  u * u * u * y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * ey]);
      }
      x = ex; y = ey;
    } else { x = sx; y = sy; }
  }
  return pts;
}
function inPoly(pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
const FACEC = {};
function fitFace(form, w, h) {
  const key = form + "|" + w.toFixed(3) + "|" + h.toFixed(3);
  if (FACEC[key]) return FACEC[key];
  const pts = outlinePoints(outlineOf(form, w, h));
  /* прямоугольник проверяем по периметру: 6 точек на сторону достаточно,
     контуры стел плавные и длинных вогнутых участков на стороне нет */
  const fits = (bw, bh, cy) => {
    const hw = bw / 2, y0 = cy - bh / 2, y1 = cy + bh / 2;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, xl = -hw + 2 * hw * t;
      if (!inPoly(pts, xl, y0) || !inPoly(pts, xl, y1)) return false;
      const yl = y0 + (y1 - y0) * t;
      if (!inPoly(pts, -hw, yl) || !inPoly(pts, hw, yl)) return false;
    }
    return true;
  };
  let best = { w: w * 0.52, h: h * 0.40, cy: h * 0.44 };
  for (let ih = 3; ih <= 12; ih++) {
    const bh = h * ih / 12;
    for (let iw = 3; iw <= 12; iw++) {
      const bw = w * iw / 12;
      const asp = bw / bh;
      /* пропорция около квадратной: узкая щель или широкий пояс не нужны */
      if (asp < 0.45 || asp > 1.6) continue;
      for (let iy = 0; iy <= 10; iy++) {
        const cy = bh / 2 + (h - bh) * iy / 10;
        if (bw * bh > best.w * best.h && fits(bw, bh, cy)) {
          best = { w: bw, h: bh, cy };
        }
      }
    }
  }
  best.w *= 0.94; best.h *= 0.94;
  FACEC[key] = best;
  return best;
}
function faceSize(state, G) {
  return fitFace(state.stela.form, G.stela.w, G.stela.h);
}
function wrapEngr(g, txt, x, y, size, maxW) {
  const words = String(txt).split(/\s+/);
  let line = "", yy = y;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + " " + words[i] : words[i];
    if (g.measureText(t).width > maxW && line) { engr(g, line, x, yy, size); line = words[i]; yy += size * 1.35; }
    else line = t;
  }
  if (line) engr(g, line, x, yy, size);
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
/* обрезка по пропорциям холста, чтобы лицо на фото не сплющивалось */
function cropFit(img, w, h) {
  const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const cw = w / sc, ch = h / sc;
  const c = cvs(1), g = c.getContext("2d");
  c.width = Math.round(w); c.height = Math.round(h);
  g.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  return c;
}

/* ------------------------------------------------------------ */
/*  Стела: контур в X/Y, толщина по Z, фаска по периметру.     */
/* ------------------------------------------------------------ */
/* Контуры стелы — один список команд и для 3D, и для силуэта в окне выбора.
   Команды: M — начать, L — прямая, Q — дуга через одну точку, C — дуга через
   две, Z — замкнуть. Координаты в метрах: x от -hw до hw, y от 0 (низ стелы)
   до h (верх). Держим все точки внутри прямоугольника w × h, иначе стела
   окажется шире или выше заявленного размера. */
function outlineOf(form, w, h) {
  /* Каталог форм (листы 01–10, номера 1–60): контур задан в долях камня —
     x от -0.5 до 0.5, y от 0 до 1. Переводим в метры и работаем как обычно. */
  if (CATALOG[form]) {
    return CATALOG[form].cmds.map((c) => {
      if (c[0] === "Z") return c;
      const out = [c[0]];
      for (let i = 1; i < c.length; i += 2) {
        out.push(c[i] * w, c[i + 1] * h);
      }
      return out;
    });
  }

  const hw = w / 2, ch = Math.min(hw * 0.5, 0.05), k = hw * 0.5523;

  if (form === "ark") {
    return [["M", -hw, 0], ["L", -hw, h - hw],
      ["C", -hw, h - hw + k, -k, h, 0, h],
      ["C", k, h, hw, h - hw + k, hw, h - hw],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "cap") {
    return [["M", -hw, 0], ["L", -hw, h * 0.55],
      ["C", -hw, h * 0.86, -hw * 0.45, h, 0, h],
      ["C", hw * 0.45, h, hw, h * 0.86, hw, h * 0.55],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "krest") {
    return [["M", -hw, 0], ["L", -hw, h * 0.72],
      ["L", -hw * 0.34, h * 0.72], ["L", -hw * 0.34, h * 0.90],
      ["L", -hw * 0.66, h * 0.90], ["L", -hw * 0.66, h],
      ["L", hw * 0.66, h], ["L", hw * 0.66, h * 0.90],
      ["L", hw * 0.34, h * 0.90], ["L", hw * 0.34, h * 0.72],
      ["L", hw, h * 0.72], ["L", hw, 0], ["Z"]];
  }
  if (form === "fig") {
    return [["M", -hw, 0], ["L", -hw, h * 0.62],
      ["C", -hw * 1.02, h * 0.82, -hw * 0.35, h * 0.88, 0, h],
      ["C", hw * 0.40, h * 0.90, hw, h * 0.80, hw, h * 0.60],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "plechi") {
    const nw = hw * 0.70, ch2 = Math.min(nw * 0.5, 0.04);
    return [["M", -hw, 0], ["L", -hw, h * 0.58], ["L", -nw, h * 0.74],
      ["L", -nw, h - ch2], ["L", -nw + ch2, h], ["L", nw - ch2, h],
      ["L", nw, h - ch2], ["L", nw, h * 0.74], ["L", hw, h * 0.58],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "volna") {
    /* верх идёт волной: слева опускается, справа поднимается до верхнего
       края — перепад заметен и на плитке, и на камне */
    return [["M", -hw, 0], ["L", -hw, h * 0.72],
      ["C", -hw * 0.66, h * 0.94, -hw * 0.40, h * 0.66, 0, h * 0.80],
      ["C", hw * 0.40, h * 0.94, hw * 0.66, h * 0.86, hw, h],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "strelna") {
    /* бока почти прямые, наверх сходятся в острую стрелку */
    return [["M", -hw, 0], ["L", -hw, h * 0.46],
      ["C", -hw * 0.99, h * 0.72, -hw * 0.42, h * 0.95, 0, h],
      ["C", hw * 0.42, h * 0.95, hw * 0.99, h * 0.72, hw, h * 0.46],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "oblako") {
    /* три дуги сверху, средняя выше всех — силуэт читается даже мелким */
    return [["M", -hw, 0], ["L", -hw, h * 0.56],
      ["Q", -hw, h * 0.92, -hw * 0.62, h * 0.90],
      ["Q", -hw * 0.66, h * 0.64, -hw * 0.32, h * 0.72],
      ["Q", -hw * 0.24, h * 1.00, 0, h * 0.98],
      ["Q", hw * 0.30, h * 0.70, hw * 0.56, h * 0.80],
      ["Q", hw * 0.94, h * 0.98, hw, h * 0.58],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "serdce") {
    /* две верхние дуги и заметный вырез посередине */
    return [["M", -hw, 0], ["L", -hw, h * 0.42],
      ["C", -hw, h * 0.80, -hw * 0.74, h, -hw * 0.24, h * 0.88],
      ["Q", 0, h * 0.66, hw * 0.24, h * 0.88],
      ["C", hw * 0.74, h, hw, h * 0.80, hw, h * 0.42],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "parus") {
    /* парус: левый бок прямой, верхняя кромка уходит дугой к правому краю */
    return [["M", -hw, 0], ["L", -hw, h],
      ["C", -hw * 0.20, h * 0.98, hw * 0.55, h * 0.78, hw, h * 0.34],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "parus2") {
    /* парус с выгибом внутрь: кромка прогибается под дугу */
    return [["M", -hw, 0], ["L", -hw, h],
      ["C", -hw * 0.34, h * 0.64, hw * 0.36, h * 0.42, hw, h * 0.14],
      ["L", hw, 0], ["Z"]];
  }
  if (form === "taliya") {
    /* талия: у середины бок уже, чем у основания и у верха */
    return [["M", -hw, 0], ["Q", -hw * 0.66, h * 0.48, -hw * 0.90, h * 0.90],
      ["Q", -hw * 0.44, h, 0, h],
      ["Q", hw * 0.44, h, hw * 0.90, h * 0.90],
      ["Q", hw * 0.66, h * 0.48, hw, 0], ["Z"]];
  }
  if (form === "stupeni") {
    /* ступени: левая часть выше, правый бок спускается уступами */
    return [["M", -hw, 0], ["L", -hw, h - ch], ["L", -hw + ch, h],
      ["L", hw * 0.62, h], ["L", hw * 0.62, h * 0.80],
      ["L", hw * 0.84, h * 0.80], ["L", hw * 0.84, h * 0.58],
      ["L", hw, h * 0.58], ["L", hw, 0], ["Z"]];
  }
  if (form === "shatrovaya") {
    /* шатровая: прямые линии сходятся в верхнюю точку */
    return [["M", -hw, 0], ["L", -hw, h * 0.62], ["L", 0, h],
      ["L", hw, h * 0.62], ["L", hw, 0], ["Z"]];
  }
  if (form === "trapetsiya") {
    /* трапеция, «расшив»: бока идут, сужаясь к верху */
    return [["M", -hw, 0], ["L", -hw * 0.74, h], ["L", hw * 0.74, h],
      ["L", hw, 0], ["Z"]];
  }
  /* Прямая и всё неизвестное: прямоугольник со снятыми углами. */
  return [["M", -hw, 0], ["L", -hw, h - ch], ["L", -hw + ch, h],
    ["L", hw - ch, h], ["L", hw, h - ch], ["L", hw, 0], ["Z"]];
}

function stelaShape(form, w, h) {
  const s = new THREE.Shape();
  outlineOf(form, w, h).forEach((c) => {
    if (c[0] === "M") s.moveTo(c[1], c[2]);
    else if (c[0] === "L") s.lineTo(c[1], c[2]);
    else if (c[0] === "Q") s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === "C") s.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else s.closePath();
  });
  return s;
}

/* Контур формы для окна выбора: те же команды, что идут в 3D, чтобы
   силуэт в плитке выбора и камень на модели совпадали. */
export function formOutline(form) {
  const w = 0.60, h = 0.85;
  return { w: w, h: h, cmds: outlineOf(form || "pryam", w, h) };
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r1, r2, h, mat, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 18), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------ */
/*  Сборка модели: памятник + участок. Всё по размерам из geo().   */
/* ------------------------------------------------------------ */
function build(cfg, state, faceTex, FZ, G) {
  G = G || window.ENGINE.geo(cfg, state);
  FZ = FZ || faceSize(state, G);
  const grp = new THREE.Group();
  const sMat = stoneMat(cfg, state);

  /* участок: плитка/крошка по фактическим размерам */
  const cov = window.ENGINE.find(cfg.covers || [], state.cover) || {};
  const cmap = coverMat(cfg, state);
  const slabH = Math.max(0.02, Math.min(0.05, cov.th || 0.03));
  const slab = box(G.plot.w, slabH, G.plot.d, cmap);
  slab.position.set(0, slabH / 2, 0);
  grp.add(slab);

  /* постамент и стела стоят у дальней границы участка: так памятник
     лицом к проходу, а не висит в центре между оградой и камерой */
  const pz = -G.plot.d / 2 + Math.max(0.22, G.tumba.topD / 2 + 0.10);

  /* постамент: блоки снизу вверх */
  let topY = slabH;
  (G.tumba.rows || []).forEach((b) => {
    const m = box(b.w, b.h, b.d, sMat);
    m.position.set(0, topY + b.h / 2, pz);
    grp.add(m);
    topY += b.h;
  });

  /* стела: контур строим от y = 0 (низ) до y = h (верх), поэтому
     меш ставим ровно на верх постамента, без сдвига на половину высоты */
  const shape = stelaShape(state.stela.form, G.stela.w, G.stela.h);
  const g2 = new THREE.ExtrudeGeometry(shape, {
    depth: G.stela.th, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004,
    bevelSegments: 2, curveSegments: 24
  });
  g2.translate(0, 0, -G.stela.th / 2);
  g2.computeVertexNormals();
  const stela = new THREE.Mesh(g2, [sMat, edgeMat(cfg, state)]);
  stela.position.set(0, topY, pz);
  stela.castShadow = true; stela.receiveShadow = true;
  grp.add(stela);
  grp.userData.topY = topY;
  grp.userData.pz = pz;
  grp.userData.fz = FZ;

  /* гравировка: отдельная плоскость перед лицевой гранью. Её размер
     подобран под контур стелы (faceSize), чтобы надпись не вылезала
     за скошенный верх у креста и фигурной стелы */
  if (faceTex) {
    const ft = new THREE.CanvasTexture(faceTex);
    ft.colorSpace = THREE.SRGBColorSpace;
    ft.anisotropy = ANISO;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(FZ.w, FZ.h), faceMat(ft));
    plane.position.set(0, topY + FZ.cy, pz + G.stela.th / 2 + DECAL_Z);
    grp.add(plane);
    grp.userData.face = plane;
  }
  grp.userData.fz = FZ;

  /* цветник: борт по периметру прямоугольника за стелой */
  const cv = window.ENGINE.find(cfg.cvetniki || [], state.cvetnik) || {};
  if (cv.per > 0 && G.cvet.w > 0.2) {
    const bw = 0.06, bh = 0.10;
    const z0 = G.plot.d / 2 - G.cvet.d / 2 - 0.02;
    const long = box(G.cvet.w, bh, bw, sMat); long.position.set(0, slabH + bh / 2, z0 - G.cvet.d / 2); grp.add(long);
    const fill = fillMat(cv.fill || "crumb");
    const bed = box(G.cvet.w - bw * 2, 0.012, G.cvet.d - bw * 2, fill);
    bed.position.set(0, slabH + 0.012, z0); grp.add(bed);
    [-1, 1].forEach((sx) => {
      const side = box(bw, bh, G.cvet.d, sMat);
      side.position.set(sx * (G.cvet.w / 2 - bw / 2), slabH + bh / 2, z0);
      grp.add(side);
    });
    const front = box(G.cvet.w, bh, bw, sMat);
    front.position.set(0, slabH + bh / 2, z0 + G.cvet.d / 2);
    grp.add(front);
  }

  /* ограда: три стороны (спереди прохода нет), калитка не рисуется */
  const fen = window.ENGINE.find(cfg.fences || [], state.fence) || {};
  if (fen.per > 0) {
    const fh = fen.id === "granite" ? 0.55 : 0.45;
    const mMat = fen.id === "metal" ? metalMat() : sMat;
    const sides = [
      { x: 0, z: -G.plot.d / 2 + 0.03, len: G.plot.w, axis: "x" },
      { x: -G.plot.w / 2 + 0.03, z: 0, len: G.plot.d, axis: "z" },
      { x: G.plot.w / 2 - 0.03, z: 0, len: G.plot.d, axis: "z" }
    ];
    sides.forEach((sd) => {
      if (fen.id === "granite") {
        const wall = box(sd.axis === "x" ? sd.len : 0.08, fh, sd.axis === "x" ? 0.08 : sd.len, sMat);
        wall.position.set(sd.x, slabH + fh / 2, sd.z);
        grp.add(wall);
      } else {
        if (fen.id === "mix") {
          const n = Math.max(2, Math.round(sd.len / 1.2) + 1);
          for (let i = 0; i < n; i++) {
            const t = -sd.len / 2 + (sd.len * i) / (n - 1);
            const p = box(0.10, fh + 0.06, 0.10, sMat);
            p.position.set(sd.axis === "x" ? sd.x + t : sd.x, slabH + (fh + 0.06) / 2, sd.axis === "x" ? sd.z : sd.z + t);
            grp.add(p);
          }
        }
        const rail = box(sd.axis === "x" ? sd.len : 0.03, 0.035, sd.axis === "x" ? 0.035 : sd.len, mMat);
        rail.position.set(sd.x, slabH + fh, sd.z);
        grp.add(rail);
        const n = Math.max(3, Math.round(sd.len / 0.12));
        for (let i = 1; i < n; i++) {
          const t = -sd.len / 2 + (sd.len * i) / n;
          const bar = box(0.014, fh, 0.014, mMat);
          bar.position.set(sd.axis === "x" ? sd.x + t : sd.x, slabH + fh / 2, sd.axis === "x" ? sd.z : sd.z + t);
          grp.add(bar);
        }
      }
    });
  }

  /* допы, которые видно на модели */
  const ex = state.extras || {};
  const topTumbaW = (G.tumba.rows.length ? G.tumba.rows[G.tumba.rows.length - 1].w : G.stela.w);
  if (ex.vases) {
    [-1, 1].forEach((sx) => {
      const v = cyl(0.075, 0.055, 0.16, sMat);
      v.position.set(sx * (topTumbaW / 2 + 0.09), slabH + 0.24, 0);
      grp.add(v);
      const bowl = cyl(0.10, 0.07, 0.06, sMat);
      bowl.position.set(sx * (topTumbaW / 2 + 0.09), slabH + 0.34, 0);
      grp.add(bowl);
    });
  }
  if (ex.table) {
    const t = box(0.55, 0.06, 0.40, sMat);
    t.position.set(G.stela.w / 2 + 0.55, slabH + 0.42, G.plot.d / 2 - 0.55);
    grp.add(t);
    const leg = box(0.30, 0.42, 0.10, sMat);
    leg.position.set(t.position.x, slabH + 0.21, t.position.z);
    grp.add(leg);
  }
  if (ex.bench) {
    const b = box(1.20, 0.08, 0.35, sMat);
    b.position.set(-G.stela.w / 2 - 0.55, slabH + 0.42, G.plot.d / 2 - 0.45);
    grp.add(b);
    [-1, 1].forEach((sx) => {
      const l = box(0.10, 0.42, 0.35, metalMat());
      l.position.set(b.position.x + sx * 0.5, slabH + 0.21, b.position.z);
      grp.add(l);
    });
  }
  if (ex.wreaths) {
    [-0.22, 0.22].forEach((dx) => {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 10, 26),
        new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 0.9 }));
      w.rotation.x = Math.PI / 2;
      w.position.set(dx, slabH + 0.07, G.plot.d / 2 - 0.18);
      w.castShadow = true;
      grp.add(w);
    });
  }

  grp.userData.G = G;
  return grp;
}

/* ---------------- покрытия как материалы ---------------- */
function coverMat(cfg, state) {
  const e = window.ENGINE.find(cfg.covers || [], state.cover) || {};
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: e.gloss ? 0.28 : 0.92, metalness: e.gloss ? 0.08 : 0.0 });
  const t = coverTex({ id: e.id, pal: e.pal, cell: e.cell, gloss: e.gloss });
  m.map = cloneTex(t, Math.max(1, Math.round((state.plot ? state.plot.w : 1) / 1.2)),
                          Math.max(1, Math.round((state.plot ? state.plot.d : 1) / 1.2)));
  return m;
}
function cloneTex(t, rx, ry) {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  c.anisotropy = ANISO;
  return c;
}
function fillMat(kind) {
  const t = coverTex({ id: kind, pal: kind === "chips" ? "chips" : "crumb", cell: 0, gloss: false });
  const m = new THREE.MeshStandardMaterial({ map: cloneTex(t, 2, 2), roughness: 0.9 });
  return m;
}
let METAL = null;
function metalMat() {
  if (!METAL) METAL = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.42, metalness: 0.8, envMapIntensity: 0.8 });
  return METAL;
}

/* фон и земля под участком */
const BG = {
  uchastok: { sky: 0xdfe5e8, fog: [0xccd6dc, 9, 30], ground: "#ffffff", key: 0xfff4e2, hemi: 1.05, sun: 1.7 },
  studio:   { sky: 0x23252a, fog: null, fogHide: true, fog2: 0x1f2124, ground: "#2f3033", key: 0xffffff, hemi: 0.5, sun: 2.0 },
  sky:      { sky: 0xf0d8bd, fog: [0xe9d3c4, 9, 26], ground: "#e8d9c9", key: 0xffc58a, hemi: 0.6, sun: 1.5 }
};
function applyBg(sc, ground, key, hemi, kind) {
  const b = BG[kind] || BG.uchastok;
  const m = ground.material;
  sc.background = new THREE.Color(b.sky);
  sc.fog = b.fog ? new THREE.Fog(b.fog[0], b.fog[1], b.fog[2]) : null;
  /* в «студии» траву убираем: в студии кладбища нет, там бетонный пол */
  m.map = kind === "studio" ? null : lawnTex();
  m.color.set(b.ground);
  m.needsUpdate = true;
  key.color.set(b.key); key.intensity = b.sun;
  hemi.intensity = b.hemi;
}

/* ------------------------------------------------------------ */
/*  публичный API: создание вида и его методы                   */
/* ------------------------------------------------------------ */
let CFGREF = null;

export function create(host, cfg) {
  CFGREF = cfg;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;";
  host.appendChild(canvas);

  const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  ANISO = Math.min(8, r.capabilities.getMaxAnisotropy());

  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 200);
  cam.position.set(3.6, 1.8, 4.4);
  const ctl = new OrbitControls(cam, canvas);
  ctl.enableDamping = true; ctl.dampingFactor = 0.06;
  ctl.maxPolarAngle = Math.PI * 0.49;
  ctl.minDistance = 1.2; ctl.maxDistance = 14;
  ctl.enablePan = false;
  ctl.rotateSpeed = 0.85;
  /* штатный зум отключён: OrbitControls меняет расстояние скачком на каждое
     движение колеса, и приближение выглядит рывками. Ниже — свой плавный зум */
  ctl.enableZoom = false;

  const hemi = new THREE.HemisphereLight(0xe8eef2, 0x40483c, 1.0);
  sc.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e2, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0007;
  sc.add(key); sc.add(key.target);

  const pmrem = new THREE.PMREMGenerator(r);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  /* отражение комнаты задаём сцене, а не каждому материалу: полированное
     габбро без окружения выглядит чёрным пятном, а не зеркальным камнем */
  sc.environment = env;
  sc.environmentIntensity = 1.15;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: cloneTex(lawnTex(), 26, 26), color: 0xffffff, roughness: 0.98, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  sc.add(ground);

  let grp = null, state = null, bgKind = "uchastok";
  /* viewOpt — целевые углы обзора; камера каждый кадр догоняет их немного,
     поэтому переход по кнопкам «Спереди / Сверху» выходит мягким */
  const viewOpt = { az: 34, el: 26 };
  let wantR = 0;        /* целевое расстояние до цели обзора */
  let manual = false;   /* true, пока человек сам крутит или щиплет сцену */
  let firstFit = true;  /* первую наводку делаем сразу, без разгона */
  let fitRef = 0;       /* расстояние, подобранное под габариты модели */
  let userZoom = false; /* сам крутил колесо или приближал двумя пальцами: вид не возвращаем */
  let pendingFace = null;

  function sphOf() {
    const o = new THREE.Vector3().subVectors(cam.position, ctl.target);
    const r = Math.max(o.length(), 0.01);
    return { r: r, az: Math.atan2(o.x, o.z), el: Math.asin(THREE.MathUtils.clamp(o.y / r, -1, 1)) };
  }
  function sphTo(r, az, el) {
    /* маячок для самопроверок: по data-cam-r видно, где камера сейчас */
    canvas.dataset.camR = Math.max(0.2, r).toFixed(2);
    cam.position.set(
      ctl.target.x + Math.sin(az) * Math.cos(el) * r,
      ctl.target.y + Math.sin(el) * r,
      ctl.target.z + Math.cos(az) * Math.cos(el) * r
    );
  }

  /* колесо: цель по расстоянию, а не мгновенный прыжок камеры.
     Колесо «на себя» (deltaY отрицательный) — камера подлетает ближе */
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 100 : 1);
    const k = Math.pow(1.0015, e.deltaY * unit);
    const base = wantR || sphOf().r;
    wantR = THREE.MathUtils.clamp(base * k, ctl.minDistance, ctl.maxDistance);
    userZoom = true;
  }, { passive: false });

  /* щипок двумя пальцами: штатный зум выключен, поэтому и он свой */
  let pinch0 = 0;
  function pinchGap(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { pinch0 = pinchGap(e.touches); wantR = sphOf().r; }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !pinch0) return;
    e.preventDefault();
    const d = pinchGap(e.touches);
    if (d > 8) {
      wantR = THREE.MathUtils.clamp(wantR * (pinch0 / d), ctl.minDistance, ctl.maxDistance);
      pinch0 = d;
      userZoom = true;
    }
  }, { passive: false });

  /* руками управляем — к своей цели камеру не тянем, иначе мешает */
  let offAt = 0;
  ctl.addEventListener("start", () => { manual = true; });
  ctl.addEventListener("end", () => {
    manual = false;
    /* после отпускания ещё с секунду катится инерция OrbitControls: в это
       время углы берём из камеры, а не тянем её обратно на прежний вид */
    offAt = performance.now() + 1100;
    const s = sphOf();
    viewOpt.az = s.az / RAD; viewOpt.el = s.el / RAD; wantR = s.r;
  });

  /* один шаг сближения камеры к цели: часть пути за кадр */
  /* шаг подлёта камеры: темп задаём в секундах, а не в кадрах, чтобы на
     слабом железе (мало кадров) камера не ползла вечность */
  let camLast = 0;
  function cameraStep() {
    const s = sphOf();
    canvas.dataset.camWant = (wantR || 0).toFixed(2) + (userZoom ? " ruku" : "");
    canvas.dataset.camAz = s.az.toFixed(2) + "/" + s.el.toFixed(2);
    const now = performance.now();
    const dt = camLast ? Math.min(0.12, Math.max(0.004, (now - camLast) / 1000)) : 0.016;
    camLast = now;
    const f = 1 - Math.pow(0.87, dt * 60);
    if (manual) { viewOpt.az = s.az / RAD; viewOpt.el = s.el / RAD; wantR = s.r; return false; }
    /* инерция после отпускания ещё катится — назад на прежний ракурс не тянем */
    if (now < offAt) { viewOpt.az = s.az / RAD; viewOpt.el = s.el / RAD; return false; }
    let daz = viewOpt.az * RAD - s.az;
    while (daz > Math.PI) daz -= Math.PI * 2;
    while (daz < -Math.PI) daz += Math.PI * 2;
    const del = viewOpt.el * RAD - s.el;
    const dR = (wantR || s.r) - s.r;
    if (Math.abs(daz) < 0.0004 && Math.abs(del) < 0.0004 && Math.abs(dR) < 0.0008) return false;
    sphTo(s.r + dR * f, s.az + daz * f, Math.max(0.035, s.el + del * f));
    return true;
  }

  function fit(force) {
    if (!grp) return;
    const G = grp.userData.G;
    const w = Math.max(G.plot.w, 1.0) + 0.5, d = Math.max(G.plot.d, 1.0) + 0.5;
    const rad = 0.5 * Math.sqrt(w * w + (G.topY + 0.15) * (G.topY + 0.15) + d * d);
    const az = viewOpt.az * RAD, el = Math.max(4, viewOpt.el) * RAD;
    const dist = Math.max(2.1, rad / Math.sin((cam.fov * RAD) / 2) * 0.82);
    const ty = Math.max(0.35, G.topY * 0.45);
    ctl.target.set(0, ty, 0);
    /* Камеру не переставляем руками: задаём только цель, а до неё доезжает
       cameraStep. И не возвращаем вид «весь участок целиком», если человек
       сам приблизил камеру: иначе каждое движение ползунка (размер букв,
       портрета, узора) отбрасывало бы картинку назад. Пересчёт расстояния
       нужен, когда изменились габариты модели или когда нажали кнопку вида. */
    const grew = !fitRef || Math.abs(dist - fitRef) > fitRef * 0.04;
    if (force || !userZoom || grew) {
      wantR = dist; fitRef = dist;
      if (force) userZoom = false;
      if (firstFit) { firstFit = false; sphTo(dist, az, el); }
    }
    key.target.position.set(0, ty, 0);
    key.position.set(dist * 0.55, dist * 0.95, dist * 0.40);
    const half = rad * 1.6;
    key.shadow.camera.left = -half; key.shadow.camera.right = half;
    key.shadow.camera.top = half; key.shadow.camera.bottom = -half;
    key.shadow.camera.near = 0.4; key.shadow.camera.far = rad * 8 + 8;
    key.shadow.camera.updateProjectionMatrix();
    ctl.update();
  }

  function draw() { r.render(sc, cam); }

  function rebuild(next) {
    state = next;
    const G = window.ENGINE.geo(cfg, state);
    const FZ = faceSize(state, G);
    const im = imgOf(state.engr.photo, () => { if (state) updateFace(); });
    const face = drawFace(state, im, FZ);
    if (grp) { sc.remove(grp); dispose(grp); }
    grp = build(cfg, state, face, FZ, G);
    sc.add(grp);
    fit();
    draw();
  }
  function updateFace() {
    if (!grp || !state) return;
    const G = grp.userData.G, FZ = grp.userData.fz || faceSize(state, G);
    const face = drawFace(state, imgOf(state.engr.photo, () => updateFace()), FZ);
    disposeFace(grp);
    const ft = new THREE.CanvasTexture(face);
    ft.colorSpace = THREE.SRGBColorSpace;
    ft.anisotropy = ANISO;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(FZ.w, FZ.h), faceMat(ft));
    plane.position.set(0, grp.userData.topY + FZ.cy, grp.userData.pz + G.stela.th / 2 + DECAL_Z);
    grp.add(plane);
    grp.userData.face = plane;
    draw();
  }

  function resize() {
    const w = host.clientWidth || 320, h = host.clientHeight || 240;
    r.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    draw();
  }
  function loop() {
    /* OrbitControls отрабатывает ПЕРЕД нашим подлётом: он каждый кадр
       пересчитывает позицию камеры из своих углов, и если запускать его
       после нашего подлёта, он возвращает старое расстояние — камера не
       доезжает до цели и ползёт за ней вечность */
    const orbit = ctl.update();
    const eased = cameraStep();
    if (orbit || eased) draw();
    requestAnimationFrame(loop);
  }

  applyBg(sc, ground, key, hemi, bgKind);
  resize();
  loop();

  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host); else window.addEventListener("resize", resize);

  return {
    update: rebuild,
    view(name) {
      const a = { front: [0, 16], "3/4": [34, 26], top: [0, 78], back: [180, 24] }[name];
      if (!a) return;
      viewOpt.az = a[0]; viewOpt.el = a[1];
      fit(true); draw();   /* кнопка вида всегда перестраивает кадр заново */
    },
    bg(kind) { bgKind = kind; applyBg(sc, ground, key, hemi, kind); draw(); },
    png() { draw(); const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "proekt-pamyatnika.png"; a.click(); },
    resize: resize,
    env: env,
    destroy() {
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
      ctl.dispose();
      if (grp) dispose(grp);
      pmrem.dispose();
      r.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}

/* чистим геометрию и материалы, чтобы переключение опций не жрало память */
function dispose(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const m = n.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((x) => { if (x !== METAL) x.dispose(); });
  });
}
function disposeFace(grp) {
  const p = grp.userData.face;
  if (!p) return;
  grp.remove(p);
  if (p.geometry) p.geometry.dispose();
  if (p.material) { if (p.material.map) p.material.map.dispose(); p.material.dispose(); }
  grp.userData.face = null;
}

/* экспорт для отладки без браузера не нужен: сцена живёт в окне */
if (typeof window !== "undefined") window.MON3D = { create: create };
