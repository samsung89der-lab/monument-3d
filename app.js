/* ============================================================
   app.js — интерфейс конструктора: chips, поля, смета, сцена.
   Ничего не считает сам: за размеры отвечает engine.js, за
   картинку — scene.mjs. Здесь только состояние и обвязка.
   ============================================================ */
import { create, stoneSwatch, formOutline } from "./scene.mjs?v=12";
import { CATALOG } from "./forms.mjs?v=2";
import { CATALOG_C } from "./forms-c.mjs?v=1";

const CFG = window.MON_CFG;
const E = window.ENGINE;

const $ = (id) => document.getElementById(id);
const els = {
  brandName: $("brandName"), brandGeo: $("brandGeo"), demoRibbon: $("demoRibbon"), phoneBtn: $("phoneBtn"),
  stage: $("stage"), infoLine: $("infoLine"), viewSeg: $("viewSeg"), bgSeg: $("bgSeg"), pngBtn: $("pngBtn"),
  priceList: $("priceList"), totalSum: $("totalSum"), instLine: $("instLine"), priceNote: $("priceNote"),
  sendBtn: $("sendBtn"), copyBtn: $("copyBtn"), linkBtn: $("linkBtn"), formErr: $("formErr"), shareBox: $("shareBox"),
  tabs: $("tabs"),
  presetChips: $("presetChips"), formDD: $("formDD"), formBtn: $("formBtn"),
  formPanel: $("formPanel"), formSearch: $("formSearch"), formList: $("formList"), formHint: $("formHint"),
  sizeChips: $("sizeChips"),
  sw: $("sw"), sh: $("sh"), sth: $("sth"), stoneChips: $("stoneChips"), sidesChips: $("sidesChips"),
  tumbaChips: $("tumbaChips"),
  efio: $("efio"), eyears: $("eyears"), eepitaph: $("eepitaph"),
  tkScale: $("tkScale"), tkVal: $("tkVal"), ftScale: $("ftScale"), ftVal: $("ftVal"),
  uzList: $("uzList"), uzScale: $("uzScale"), uzVal: $("uzVal"),
  tfChips: $("tfChips"), tfNow: $("tfNow"), tfDx: $("tfDx"), tfDy: $("tfDy"),
  tfDxVal: $("tfDxVal"), tfDyVal: $("tfDyVal"),
  tfRot: $("tfRot"), tfRotVal: $("tfRotVal"), tfSc: $("tfSc"), tfScVal: $("tfScVal"),
  tfReset: $("tfReset"),
  photoChips: $("photoChips"), photoFile: $("photoFile"), photoHint: $("photoHint"), photoClear: $("photoClear"),
  plotChips: $("plotChips"), pw: $("pw"), pd: $("pd"), plotNote: $("plotNote"),
  coverChips: $("coverChips"), cvetChips: $("cvetChips"), fenceChips: $("fenceChips"), extrasList: $("extrasList"),
  cname: $("cname"), cphone: $("cphone"), ccomment: $("ccomment"), cagree: $("cagree"), agreeText: $("agreeText"),
  termsList: $("termsList"), disclaimer: $("disclaimer")
};

/* ---------------- шапка и низ: всё из config.js ---------------- */
els.brandName.textContent = CFG.tenant.name;
els.brandGeo.textContent = CFG.tenant.geo;
els.demoRibbon.hidden = !CFG.demo;
els.phoneBtn.textContent = CFG.tenant.phone;
els.phoneBtn.href = "tel:" + CFG.tenant.phone.replace(/[^+\d]/g, "");
els.disclaimer.textContent = CFG.tenant.disclaimer;
els.agreeText.textContent = "Согласен на обработку персональных данных"
  + (CFG.tenant.privacy && CFG.tenant.privacy !== "#" ? " и с политикой конфиденциальности" : "");
els.termsList.innerHTML = (CFG.tenant.terms || []).map((t) => "<li>" + t + "</li>").join("");
els.priceNote.textContent = CFG.demo
  ? "Цены в демо условные: они показывают механику сметы, а не прайс конкретной мастерской."
  : CFG.tenant.disclaimer;

/* Цены показываем или нет — одна строка в config.js: showPrices: false.
   Механика сметы при этом никуда не девается: вернёте showPrices: true —
   и список позиций, итог и рассрочка снова на месте. */
const PRICES = CFG.showPrices !== false;
if (!PRICES) {
  els.demoRibbon.hidden = true;
  Array.prototype.forEach.call(document.querySelectorAll("[data-price]"), (el) => { el.hidden = true; });
  els.copyBtn.textContent = "Скопировать состав";
  const hero = document.getElementById("heroTitle");
  if (hero) hero.textContent = "Соберите памятник и увидите состав работ сразу";
}

/* Готовые сцены показываем или нет — строка showScenes в config.js.
   Пресеты при этом остаются в конфиге: скрыта только карточка. */
if (!CFG.showScenes) {
  Array.prototype.forEach.call(document.querySelectorAll("[data-scenes]"), (el) => { el.hidden = true; });
}

/* ---------------- состояние ---------------- */
const fromLink = E.unpack((location.hash || "").replace(/^#p=/, ""));
let S = E.sanitize(fromLink, CFG);
let view = null;
const dirty = { size: false, plot: false };      // чем правил клиент, то и показываем в chips

/* ---------------- chips-переключатели ---------------- */
/* Силуэт формы: контур берём из того же списка команд, что идёт в 3D,
   поэтому рисунок в плитке и камень на модели совпадают. */
function silSvg(form) {
  if (!form) return "";
  const o = formOutline(form);
  const W = 44, H = 54, pad = 4;
  const sc = Math.min((W - pad * 2) / o.w, (H - pad * 2) / o.h);
  const dx = (W - o.w * sc) / 2, dy = H - pad;
  const X = (x) => (dx + (x + o.w / 2) * sc).toFixed(1);
  const Y = (y) => (dy - y * sc).toFixed(1);
  let d = "";
  o.cmds.forEach((c) => {
    if (c[0] === "M") d += "M" + X(c[1]) + " " + Y(c[2]);
    else if (c[0] === "L") d += "L" + X(c[1]) + " " + Y(c[2]);
    else if (c[0] === "Q") d += "Q" + X(c[1]) + " " + Y(c[2]) + " " + X(c[3]) + " " + Y(c[4]);
    else if (c[0] === "C") d += "C" + X(c[1]) + " " + Y(c[2]) + " " + X(c[3]) + " " + Y(c[4]) + " " + X(c[5]) + " " + Y(c[6]);
    else d += "Z";
  });
  return '<svg class="sil" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><path d="' + d + '"/></svg>';
}
function chipSet(host, items, getVal, setVal) {
  host.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = it.id;
    b.className = it.sil ? "has-sil" : "";
    b.innerHTML = (it.swatch
      ? '<span class="sw" style="--c1:' + it.swatch[0] + ";--c2:" + it.swatch[1] + ";--c3:" + it.swatch[2]
        + (it.thumb ? ";background-image:url(" + it.thumb + ")" : "") + '"></span>'
      : "") + silSvg(it.sil) + "<b>" + it.name + "</b>" + (it.hint ? "<small>" + it.hint + "</small>" : "");
    b.addEventListener("click", () => { setVal(it.id); S = E.sanitize(S, CFG); render(); });
    host.appendChild(b);
  });
}
function mark(host) {
  const on = host.dataset.val || "";
  Array.prototype.forEach.call(host.children, (b) => b.classList.toggle("on", b.dataset.id === on));
}
function pick(host, val) { host.dataset.val = val; mark(host); }

chipSet(els.presetChips, CFG.presets, null, (id) => { S = E.applyPreset(S, id, CFG); });

/* ---------------- выбор формы: выпадающий список с силаэтами ----------------
   Свои формы из config.js плюс каталожные из forms.mjs (номера с листов
   каталога форм). Каталог кладём в тот же список, чтобы цена, смета и проверка
   состояния работали одинаково для любых форм. */
Object.keys(CATALOG).forEach((id) => {
  const c = CATALOG[id];
  CFG.forms.push({ id: id, name: "\u2116 " + c.num + " \u00b7 " + c.name, k: c.k || 1.24, hint: c.hint });
});
/* серии С с листов 11–20: имена — это коды из каталога */
Object.keys(CATALOG_C).forEach((id) => {
  const c = CATALOG_C[id];
  CFG.forms.push({ id: id, name: c.code, k: c.k || 1.3, hint: c.hint, ar: c.ar });
});
CFG.forms.forEach((f) => { f.sil = f.id; });
const FORMS = CFG.forms;

/* Фигуры серий С сняты с фотографий, у них своя пропорция (например
   wide-табличка шире высоты в 1.4 раза). Если выбранный размер сильно
   отличается от пропорции с листа, подгоняем ширину под высоту — иначе
   трёхмерная фигура вытянется и будет не похожа на оригинал. Размер
   потом можно поменять руками в поле «Размер стелы». */
let sizeNote = "";
function fitSizeToForm(it) {
  const ar = it.ar;
  if (!ar || ar <= 0) return;
  const cur = S.stela.w / S.stela.h;
  if (Math.abs(cur - ar) / ar <= 0.12) return;
  let w = Math.round(S.stela.h * ar * 100) / 100;
  let h = S.stela.h;
  if (w > 1.80) { w = 1.80; h = Math.round((w / ar) * 100) / 100; }
  if (w < 0.30) { w = 0.30; h = Math.round((w / ar) * 100) / 100; }
  S.stela.w = w;
  S.stela.h = h;
  dirty.size = true;
  sizeNote = "размер подогнан под форму: " + Math.round(w * 100) + "\u00d7" + Math.round(h * 100) + " см";
}

function formRow(it) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.id = it.id;
  b.className = "dd-row" + (it.id === S.stela.form ? " on" : "");
  b.innerHTML = silSvg(it.id) + '<span class="dd-t"><b>' + it.name + "</b>"
    + (it.hint ? "<small>" + it.hint + "</small>" : "") + "</span>";
  b.addEventListener("click", () => {
    S.stela.form = it.id;
    sizeNote = "";
    if (it.ar) fitSizeToForm(it);
    S = E.sanitize(S, CFG);
    openFormList(false);
    render();
  });
  return b;
}
function paintFormList() {
  const q = (els.formSearch.value || "").trim().toLowerCase();
  els.formList.innerHTML = "";
  let shown = 0;
  FORMS.forEach((it) => {
    const text = (it.name + " " + (it.hint || "")).toLowerCase();
    if (q && text.indexOf(q) < 0) return;
    shown++;
    els.formList.appendChild(formRow(it));
  });
  if (!shown) {
    els.formList.innerHTML = '<div class="dd-none">Ничего не нашлось — попробуйте номер, например 17</div>';
  }
}
function markForm() {
  const it = FORMS.filter((x) => x.id === S.stela.form)[0] || FORMS[0];
  els.formBtn.querySelector(".dd-sil").innerHTML = silSvg(it.id);
  els.formBtn.querySelector(".dd-name").textContent = it.name;
  els.formHint.textContent = sizeNote ? ((it.hint || "") + " \u00b7 " + sizeNote) : (it.hint || "");
  Array.prototype.forEach.call(els.formList.children, (b) => {
    b.classList.toggle("on", b.dataset.id === S.stela.form);
  });
}
function openFormList(on) {
  els.formPanel.hidden = !on;
  els.formBtn.classList.toggle("open", on);
  if (on) paintFormList();
}
els.formBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openFormList(els.formPanel.hidden);
});
els.formSearch.addEventListener("input", paintFormList);
els.formSearch.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", (e) => {
  if (!els.formDD.contains(e.target)) openFormList(false);
});
chipSet(els.sizeChips, CFG.sizes, null, (id) => {
  const sz = E.find(CFG.sizes, id);
  if (sz) { S.stela.w = sz.w; S.stela.h = sz.h; S.stela.th = sz.th; }
  dirty.size = true;
});
/* образец камня рисуем из той же фактуры, что и модель: файлов нет */
CFG.stones.forEach((s) => { try { s.thumb = stoneSwatch(s.pal || s.id); } catch (e) { s.thumb = ""; } });
chipSet(els.stoneChips, CFG.stones, null, (id) => { S.stela.stone = id; });
chipSet(els.sidesChips, CFG.sides, null, (id) => { S.stela.sides = id; });
chipSet(els.tumbaChips, CFG.tumbas, null, (id) => { S.tumba = id; });
chipSet(els.coverChips, CFG.covers, null, (id) => { S.cover = id; });
chipSet(els.cvetChips, CFG.cvetniki, null, (id) => { S.cvetnik = id; });
chipSet(els.fenceChips, CFG.fences, null, (id) => { S.fence = id; });
chipSet(els.plotChips, CFG.plots, null, (id) => {
  const p = E.find(CFG.plots, id);
  if (p) { S.plot.w = p.w; S.plot.d = p.d; }
  dirty.plot = true;
});

/* ---------------- поля размеров ---------------- */
function wireNum(el, apply) {
  el.addEventListener("input", () => {
    const v = parseFloat(String(el.value).replace(",", "."));
    if (!isFinite(v)) return;
    apply(v);
    S = E.sanitize(S, CFG);
    render();
  });
}
/* размеры в полях — в сантиметрах: так про размер говорит живой человек,
   а внутри (и в смете) расчёт идёт в метрах, поэтому здесь /100 */
wireNum(els.sw, (v) => { S.stela.w = v / 100; dirty.size = true; });
wireNum(els.sh, (v) => { S.stela.h = v / 100; dirty.size = true; });
wireNum(els.sth, (v) => { S.stela.th = v / 100; dirty.size = true; });
wireNum(els.pw, (v) => { S.plot.w = v / 100; dirty.plot = true; });
wireNum(els.pd, (v) => { S.plot.d = v / 100; dirty.plot = true; });

/* ---------------- гравировка и портрет ---------------- */
[
  [els.efio, "fio"], [els.eyears, "years"], [els.eepitaph, "epitaph"]
].forEach(([el, key]) => el.addEventListener("input", () => {
  S.engr[key] = el.value;
  S = E.sanitize(S, CFG);
  render();
}));
/* крест и рамка переехали в список узоров — отдельные галочки здесь не нужны,
   старые ссылки движок переносит в узоры сам */

/* ползунки «Размер надписи» и «Размер портрета»: проценты -> множитель,
   границы срежет sanitize в движке, так что руками можно не ограничивать */
function wireScale(el, apply) {
  el.addEventListener("input", () => {
    const v = parseFloat(el.value);
    if (!isFinite(v)) return;
    apply(v / 100);
    S = E.sanitize(S, CFG);
    render();
  });
}
wireScale(els.tkScale, (v) => { S.engr.textScale = v; });
wireScale(els.ftScale, (v) => { S.engr.photoScale = v; });
wireScale(els.uzScale, (v) => { S.engr.uzScale = v; });

/* узоры: список галочок строим из cfg.uzory — чтобы новый узор добавлялся
   одной строчкой в config.js и не требовать правки интерфейса */
els.uzList.innerHTML = "";
(CFG.uzory || []).forEach((u) => {
  const lab = document.createElement("label");
  lab.className = "switch";
  const cb = document.createElement("input");
  lab.appendChild(cb);
  cb.type = "checkbox";
  cb.setAttribute("data-uz", u.id);
  lab.appendChild(document.createTextNode(u.name));
  if (u.hint) {
    const h = document.createElement("span");
    h.className = "hint";
    h.textContent = " — " + u.hint;
    lab.appendChild(h);
  }
  cb.checked = !!(S.engr.uz && S.engr.uz[u.id]);
  cb.addEventListener("change", () => {
    if (!S.engr.uz) S.engr.uz = {};
    S.engr.uz[u.id] = cb.checked;
    S = E.sanitize(S, CFG);
    render();
  });
  els.uzList.appendChild(lab);
});

/* Доводка элементов на камне. Человек выбирает, что править (ФИО, даты,
   эпитафию, портрет или любой включённый узор), и для выбранного двигает
   его вбок, вверх-вниз, поворачивает и меняет размер. Хранится это в
   S.engr.tf; движок оставляет только те элементы, которые правда тронули,
   поэтому ссылка на проект от доводки не разрастается. */
let tfSel = "";
function tfItems() {
  const list = [];
  if (String(S.engr.fio || "").trim()) list.push({ id: "fio", name: "ФИО" });
  if (String(S.engr.years || "").trim()) list.push({ id: "years", name: "Даты" });
  if (String(S.engr.epitaph || "").trim()) list.push({ id: "epitaph", name: "Эпитафия" });
  if (S.engr.photoMode !== "none") list.push({ id: "photo", name: "Портрет" });
  (CFG.uzory || []).forEach((u) => {
    if (S.engr.uz && S.engr.uz[u.id]) list.push({ id: u.id, name: u.name });
  });
  return list;
}
function tfVal(id) {
  const t = (id && S.engr.tf && S.engr.tf[id]) || {};
  const n = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  return { dx: n(t.dx, 0), dy: n(t.dy, 0), rot: n(t.rot, 0), sc: n(t.sc, 1) };
}
function tfSet(part, v) {
  if (!tfSel || !isFinite(v)) return;
  if (!S.engr.tf) S.engr.tf = {};
  const t = tfVal(tfSel);
  t[part] = v;
  S.engr.tf[tfSel] = t;
  S = E.sanitize(S, CFG);
  render();
}
chipSet(els.tfChips, [], null, (id) => { tfSel = id; });
els.tfDx.addEventListener("input", () => tfSet("dx", parseFloat(els.tfDx.value) / 100));
els.tfDy.addEventListener("input", () => tfSet("dy", parseFloat(els.tfDy.value) / 100));
els.tfRot.addEventListener("input", () => tfSet("rot", parseFloat(els.tfRot.value)));
els.tfSc.addEventListener("input", () => tfSet("sc", parseFloat(els.tfSc.value) / 100));
els.tfReset.addEventListener("click", () => {
  if (tfSel && S.engr.tf) delete S.engr.tf[tfSel];
  S = E.sanitize(S, CFG);
  render();
});

/* кнопки выбора элемента перестраиваем только когда список правда поменялся
   (включили узор, добавили портрет) — иначе человек теряет палец на кнопке */
function syncTf() {
  const items = tfItems();
  const ids = items.map((i) => i.id).join(",");
  if (els.tfChips.dataset.ids !== ids) {
    els.tfChips.dataset.ids = ids;
    chipSet(els.tfChips, items, null, (id) => { tfSel = id; });
  }
  const have = items.some((i) => i.id === tfSel);
  if (!have) tfSel = items.length ? items[0].id : "";
  pick(els.tfChips, tfSel);
  const cur = items.filter((i) => i.id === tfSel)[0];
  els.tfNow.textContent = cur ? "Сейчас правим: " + cur.name + ". Ползунки действуют только на него."
    : "Двигать пока нечего: включите портрет, узор или напишите текст.";
  const t = tfVal(tfSel);
  const dis = !tfSel;
  els.tfDx.value = String(Math.round(t.dx * 100));
  els.tfDy.value = String(Math.round(t.dy * 100));
  els.tfRot.value = String(Math.round(t.rot));
  els.tfSc.value = String(Math.round(t.sc * 100));
  els.tfDxVal.textContent = Math.round(t.dx * 100) + " см";
  els.tfDyVal.textContent = Math.round(t.dy * 100) + " см";
  els.tfRotVal.textContent = Math.round(t.rot) + "°";
  els.tfScVal.textContent = Math.round(t.sc * 100) + "%";
  els.tfDx.disabled = els.tfDy.disabled = dis;
  els.tfRot.disabled = els.tfSc.disabled = els.tfReset.disabled = dis;
}

const PHOTO_MODES = [
  { id: "none", name: "Без портрета", hint: "только текст" },
  { id: "stone", name: "В камень", hint: "пескоструём, чёрный габбро" },
  { id: "glass", name: "В стекле", hint: "металлокерамика" },
  { id: "metal", name: "На табличке", hint: "металл, крепёж" }
];
chipSet(els.photoChips, PHOTO_MODES, null, (id) => {
  S.engr.photoMode = id;
  S = E.sanitize(S, CFG);
  render();
});
els.photoFile.addEventListener("change", () => {
  const f = els.photoFile.files && els.photoFile.files[0];
  if (!f) return;
  if (f.size > 4 * 1024 * 1024) { els.formErr.textContent = "Фоту тяжеловата: сожмите до 4 МБ."; return; }
  const fr = new FileReader();
  fr.onload = () => {
    S.engr.photo = String(fr.result);
    if (S.engr.photoMode === "none") S.engr.photoMode = "glass";
    S = E.sanitize(S, CFG);
    els.formErr.textContent = "";
    render();
  };
  fr.readAsDataURL(f);
});
els.photoClear.addEventListener("click", () => {
  S.engr.photo = null;
  S.engr.photoMode = "none";
  els.photoFile.value = "";
  S = E.sanitize(S, CFG);
  render();
});

/* ---------------- extras ---------------- */
els.extrasList.innerHTML = "";
CFG.extras.forEach((e) => {
  const l = document.createElement("label");
  l.className = "switch";
  l.innerHTML = '<input type="checkbox" data-extra="' + e.id + '"' + (e.always ? " checked disabled" : "") + ">"
    + "<span>" + e.name + (PRICES ? ' <b>' + E.money(e.price, CFG) + "</b>" : "") + "</span>";
  els.extrasList.appendChild(l);
  const box = l.querySelector("input");
  box.checked = !!S.extras[e.id];
  if (!e.always) box.addEventListener("change", () => { S.extras[e.id] = box.checked; S = E.sanitize(S, CFG); render(); });
});

/* ---------------- tabs и сегменты ---------------- */
els.tabs.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-tab]");
  if (!b) return;
  Array.prototype.forEach.call(els.tabs.children, (x) => x.classList.toggle("on", x === b));
  ["mon", "engr", "cvet", "plot"].forEach((t) => { $("tab-" + t).hidden = (t !== b.dataset.tab); });
});
function segSet(host, attr, apply) {
  host.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[" + attr + "]");
    if (!b) return;
    Array.prototype.forEach.call(host.querySelectorAll("button"), (x) => x.classList.toggle("on", x === b));
    S[attr === "data-view" ? "view" : "bg"] = b.dataset[attr === "data-view" ? "view" : "bg"];
    apply(S[attr === "data-view" ? "view" : "bg"]);
  });
}
segSet(els.viewSeg, "data-view", (v) => view && view.view(v));
segSet(els.bgSeg, "data-bg", (v) => view && view.bg(v));
els.pngBtn.addEventListener("click", () => view && view.png());

/* ---------------- отправка ---------------- */
els.sendBtn.addEventListener("click", () => {
  els.formErr.textContent = "";
  const tel = els.cphone.value.replace(/\D/g, "");
  if (!els.cname.value.trim()) { els.formErr.textContent = "Напишите имя: мастер начнёт разговор с обращения."; return; }
  if (tel.length < 9) { els.formErr.textContent = "Проверьте телефон: нужен номер для ответа."; return; }
  if (!els.cagree.checked) { els.formErr.textContent = "Нужно согласие на обработку данных."; return; }
  const msg = "Здравствуйте! Это " + els.cname.value.trim() + ". Собрал(а) памятник в конструкторе:\n\n"
    + summary() + "\n\nКомментарий: " + (els.ccomment.value.trim() || "—");
  if (CFG.tenant.wa) {
    window.open("https://wa.me/" + String(CFG.tenant.wa).replace(/\D/g, "") + "?text=" + encodeURIComponent(msg), "_blank");
  } else {
    copyText(msg, "Смета скопирована — отправьте её мастеру.");
  }
});
els.copyBtn.addEventListener("click", () => copyText(summary(), PRICES ? "Смета скопирована в буфер обмена." : "Состав работ скопирован в буфер обмена."));
els.linkBtn.addEventListener("click", () => {
  const url = location.origin + location.pathname + "#p=" + E.pack(S);
  copyText(url, "Ссылка скопирована: тот же памятник, что у вас на экране.");
  els.shareBox.hidden = false;
  els.shareBox.innerHTML = "Ссылка на проект (откроется с теми же настройками):<br><b>" + url + "</b>"
    + "<p class='hint'>Фотография в ссылку не входит: она остаётся в вашем браузере.</p>";
});
function copyText(txt, okLine) {
  const done = () => { els.shareBox.hidden = false; els.shareBox.textContent = okLine; };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, () => fallback(txt, done));
  } else fallback(txt, done);
}
function fallback(txt, done) {
  const ta = document.createElement("textarea");
  ta.value = txt;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* не страшно: покажем текст */ }
  document.body.removeChild(ta);
  done();
}
/* размеры человек читает в сантиметрах: перевод метров в см для подписей */
function cmOf(v) { return String(Math.round(v * 100)); }

function summary() {
  const p = E.price(CFG, S);
  const L = [];
  L.push("Стела «" + E.nameOf(CFG, "forms", S.stela.form) + "» "
    + cmOf(S.stela.w) + "×" + cmOf(S.stela.h) + "×" + cmOf(S.stela.th) + " см, "
    + E.nameOf(CFG, "stones", S.stela.stone) + ", бока «" + E.nameOf(CFG, "sides", S.stela.sides) + "»");
  if (S.engr.fio) {
    L.push("Надпись: " + S.engr.fio + (S.engr.years ? ", " + S.engr.years : "")
      + (S.engr.epitaph ? ", «" + S.engr.epitaph + "»" : "")
      + (S.engr.cross ? ", крест" : "") + (S.engr.photoMode !== "none" ? ", портрет (" + S.engr.photoMode + ")" : ""));
  }
  L.push("Участок " + cmOf(S.plot.w) + "×" + cmOf(S.plot.d) + " см: "
    + E.nameOf(CFG, "covers", S.cover) + ", ограда «" + E.nameOf(CFG, "fences", S.fence) + "», "
    + "постамент «" + E.nameOf(CFG, "tumbas", S.tumba) + "», цветник «" + E.nameOf(CFG, "cvetniki", S.cvetnik) + "»");
  if (PRICES) {
    p.items.forEach((i) => L.push("— " + i.name + ": " + E.money(i.sum, CFG)));
    L.push("ИТОГО: " + E.money(p.total, CFG));
  }
  if (els.ccomment.value.trim()) L.push("Комментарий: " + els.ccomment.value.trim());
  return L.join("\n");
}

/* ---------------- общий пересчёт ---------------- */
function priceList(p) {
  if (!PRICES) return;      // цены скрыты — список позиций и итог не выводим
  let html = "";
  p.items.forEach((i) => {
    html += '<div class="pitem"><div class="pn">' + i.name
      + (i.note ? '<small>' + i.note + '</small>' : "") + "</div>"
      + '<div class="ps">' + E.money(i.sum, CFG) + "</div></div>";
  });
  els.priceList.innerHTML = html;
  els.totalSum.textContent = E.money(p.total, CFG);
  els.instLine.textContent = p.installments.length
    ? "Рассрочка 0%: " + p.installments.map((i) => i.months + " мес × " + E.money(i.per, CFG)).join(" · ")
    : "";
}
function sizeId() {
  const sz = (CFG.sizes || []).find((x) => Math.abs(x.w - S.stela.w) < 0.011 && Math.abs(x.h - S.stela.h) < 0.011
    && Math.abs(x.th - S.stela.th) < 0.011);
  return sz ? sz.id : "";
}
function plotId() {
  const p = (CFG.plots || []).find((x) => Math.abs(x.w - S.plot.w) < 0.011 && Math.abs(x.d - S.plot.d) < 0.011);
  return p ? p.id : "";
}
function render() {
  pick(els.presetChips, "");
  markForm();
  pick(els.sizeChips, sizeId());
  pick(els.stoneChips, S.stela.stone);
  pick(els.sidesChips, S.stela.sides);
  pick(els.tumbaChips, S.tumba);
  pick(els.coverChips, S.cover);
  pick(els.cvetChips, S.cvetnik);
  pick(els.fenceChips, S.fence);
  pick(els.photoChips, S.engr.photoMode);
  pick(els.plotChips, plotId());

  /* строка под сценой: что сейчас собрано, своими словами и в сантиметрах */
  const G = E.geo(CFG, S);
  els.infoLine.textContent = "Стела " + cmOf(S.stela.w) + "×" + cmOf(S.stela.h) + "×" + cmOf(S.stela.th)
    + " см · постамент «" + E.nameOf(CFG, "tumbas", S.tumba) + "» · цветник "
    + cmOf(G.cvet.w) + "×" + cmOf(G.cvet.d) + " см · участок "
    + cmOf(S.plot.w) + "×" + cmOf(S.plot.d) + " см · " + E.nameOf(CFG, "stones", S.stela.stone);

  [els.sw, els.sh, els.sth].forEach((el, i) => {
    const v = [S.stela.w, S.stela.h, S.stela.th][i] * 100;
    if (document.activeElement !== el) el.value = Math.round(v);
  });
  [els.pw, els.pd].forEach((el, i) => {
    const v = [S.plot.w, S.plot.d][i] * 100;
    if (document.activeElement !== el) el.value = Math.round(v);
  });
  [els.efio, els.eyears, els.eepitaph].forEach((el, i) => {
    const v = [S.engr.fio, S.engr.years, S.engr.epitaph][i];
    if (document.activeElement !== el) el.value = v;
  });
  /* крест и рамка теперь в узорах, отдельных галочек нет; здесь только
     доводка элементов: кнопки, ползунки и подпись «что сейчас правим» */
  syncTf();
  /* ползунки масштаба: значение показываем в процентах, в состоянии — множитель */
  const tk = Math.round(S.engr.textScale * 100), ft = Math.round(S.engr.photoScale * 100);
  if (document.activeElement !== els.tkScale) els.tkScale.value = tk;
  if (document.activeElement !== els.ftScale) els.ftScale.value = ft;
  els.tkVal.textContent = tk + "%";
  els.ftVal.textContent = ft + "%";
  const uzp = Math.round((S.engr.uzScale || 1) * 100);
  if (document.activeElement !== els.uzScale) els.uzScale.value = uzp;
  els.uzVal.textContent = uzp + "%";
  Array.prototype.forEach.call(els.uzList.querySelectorAll("input[data-uz]"), (b) => {
    b.checked = !!(S.engr.uz && S.engr.uz[b.getAttribute("data-uz")]);
  });
  els.photoHint.textContent = S.engr.photo
    ? "Фото загружено: " + Math.round(S.engr.photo.length / 1024) + " КБ в браузере. В ссылку оно не попадает."
    : "Фото остаётся у вас в браузере: в ссылку на проект оно не входит.";

  els.plotNote.textContent = "Участок не уже стелы: конструктор сам добавил место, чтобы ограда "
    + "не легла на камень. Сейчас " + cmOf(S.plot.w) + "×" + cmOf(S.plot.d) + " см.";

  Array.prototype.forEach.call(els.extrasList.querySelectorAll("input[data-extra]"), (b) => {
    b.checked = !!S.extras[b.dataset.extra];
  });

  priceList(E.price(CFG, S));
  if (view) view.update(S);
}

/* ---------------- старт ---------------- */
view = create(els.stage, CFG);
render();
view.view(S.view);
view.bg(S.bg);
if (fromLink) {
  els.shareBox.hidden = false;
  els.shareBox.textContent = "Вы открыли проект по ссылке: настройки восстановлены.";
}
