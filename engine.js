/* ============================================================
   engine.js — единственное место, где живут схема состояния,
   геометрия и расчёт сметы. 3D-сцена и смета считают по одним
   и тем же размерам, поэтому цифры и картинка не расходятся.

   Схема состояния (её же описывают пути в пресетах config.js):
     stela.form | stela.w | stela.h | stela.th | stela.stone | stela.sides
     tumba | cvetnik | cover | fence | plot.w | plot.d
     engr.fio | engr.years | epitaph | engr.cross | engr.art
     engr.photoMode (none|stone|glass|metal) | engr.photo (dataURL)
     extras.<id> | view | bg
   ============================================================ */

/* ---------- мелкие помощники ---------- */
function num(v, dflt) {
  var n = (typeof v === "number") ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isFinite(n) ? n : dflt;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function r0(v) { var n = Number(v); return (isFinite(n) && n > 0) ? Math.round(n) : 0; }
function n2(v) { return (Math.round(Number(v) * 100) / 100).toFixed(2).replace(".", ","); }
function letters(txt) { return String(txt || "").replace(/[^\p{L}]/gu, "").length; }
function listIds(arr) { return arr || []; }
function hasId(arr, id) {
  var a = arr || [];
  for (var i = 0; i < a.length; i++) if (a[i] && a[i].id === id) return true;
  return false;
}
function pickId(arr, id, dflt) { return hasId(arr, id) ? id : dflt; }
function find(arr, id) {
  var a = arr || [];
  for (var i = 0; i < a.length; i++) if (a[i] && a[i].id === id) return a[i];
  return null;
}
function nameOf(cfg, group, id, dflt) {
  var e = find(cfg[group], id);
  return (e && e.name) ? e.name : (dflt || id);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* текст с клавиатуры: переносы строк в однострочных полях недопустимы,
   иначе они ломают разметку грани и смета-письмо */
function oneLine(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/* ============================================================
   Значения по умолчанию: всё, чего нет в ссылке или пресете,
   берётся отсюда.
   ============================================================ */
/* Набор узоров всегда одной формы: ключи есть у каждого узора из cfg.uzory,
   включено только то, что правда есть в списке. Так ссылку, пресет и ручной
   ввод нельзя «сломать» лишним или забытым узором.
   legacy — старые ссылки, где «Крест на стеле» и «Художественная гравировка»
   были отдельными галочками вне узоров: переносим их в список узоров, чтобы
   отправленная ранее ссылка не показывала пустой камень. */
function uzoryFlags(cfg, src, legacy) {
  var o = {};
  (cfg.uzory || []).forEach(function (u) {
    var v = (src && typeof src === "object") ? src[u.id] : null;
    var on = (v === true || v === "true" || v === 1);
    if (!on && v == null && legacy) {
      if (u.id === "krest" && (legacy.cross === true || legacy.cross === "true")) on = true;
      if (u.id === "ramka" && (legacy.art === true || legacy.art === "true")) on = true;
    }
    o[u.id] = on;
  });
  return o;
}

/* Элементы, которые можно сдвинуть, повернуть и изменить в размере:
   буквы, даты, эпитафия, портрет и каждый узор из списка. */
function tfIds(cfg) {
  return ["fio", "years", "epitaph", "photo"].concat((cfg.uzory || []).map(function (u) { return u.id; }));
}
function tfFlags(cfg, src) {
  var out = {};
  tfIds(cfg).forEach(function (id) {
    var t = (src && typeof src === "object") ? src[id] : null;
    if (!t || typeof t !== "object") return;
    var dx = clamp(num(t.dx, 0), -0.45, 0.45);      // сдвиг по горизонтали, метры
    var dy = clamp(num(t.dy, 0), -0.45, 0.45);      // сдвиг по вертикали, метры
    var rot = clamp(num(t.rot, 0), -90, 90);        // поворот, градусы
    var sc = clamp(num(t.sc, 1), 0.4, 2.5);         // размер, множитель
    if (dx || dy || rot || sc !== 1) out[id] = { dx: dx, dy: dy, rot: rot, sc: sc };
  });
  return out;
}

function defaultState(cfg) {
  var size = (cfg.sizes && cfg.sizes[2]) || (cfg.sizes && cfg.sizes[0]) || { w: 0.60, h: 0.90, th: 0.08 };
  /* участок, с которого начинают сборку: id из cfg.defaults.plot.
     Самый маленький вариант выглядит тесно — человек видит памятник
     впритык к ограде и пугается, что «не влезет» */
  var plot = null, pfix = (cfg.defaults && cfg.defaults.plot);
  if (pfix && cfg.plots) {
    for (var pi = 0; pi < cfg.plots.length; pi++) {
      if (cfg.plots[pi].id === pfix) { plot = cfg.plots[pi]; break; }
    }
  }
  if (!plot) plot = (cfg.plots && cfg.plots[2]) || (cfg.plots && cfg.plots[1]) || { w: 1.70, d: 1.20 };
  var extras = {};
  (cfg.extras || []).forEach(function (e) {
    extras[e.id] = !!e.always || e.id === "vases";     // вазы по умолчанию включены
  });
  return {
    stela: {
      form: (cfg.forms && cfg.forms[0] && cfg.forms[0].id) || "pryam",
      w: size.w, h: size.h, th: size.th,
      stone: (cfg.stones && cfg.stones[0] && cfg.stones[0].id) || "gabbro",
      sides: (cfg.sides && cfg.sides[0] && cfg.sides[0].id) || "rock"
    },
    tumba: (cfg.tumbas && cfg.tumbas[2] && cfg.tumbas[2].id) || "two",
    cvetnik: (cfg.cvetniki && cfg.cvetniki[1] && cfg.cvetniki[1].id) || "gran",
    cover: (cfg.covers && cfg.covers[1] && cfg.covers[1].id) || "crumb",
    fence: (cfg.fences && cfg.fences[1] && cfg.fences[1].id) || "metal",
    plot: { w: plot.w, d: plot.d },
    engr: (function () {
      var t = (cfg.defaults && cfg.defaults.engr) || {};
      return {
        fio: oneLine(t.fio, 60), years: oneLine(t.years, 40), epitaph: oneLine(t.epitaph, 90),
        cross: !!t.cross, art: !!t.art, photoMode: "none", photo: null,
        /* масштаб надписи и портрета: 1 = как подобрано автоматически */
        textScale: clamp(num(t.textScale, 1), 0.6, 1.8),
        photoScale: clamp(num(t.photoScale, 1), 0.6, 1.8),
        uzScale: clamp(num(t.uzScale, 1), 0.6, 1.8),
        uz: uzoryFlags(cfg, t.uz, t),
        tf: {}
      };
    })(),
    extras: extras,
    view: "3/4",
    bg: "uchastok"
  };
}

/* ---------- чистим любое входящее состояние: ссылки, пресеты,
   ручной ввод — всё равно должно дать рабочий объект ---------- */
function sanitize(state, cfg) {
  var d = defaultState(cfg);
  var ok = state && typeof state === "object" && state.stela && state.engr;
  var s = ok ? state : d;
  var st = (s.stela && typeof s.stela === "object") ? s.stela : {};
  var pl = (s.plot && typeof s.plot === "object") ? s.plot : {};
  var en = (s.engr && typeof s.engr === "object") ? s.engr : {};

  var out = {
    stela: {
      form: pickId(cfg.forms, st.form, d.stela.form),
      w: clamp(num(st.w, d.stela.w), 0.30, 1.80),
      h: clamp(num(st.h, d.stela.h), 0.40, 2.40),
      th: clamp(num(st.th, d.stela.th), 0.04, 0.25),
      stone: pickId(cfg.stones, st.stone, d.stela.stone),
      sides: pickId(cfg.sides, st.sides, d.stela.sides)
    },
    tumba: pickId(cfg.tumbas, s.tumba, d.tumba),
    cvetnik: pickId(cfg.cvetniki, s.cvetnik, d.cvetnik),
    cover: pickId(cfg.covers, s.cover, d.cover),
    fence: pickId(cfg.fences, s.fence, d.fence),
    plot: { w: clamp(num(pl.w, d.plot.w), 0.70, 4.00), d: clamp(num(pl.d, d.plot.d), 0.60, 3.00) },
    engr: {
      fio: oneLine(en.fio == null ? d.engr.fio : en.fio, 60),
      years: oneLine(en.years == null ? d.engr.years : en.years, 40),
      epitaph: oneLine(en.epitaph == null ? d.engr.epitaph : en.epitaph, 90),
      cross: !!en.cross,
      art: !!en.art,
      photoMode: (["none", "stone", "glass", "metal"].indexOf(en.photoMode) >= 0) ? en.photoMode : "none",
      photo: (typeof en.photo === "string" && en.photo.indexOf("data:image/") === 0) ? en.photo : null,
      /* масштаб букв и фото держим в разумных пределах: меньше 0,6 —
         на камне нечитаемо, больше 1,8 — выходит за гравировальную площадку */
      textScale: clamp(num(en.textScale, d.engr.textScale), 0.60, 1.80),
      photoScale: clamp(num(en.photoScale, d.engr.photoScale), 0.60, 1.80),
      uzScale: clamp(num(en.uzScale, d.engr.uzScale), 0.60, 1.80),
      uz: uzoryFlags(cfg, en.uz, en),
      tf: tfFlags(cfg, en.tf)
    },
    extras: {},
    view: (["front", "3/4", "top", "back"].indexOf(s.view) >= 0) ? s.view : "3/4",
    bg: (["uchastok", "studio", "sky"].indexOf(s.bg) >= 0) ? s.bg : "uchastok"
  };

  (cfg.extras || []).forEach(function (e) {
    var src = (s.extras && typeof s.extras === "object") ? s.extras[e.id] : undefined;
    out.extras[e.id] = e.always ? true : (src === undefined ? !!d.extras[e.id] : !!src);
  });

  /* участок обязан быть шире стелы, иначе ограда «съедает» памятник */
  out.plot.w = Math.max(out.plot.w, out.stela.w + 0.30);
  out.plot.d = Math.max(out.plot.d, out.stela.th + 0.60);
  return out;
}

/* ---------- пресеты: set = { "путь.к.значению": значение } ---------- */
function setPath(o, path, val) {
  var keys = String(path).split(".");
  var t = o;
  for (var i = 0; i < keys.length - 1; i++) {
    if (!t[keys[i]] || typeof t[keys[i]] !== "object") t[keys[i]] = {};
    t = t[keys[i]];
  }
  t[keys[keys.length - 1]] = val;
  return o;
}
function applySet(state, set, cfg) {
  var s = clone(state || defaultState(cfg));
  Object.keys(set || {}).forEach(function (k) { setPath(s, k, set[k]); });
  return sanitize(s, cfg);
}
function presetById(cfg, id) { return find(cfg.presets, id); }
function applyPreset(state, id, cfg) {
  var pr = presetById(cfg, id);
  return pr ? applySet(state, pr.set, cfg) : null;
}

/* ============================================================
   Геометрия. Метры; участок центрирован в (0,0), покрытие
   лежит снизу вверх; стела стоит на постаменте лицом к +Z.
   ============================================================ */
function tumbaBlocks(cfg, s) {
  var t = find(cfg.tumbas, s.tumba) || {};
  var topW = s.stela.w + 0.24;
  var topD = clamp(s.plot.d * 0.30, 0.24, 0.42);
  var raw = (t.blocks || []).map(function (b) {
    return { w: topW + num(b.dw, 0), d: topD + num(b.dd, 0), h: clamp(num(b.h, 0.12), 0.04, 0.40) };
  });
  if (!raw.length) raw = [{ w: topW + 0.10, d: topD + 0.06, h: 0.05 }];   // плита под стелой
  var rows = [], acc = 0, vol = 0;
  raw.forEach(function (b) {
    var w = Math.min(b.w, s.plot.w - 0.20);
    var d = Math.min(b.d, s.plot.d - 0.20);
    rows.push({ w: w, d: d, h: b.h, y: acc });
    vol += w * d * b.h;
    acc += b.h;
  });
  return { rows: rows, h: acc, vol: vol, topW: rows.length ? rows[rows.length - 1].w : topW,
           topD: rows.length ? rows[rows.length - 1].d : topD };
}
function cvetSize(cfg, s) {
  var w = Math.min(s.stela.w + 0.50, s.plot.w - 0.24);
  var d = clamp(s.plot.d - 0.80, 0.28, 0.60);
  return { w: w, d: d, per: 2 * (w + d) };
}
function geo(cfg, state) {
  var s = sanitize(state, cfg);
  var T = tumbaBlocks(cfg, s);
  var C = cvetSize(cfg, s);
  var slab = 0.04;                                     // толщина покрытия
  return {
    plot: { w: s.plot.w, d: s.plot.d, area: s.plot.w * s.plot.d, per: 2 * (s.plot.w + s.plot.d) },
    slab: slab,
    tumba: { rows: T.rows, h: T.h, vol: T.vol, topW: T.topW, topD: T.topD },
    stela: { w: s.stela.w, h: s.stela.h, th: s.stela.th, face: s.stela.w * s.stela.h },
    cvet: { w: C.w, d: C.d, per: C.per },
    baseY: T.h + slab,                                 // низ стелы
    topY: T.h + slab + s.stela.h                       // верх стелы: нужен для кадра
  };
}

/* ============================================================
   Смета. Порядок позиций фиксирован: стела → постамент →
   цветник → покрытие → ограда → гравировка → допы.
   ============================================================ */
function price(cfg, state) {
  var s = sanitize(state, cfg);
  var G = geo(cfg, s);
  var form = find(cfg.forms, s.stela.form) || { k: 1, name: "стела" };
  var stone = find(cfg.stones, s.stela.stone) || { m2: 0, m3: 0, name: "камень" };
  var side = find(cfg.sides, s.stela.sides) || { k: 1, name: "бока" };
  var t = find(cfg.tumbas, s.tumba) || { k: 0, name: "без постамента" };
  var cv = find(cfg.cvetniki, s.cvetnik) || { per: 0, name: "без цветника" };
  var cov = find(cfg.covers, s.cover) || { rate: 0, name: "покрытие" };
  var fen = find(cfg.fences, s.fence) || { per: 0, name: "без ограды" };
  var EG = cfg.engrave || {};
  var items = [], total = 0;

  function add(group, name, note, sum) {
    var v = r0(sum);
    if (v <= 0) return;
    items.push({ group: group, name: name, note: note || "", sum: v });
    total += v;
  }

  /* стела: лицевая плоскость × цена м² × надбавка за контур и бока */
  var m2 = num(stone.m2, 0) * num(form.k, 1) * num(side.k, 1);
  add("Стела",
      nameOf(cfg, "forms", s.stela.form) + " " + r0(s.stela.w * 100) + "×" + r0(s.stela.h * 100) + "×" + r0(s.stela.th * 100) + " см, "
      + stone.name,
      n2(G.stela.face) + " м² × " + r0(m2) + " за м² (контур ×" + num(form.k, 1)
      + ", бока «" + nameOf(cfg, "sides", s.stela.sides) + "» ×" + num(side.k, 1) + ")",
      G.stela.face * m2);

  /* постамент: объём камня × цена м³ × работы */
  if (G.tumba.vol > 0 && num(t.k, 0) > 0) {
    add("Постамент", nameOf(cfg, "tumbas", s.tumba) + ", " + stone.name,
        n2(G.tumba.vol) + " м³ × " + r0(stone.m3) + " за м³ × работы ×" + num(t.k, 1),
        G.tumba.vol * num(stone.m3, 0) * num(t.k, 1));
  }

  if (num(cv.per, 0) > 0) {
    add("Цветник", nameOf(cfg, "cvetniki", s.cvetnik) + ", " + n2(G.cvet.per) + " пог. м",
        r0(G.cvet.w * 100) + "×" + r0(G.cvet.d * 100) + " см", G.cvet.per * cv.per);
  }
  if (num(cov.rate, 0) > 0) {
    add("Покрытие", nameOf(cfg, "covers", s.cover) + ", " + n2(G.plot.area) + " м²", "",
        G.plot.area * cov.rate);
  }
  if (num(fen.per, 0) > 0) {
    add("Ограда", nameOf(cfg, "fences", s.fence) + ", " + n2(G.plot.per) + " пог. м", "",
        G.plot.per * fen.per);
  }

  /* гравировка: по буквам — потому что клиент правит имя и цена меняется сразу */
  var L = letters(s.engr.fio);
  if (L > 0 && num(EG.letter, 0) > 0) add("Гравировка", "ФИО, " + L + " букв", s.engr.fio, L * EG.letter);
  if (String(s.engr.years || "").trim() && num(EG.years, 0) > 0) add("Гравировка", "Даты жизни", s.engr.years, EG.years);
  if (s.engr.epitaph && String(s.engr.epitaph).trim()) {
    var el = letters(s.engr.epitaph);
    if (el > 0) add("Гравировка", "Эпитафия, " + el + " букв", s.engr.epitaph, el * num(EG.letter, 0));
  }
  /* крест и рамка теперь в списке узоров: цена берётся из engrave.uz,
     отдельной строкой их больше не добавляем */
  /* узоры: каждый включённый — своей строкой в смете, цена из engrave.uz;
     так клиент видит, за что именно он платит, если взял вазу и бордюр */
  var UZP = EG.uz || {};
  (cfg.uzory || []).forEach(function (u) {
    if (!s.engr.uz || !s.engr.uz[u.id]) return;
    var up = num(UZP[u.id], 0);
    if (up > 0) add("Узоры", u.name, u.hint || "", up);
  });
  if (s.engr.photoMode !== "none") {
    var rate = s.engr.photoMode === "stone" ? EG.photoStone
      : s.engr.photoMode === "glass" ? EG.photoGlass : EG.photoMetal;
    var label = s.engr.photoMode === "stone" ? "Портрет пескоструём в камне"
      : s.engr.photoMode === "glass" ? "Портрет в стекле (металлокерамика)"
        : "Портрет на металлической табличке";
    add("Портрет", label,
        s.engr.photo ? "фото клиента загружено" : "фото ещё не загружено — цена та же",
        num(rate, 0));
  }

  (cfg.extras || []).forEach(function (e) {
    if (s.extras[e.id]) add("Дополнительно", e.name, e.always ? "входит в заказ всегда" : "", num(e.price, 0));
  });

  var inst = (cfg.money.installments || []).filter(function (m) { return m > 0; })
    .map(function (m) { return { months: m, per: Math.round(total / m) }; });

  return { items: items, total: total, geo: G, installments: inst, state: s };
}

/* ---------- упаковка состояния в ссылку: короткая, кириллица ок ---------- */
function packState(s) {
  var flat = {};
  Object.keys(s).forEach(function (k) {
    var v = s[k];
    if (v && typeof v === "object") {
      Object.keys(v).forEach(function (kk) {
        if (k === "engr" && kk === "photo") return;      // фото в ссылку не кладём
        var val = v[kk];
        if (val == null) return;
        flat[k + "." + kk] = (typeof val === "number") ? Math.round(val * 1000) / 1000 : val;
      });
    } else if (v != null) {
      flat[k] = (typeof v === "number") ? Math.round(v * 1000) / 1000 : v;
    }
  });
  var txt = JSON.stringify(flat);
  var b = (typeof btoa === "function")
    ? btoa(String.fromCharCode.apply(null, new TextEncoder().encode(txt)))
    : Buffer.from(txt, "utf-8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unpackState(tok) {
  if (!tok) return null;
  try {
    var b = String(tok).replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    var bin = (typeof atob === "function")
      ? atob(b)
      : Buffer.from(b, "base64").toString("binary");
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var txt = new TextDecoder("utf-8").decode(bytes);
    var flat = JSON.parse(txt), out = {};
    Object.keys(flat).forEach(function (k) { setPath(out, k, flat[k]); });
    return out;
  } catch (e) { return null; }
}

/* ============================================================
   Экспорт: и в браузер (window.ENGINE), и в Node для тестов.
   Все функции, которым нужен прайс, принимают cfg первым
   аргументом — никаких «магических» обёрток.
   ============================================================ */
var Engine = {
  defaultState: defaultState, sanitize: sanitize,
  applySet: applySet, applyPreset: applyPreset, presetById: presetById,
  geo: geo, price: price,
  pack: packState, unpack: unpackState,
  find: find, nameOf: nameOf,
  num: num, n2: n2, r0: r0, letters: letters,
  money: function (v, cfg) { return r0(v) + " " + ((cfg && cfg.money && cfg.money.cur) || "Br"); }
};
if (typeof window !== "undefined") window.ENGINE = Engine;
if (typeof module !== "undefined" && module.exports) module.exports = Engine;
