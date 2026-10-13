/* VolRail — logique de l'application (sans dépendance). */
(() => {
  // L'API est servie par le même serveur que la page ; on peut la déporter via ?api=… ou localStorage.
  // Version publiée (GitHub Pages, pour l'iPhone) : le serveur du Mac est joint par un tunnel dont
  // l'adresse change à chaque redémarrage ; le Mac la republie dans api.json. Une clé d'accès,
  // donnée une fois par ?cle=…, accompagne chaque requête.
  const hosted = location.hostname.endsWith("github.io");
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let API = (() => {
    const p = new URLSearchParams(location.search).get("api");
    if (p) ls.set("volrail.api", p);
    return ls.get("volrail.api") || (hosted ? ls.get("volrail.tunnel") || "" : "");
  })();
  let KEY = ls.get("volrail.key") || "";
  {
    const u = new URL(location.href);
    const cle = u.searchParams.get("cle");
    if (cle) {
      KEY = cle.trim();
      ls.set("volrail.key", KEY);
      u.searchParams.delete("cle");
      try { history.replaceState(null, "", u.pathname + u.search); } catch {}
    }
  }
  async function resolveApi() {
    if (!hosted || ls.get("volrail.api")) return false;
    try {
      const r = await fetch(`api.json?t=${Date.now()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.url || j.url === API) return false;
      API = j.url.replace(/\/$/, "");
      ls.set("volrail.tunnel", API);
      return true;
    } catch { return false; }
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    main: $("main"), colSearch: document.querySelector(".col-search"), form: $("form"), formError: $("formError"),
    searchSummary: $("searchSummary"), ssRoute: $("ssRoute"), ssMeta: $("ssMeta"),
    from: $("from"), to: $("to"), fromId: $("fromId"), toId: $("toId"), fromSuggest: $("fromSuggest"), toSuggest: $("toSuggest"),
    date: $("date"), dateRet: $("dateRet"), clearRet: $("clearRet"), pax: $("pax"), card: $("card"), quick: $("quick"), go: $("go"),
    options: $("options"), filterCount: $("filterCount"), fReset: $("fReset"),
    fDepAfter: $("fDepAfter"), fArrBefore: $("fArrBefore"), fDirect: $("fDirect"), fNoLowcost: $("fNoLowcost"), nearby: $("nearby"), d2d: $("d2d"),
    status: $("status"), results: $("results"), empty: $("empty"), legSwitch: $("legSwitch"), routeTitle: $("routeTitle"),
    notices: $("notices"), best: $("best"), roundTrip: $("roundTrip"), advice: $("advice"),
    alertBtn: $("alertBtn"), matrixBtn: $("matrixBtn"), shareBtn: $("shareBtn"),
    matrixCard: $("matrixCard"), matrixWrap: $("matrixWrap"), matrixNote: $("matrixNote"),
    tabs: $("tabs"), sort: $("sort"), airportChips: $("airportChips"), list: $("list"), moreBtn: $("moreBtn"), combosState: $("combosState"),
    nearbyCard: $("nearbyCard"), nearbyTitle: $("nearbyTitle"), nearbyList: $("nearbyList"),
    calendar: $("calendar"), calToggle: $("calToggle"), calSource: $("calSource"), calMonth: $("calMonth"),
    calPrev: $("calPrev"), calNext: $("calNext"), calStrip: $("calStrip"), calLegend: $("calLegend"),
    basket: $("basket"), basketList: $("basketList"), basketEmpty: $("basketEmpty"), basketFoot: $("basketFoot"),
    basketTotal: $("basketTotal"), basketCount: $("basketCount"), basketFab: $("basketFab"), basketFabCount: $("basketFabCount"),
    basketExport: $("basketExport"), macCalBtn: $("macCalBtn"), scrim: $("scrim"),
    alertsCard: $("alertsCard"), alertsList: $("alertsList"), alertsCount: $("alertsCount"), alertsNote: $("alertsNote"),
    alertDialog: $("alertDialog"), alertForm: $("alertForm"), alertRoute: $("alertRoute"), alertMax: $("alertMax"),
    alertModes: $("alertModes"), alertPushState: $("alertPushState"), alertSave: $("alertSave"),
  };

  const PAGE = 15; // résultats affichés avant « Afficher les autres »
  const DEFAULT_RECENTS = [
    { from: "nice", to: "paris", fromName: "Nice", toName: "Paris" },
    { from: "paris", to: "nice", fromName: "Paris", toName: "Nice" },
  ];

  // Chaque sens (aller, retour) a ses propres résultats ; `leg` est celui affiché.
  const state = {
    legs: { aller: null, retour: null }, leg: "aller", tab: "all", sort: "price", airport: "", pax: 1, basket: [], run: 0, showAll: false,
    d2d: false, card: "", calMonth: "", filters: { depAfter: "", arrBefore: "", direct: false, noLowcost: false },
    alerts: [], status: null, recents: DEFAULT_RECENTS,
  };
  const store = {
    // Les anciennes versions rangeaient certaines valeurs en texte brut (« WEEKEND_PASS ») : on les relit telles quelles.
    get(key, fallback) {
      let v = null;
      try { v = localStorage.getItem("volrail." + key); } catch {}
      if (v == null) return fallback;
      try { return JSON.parse(v); } catch { return v; }
    },
    set(key, v) { try { localStorage.setItem("volrail." + key, JSON.stringify(v)); } catch {} },
  };
  state.basket = store.get("basket", []);
  state.d2d = store.get("d2d", false) === true || store.get("d2d", 0) === 1;
  state.card = String(store.get("card", "") || "");
  Object.assign(state.filters, store.get("filters", {}));
  const savedRecents = store.get("recents", null);
  if (Array.isArray(savedRecents) && savedRecents.length) state.recents = savedRecents;

  // --- Utilitaires -----------------------------------------------------------
  const pad = (n) => String(n).padStart(2, "0");
  // Dates du calendrier local (pas toISOString, qui est en UTC et bascule à 22 h l'été).
  const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return localISO(d); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
  const today = () => localISO();

  const hm = (m) => (m == null ? "—" : `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(m % 60)}`);
  const dur = (m) => (m == null ? "" : m >= 60 ? `${Math.floor(m / 60)}h${pad(m % 60)}` : `${m} min`);
  const eur = (n) => (n == null ? "—" : `${Math.round(n)} €`);
  const kg = (n) => (n == null ? "" : n < 10 ? `${n.toFixed(1).replace(".", ",")} kg` : `${Math.round(n)} kg`);
  const plusDays = (m) => (m == null ? 0 : Math.floor(m / 1440));
  const toMin = (hhmm) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (s, o) => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", o);
  const fmtDay = (s) => fmt(s, { weekday: "short", day: "numeric" });
  const fmtDate = (s) => fmt(s, { weekday: "short", day: "numeric", month: "short" });
  const fmtLong = (s) => fmt(s, { weekday: "long", day: "numeric", month: "long" });
  const plural = (n, one, many = one + "s") => `${n} ${n > 1 ? many : one}`;
  const svg = (name, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const ICON = { train: svg("train"), flight: svg("plane"), combo: svg("route") };
  const MODE_NAME = { train: "Train", flight: "Avion", combo: "Combiné" };
  const LEG_LABEL = { aller: "Aller", retour: "Retour" };
  const cardsParam = () => (state.card ? Array.from({ length: state.pax }, () => state.card).join(",") : "");
  // Prix affiché : le billet, ou le porte à porte (billet + accès + bagage) si l'option est cochée.
  const shown = (it) => (it.price == null ? null : state.d2d ? it.price + (it.extras?.cost || 0) : it.price);
  const current = () => state.legs[state.leg];
  const narrow = () => matchMedia("(max-width: 859px)").matches;
  const touch = () => matchMedia("(pointer: coarse)").matches;

  // Un contrôleur d'abandon par recherche : relancer une recherche coupe les requêtes en cours.
  let aborter = null;
  async function api(path, params, { signal, method = "GET", body, retried } = {}) {
    if (hosted && !API) await resolveApi();
    const u = new URL(API + "/api/" + path, location.href);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    let r;
    try {
      r = await fetch(u, {
        method,
        signal,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(hosted && KEY ? { Authorization: "Bearer " + KEY } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // Le tunnel a peut-être changé d'adresse : on relit api.json et on réessaie une fois.
      if (e.name !== "AbortError" && !retried && (await resolveApi())) return api(path, params, { signal, method, body, retried: true });
      throw e;
    }
    if (r.status === 401) state.needKey = true;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  let toastTimer = null;
  function toast(msg) {
    let t = $("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // --- État des sources -------------------------------------------------------
  async function loadStatus() {
    try {
      const s = await api("status");
      state.status = s;
      el.macCalBtn.hidden = !s.mac;
      $("macCalName").textContent = s.calendarName || "Ma Compta";
      const demo = s.providers.trains === "démo" || s.providers.flights === "démo";
      const blocked = s.providers.sncf?.blocked;
      el.status.className = "status" + (blocked ? " warn" : "");
      el.status.textContent = demo ? "Démo" : blocked ? (macBridge ? "SNCF en pause · débloquer" : "SNCF en pause") : "En ligne";
      el.status.title = blocked
        ? `SNCF Connect a refusé le serveur, nouvel essai dans ${Math.ceil(s.providers.sncf.blockedForSec / 60)} min`
        : `Trains : ${s.providers.trains} · Vols : ${s.providers.flights}`;
    } catch {
      el.status.className = "status err";
      el.status.textContent = state.needKey ? "Clé d'accès" : hosted ? "Mac hors ligne" : "Serveur injoignable";
      el.status.title = state.needKey ? "Touche pour saisir la clé d'accès" : "";
    }
    renderAlerts();
  }

  // --- Autocomplétion ---------------------------------------------------------
  // Renvoie ensure() : garantit qu'une ville est choisie (prend la 1re proposition si on a tapé sans choisir).
  function bindSuggest(input, hidden, list) {
    let timer, items = [], active = -1, seq = 0;
    const open = (v) => {
      list.hidden = !v;
      input.setAttribute("aria-expanded", String(v));
      if (!v) { active = -1; input.removeAttribute("aria-activedescendant"); }
    };
    // Une ligne par ville, puis une par aéroport quand la ville en a plusieurs (Paris : CDG, Orly, Beauvais).
    const rowsOf = (cities) => cities.flatMap((c) => [
      { c, ap: "", label: c.name },
      ...(c.airports.length > 1 ? c.airports.map((a) => ({ c, ap: a, label: `${c.name} ${c.airportNames?.[a] || a}` })) : []),
    ]);
    const pick = (row) => { input.value = row.label; hidden.value = row.c.id; hidden.dataset.ap = row.ap; open(false); };
    const bestRow = (rows) => rows.find((r) => r.c.airport && r.ap === r.c.airport && r.c === rows[0].c) || rows[0];
    const fetchItems = async (q) => {
      const my = ++seq;
      let r = [];
      try { r = await api("places", { q }); } catch {}
      return my === seq ? r : null;
    };
    const highlight = () => {
      [...list.children].forEach((li, i) => li.classList.toggle("active", i === active));
      if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
    };
    input.addEventListener("input", () => {
      hidden.value = "";
      hidden.dataset.ap = "";
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return open(false);
      timer = setTimeout(async () => {
        const r = await fetchItems(q);
        if (r == null) return;
        items = rowsOf(r);
        if (!items.length || document.activeElement !== input) return open(false);
        list.innerHTML = items.map((row, i) => row.ap
          ? `<li role="option" class="ap" id="${list.id}-${i}" data-i="${i}">${svg("plane")}${esc(row.c.airportNames?.[row.ap] || row.ap)}<small>${esc(row.ap)}</small></li>`
          : `<li role="option" id="${list.id}-${i}" data-i="${i}">${esc(row.c.name)}<small>${row.c.airports.length > 1 ? "tous les aéroports" : `${row.c.country !== "FR" ? esc(row.c.country) + " · " : ""}${row.c.hasRail ? svg("train") : ""}${row.c.airports.length ? svg("plane") + esc(row.c.airports[0]) : ""}`}</small></li>`).join("");
        active = items.indexOf(bestRow(items));
        highlight();
        open(true);
      }, 120);
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); }
    });
    input.addEventListener("keydown", (e) => {
      if (list.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        highlight();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (e.key === "Enter") e.preventDefault();
        pick(items[Math.max(0, active)]);
        if (e.key === "Enter" && input === el.from) el.to.focus();
      } else if (e.key === "Escape") open(false);
    });
    const ensure = async () => {
      if (hidden.value) return true;
      const q = input.value.trim();
      if (q.length < 2) return false;
      const r = await fetchItems(q);
      if (r?.[0]) { pick(bestRow(rowsOf(r))); return true; }
      return false;
    };
    input.addEventListener("blur", () => { setTimeout(() => open(false), 120); ensure(); });
    return ensure;
  }

  // ap : code d'un aéroport précis de la ville (« ORY »), ou vide pour tous.
  async function setCity(input, hidden, id, name, ap = "") {
    hidden.dataset.ap = ap || "";
    if (name) { input.value = name; hidden.value = id; return; }
    try {
      const c = await api("place/" + encodeURIComponent(id));
      if (!c.airports.includes(ap)) hidden.dataset.ap = "";
      input.value = hidden.dataset.ap ? `${c.name} ${c.airportNames?.[ap] || ap}` : c.name;
      hidden.value = c.id;
    } catch {}
  }
  const apParams = (q) => ({ ...(q.fromAp ? { fromAp: q.fromAp } : {}), ...(q.toAp ? { toAp: q.toAp } : {}) });

  // --- Rendu des résultats -----------------------------------------------------
  function passesFilters(it) {
    const f = state.filters;
    const depAfter = toMin(f.depAfter), arrBefore = toMin(f.arrBefore);
    if (depAfter != null && it.dep != null && it.dep < depAfter) return false;
    if (arrBefore != null && it.arr != null && it.arr > arrBefore) return false;
    if (f.direct && (it.mode === "combo" || !it.direct)) return false;
    if (f.noLowcost && it.lowcost) return false;
    if (state.airport && it.mode !== "train" && !flightAirports(it).includes(state.airport)) return false;
    return true;
  }
  // Aéroports touchés par un vol, ou par le tronçon aérien d'un combiné.
  const flightAirports = (it) => (it.mode === "combo" ? it.legs : [it]).filter((l) => l.mode === "flight").flatMap((l) => [l.from, l.to]);

  // Une ville à plusieurs aéroports (Paris : CDG, Orly, Beauvais) : choix de l'aéroport au-dessus de la liste.
  function renderAirports() {
    const leg = current();
    const flights = (leg?.items || []).filter((it) => it.mode === "flight" && it.price != null);
    const sides = [new Set(flights.map((f) => f.from)), new Set(flights.map((f) => f.to))];
    const codes = sides.filter((s) => s.size > 1).flatMap((s) => [...s]);
    if (state.airport && !codes.includes(state.airport)) state.airport = "";
    el.airportChips.hidden = !codes.length || state.tab === "train";
    if (el.airportChips.hidden) return;
    const name = (c) => leg.airportNames?.[c] || c;
    const count = (c) => flights.filter((f) => f.from === c || f.to === c).length;
    el.airportChips.innerHTML = `<button type="button" class="chip${state.airport ? "" : " on"}" data-airport="" aria-pressed="${!state.airport}">Tous les aéroports</button>`
      + codes.map((c) => `<button type="button" class="chip${state.airport === c ? " on" : ""}" data-airport="${esc(c)}" aria-pressed="${state.airport === c}" title="${esc(name(c))}">${esc(name(c))} <span class="n">${count(c)}</span></button>`).join("");
  }
  const activeFilterCount = () => ["depAfter", "arrBefore", "direct", "noLowcost"].filter((k) => state.filters[k]).length;
  function renderFilterCount() {
    const n = activeFilterCount();
    el.filterCount.hidden = !n;
    el.filterCount.textContent = n === 1 ? "1 actif" : `${n} actifs`;
    el.fReset.hidden = !n;
  }

  const filtered = () => (current()?.items || []).filter(passesFilters);
  function visibleItems() {
    const list = filtered().filter((it) => state.tab === "all" || it.mode === state.tab);
    const key = state.sort;
    const val = (it) => (key === "price" ? shown(it) : it[key]) ?? 1e9;
    return list.sort((a, b) => val(a) - val(b) || (a.duration ?? 1e9) - (b.duration ?? 1e9));
  }
  const cheapestOf = (list) => list.filter((it) => it.price != null).reduce((m, it) => (!m || shown(it) < shown(m) ? it : m), null);

  function bookLinks(it) {
    if (it.mode === "combo") return it.legs.map((l) => `<a href="${esc(l.link)}" target="_blank" rel="noopener">${l.mode === "train" ? "Train" : "Vol"}${svg("ext")}</a>`).join("");
    return `<a href="${esc(it.link)}" target="_blank" rel="noopener" title="${it.mode === "train" ? "Ouvrir SNCF Connect" : "Ouvrir Google Flights"}">Réserver${svg("ext")}</a>`;
  }

  // Frise d'un trajet : départ ●——(icône)——● arrivée, un tronçon coloré par mode (vert = train,
  // bleu = avion), proportionnel à sa durée, les correspondances en points, l'attente en pointillés.
  function timeline(it) {
    const q = current()?.query || {};
    const legs = it.mode === "combo" ? it.legs : [it];
    const first = legs[0], last = legs[legs.length - 1];
    const n = current()?.airportNames || {};
    const place = (l, side) => (l.mode === "flight" ? l[side] : side === "from" ? q.fromName : q.toName);
    const title = (l, side) => (l.mode === "flight" ? n[l[side]] || l[side] : "");
    const color = (m) => (m === "train" ? "var(--train)" : "var(--flight)");
    const seg = (l) => {
      const stops = l.changes > 0 ? Array.from({ length: l.changes }, (_, k) => `<i class="stop" style="left:${((k + 1) / (l.changes + 1)) * 100}%"></i>`).join("") : "";
      return `<span class="seg ${l.mode}" style="flex:${Math.max(30, l.duration || 60)} 1 0">${stops}<span class="ic">${svg(l.mode === "train" ? "train" : "plane")}</span></span>`;
    };
    const line = it.mode === "combo"
      ? `${seg(first)}<span class="seg-gap" style="flex:${Math.max(20, it.transfer || 30)} 1 0" title="${dur(it.transfer)} de correspondance à ${esc(it.hub.name)}"></span>${seg(last)}`
      : seg(it);
    const how = it.mode === "combo" ? `via ${esc(it.hub.name)}` : it.direct ? "direct" : it.mode === "flight" ? plural(it.changes, "escale") : plural(it.changes, "correspondance");
    const plus = plusDays(it.arr);
    return `<div class="tl">
        <div class="tl-end"><b>${hm(it.dep)}</b><small title="${esc(title(first, "from"))}">${esc(place(first, "from") || "")}</small></div>
        <div class="tl-mid">
          <span class="tl-dur">${it.dep == null ? "≈ " : ""}${dur(it.duration)} · ${how}</span>
          <div class="tl-line" style="--cap-a:${color(first.mode)};--cap-b:${color(last.mode)}">${line}</div>
        </div>
        <div class="tl-end r"><b>${hm(it.arr)}${plus ? `<sup>+${plus} j</sup>` : ""}</b><small title="${esc(title(last, "to"))}">${esc(place(last, "to") || "")}</small></div>
      </div>`;
  }

  function renderItem(it, i, minPrice) {
    const leg = current();
    const isBest = minPrice != null && shown(it) === minPrice;
    const meta = [];
    if (isBest && state.sort === "price") meta.push(`<span class="tag best">le moins cher</span>`);
    meta.push(`<span class="op">${esc(it.operator)}</span>`);
    if (it.lowcost) meta.push(`<span class="tag">low-cost</span>`);
    if (it.co2Kg != null) meta.push(`<span title="Empreinte carbone par trajet (ADEME)">${kg(it.co2Kg)} CO₂</span>`);
    if (it.mode === "train" && leg?.punctuality && /tgv|inoui|ouigo/i.test(it.operator)) {
      meta.push(`<span title="TGV sur ce trajet, ${leg.punctuality.months.length} derniers mois publiés (open data SNCF)">${leg.punctuality.onTimePct} % à l'heure</span>`);
    }
    if (it.price == null) meta.push(`<span class="tag est">${it.unsellable ? "complet" : "prix indisponible"}</span>`);
    if (it.estimated) meta.push(`<span class="tag est" title="Source indisponible : prix calculé d'après la distance">estimation</span>`);

    let details = "";
    if (it.mode === "combo") {
      const [a, b] = it.legs;
      const line = (l) => `<li class="${l.mode}">${ICON[l.mode]}<b>${hm(l.dep)} → ${hm(l.arr)}</b> ${esc(l.operator)}${l.mode === "flight" ? ` · ${esc(l.from)} → ${esc(l.to)}` : ""} · ${eur(l.price)}</li>`;
      const where = a.mode === "train" ? `${esc(it.hub.station)} → ${esc(it.hub.airport)}` : `${esc(it.hub.airport)} → ${esc(it.hub.station)}`;
      details = `<ul class="details">${line(a)}<li class="hub">correspondance à ${esc(it.hub.name)} (${where}), ${dur(it.transfer)} pour changer</li>${line(b)}</ul>`;
    }
    const d2d = state.d2d && it.extras
      ? `<div class="d2d">Porte à porte : billet ${eur(it.price)} + ${eur(it.extras.cost)} (${esc(it.extras.detail.join(", ") || "rien à ajouter")}${it.extras.min ? `, +${dur(it.extras.min)}` : ""})</div>`
      : "";
    const key = itemKey(it);
    const kept = state.basket.some((b) => b.key === key);
    const pax = leg?.query.pax || 1;
    return `<li class="item ${it.mode}${isBest ? " best-price" : ""}" data-i="${i}" data-key="${esc(key)}">
      ${timeline(it)}
      <div class="price${it.estimated ? " est" : ""}">${it.estimated ? "≈ " : ""}${eur(shown(it))}${pax > 1 && it.price != null ? `<small>soit ${eur(shown(it) / pax)} / pers.</small>` : ""}</div>
      <div class="meta">${meta.join("")}</div>
      ${details}${d2d}
      <div class="acts"><button type="button" class="keep${kept ? " kept" : ""}" aria-pressed="${kept}">${kept ? svg("check") + "Gardé" : svg("plus") + "Garder"}</button><div class="links">${bookLinks(it)}</div></div>
    </li>`;
  }

  function renderTabs() {
    const items = filtered();
    for (const b of el.tabs.children) {
      const t = b.dataset.tab;
      const n = t === "all" ? items.length : items.filter((it) => it.mode === t).length;
      b.setAttribute("aria-selected", String(t === state.tab));
      b.querySelector(".n").textContent = current() ? n : "";
    }
  }

  function renderList() {
    const leg = current();
    if (!leg) return;
    renderAirports();
    renderTabs();
    if (leg.loading && !leg.items.length) {
      el.list.innerHTML = `<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>`;
      el.moreBtn.hidden = true;
    } else {
      const list = visibleItems();
      const minPrice = cheapestOf(list) ? shown(cheapestOf(list)) : null;
      const showN = state.showAll ? list.length : PAGE;
      el.list.innerHTML = list.length
        ? list.slice(0, showN).map((it, i) => renderItem(it, i, minPrice)).join("")
        : `<li class="empty-row">${leg.loading ? "Recherche en cours…" : `Aucun trajet${state.tab !== "all" ? " " + { train: "en train", flight: "en avion", combo: "combiné" }[state.tab] : ""}${activeFilterCount() ? " avec ces filtres" : ""}.`}</li>`;
      el.moreBtn.hidden = list.length <= showN;
      el.moreBtn.textContent = `Afficher les ${list.length - showN} autres`;
    }
    renderFilterCount();
    renderBest();
    renderRoundTrip();
  }

  // « En bref » : le moins cher, le plus rapide, le meilleur de chaque mode, le moins de CO₂.
  function renderBest() {
    const priced = filtered().filter((it) => it.price != null);
    if (!priced.length) { el.best.innerHTML = ""; return; }
    const cheapest = cheapestOf(priced);
    const timed = priced.filter((it) => it.duration != null && !it.estimated);
    const fastest = timed.length ? timed.reduce((m, it) => (it.duration < m.duration ? it : m)) : null;
    const greenest = priced.filter((it) => it.co2Kg != null).reduce((m, it) => (!m || it.co2Kg < m.co2Kg ? it : m), null);
    const by = (mode) => cheapestOf(priced.filter((it) => it.mode === mode));
    const t = by("train"), f = by("flight"), c = by("combo");
    const when = cheapest.dep != null ? `<span class="when">${hm(cheapest.dep)} → ${hm(cheapest.arr)} · ${fmtDate(cheapest.date)}</span>` : "";
    const cells = [["Le moins cher", cheapest, eur(shown(cheapest)), `${ICON[cheapest.mode]}${esc(cheapest.operator)}${cheapest.duration ? " · " + dur(cheapest.duration) : ""}`, "first", when]];
    if (fastest) cells.push(["Le plus rapide", fastest, dur(fastest.duration), `${ICON[fastest.mode]}${eur(shown(fastest))}`]);
    if (t && t !== cheapest) cells.push(["Train", t, eur(shown(t)), `${esc(t.operator)}${t.duration ? " · " + dur(t.duration) : ""}`]);
    if (f && f !== cheapest) cells.push(["Avion", f, eur(shown(f)), `${esc(f.operator)}${f.duration ? " · " + dur(f.duration) : ""}`]);
    if (c && c !== cheapest) cells.push(["Train + avion", c, eur(shown(c)), `via ${esc(c.hub.name)}`]);
    if (greenest && greenest !== cheapest) cells.push(["Le moins de CO₂", greenest, kg(greenest.co2Kg), `${ICON[greenest.mode]}${eur(shown(greenest))}`]);
    const bigIcon = { train: "train", flight: "plane", combo: "route" };
    el.best.innerHTML = cells.map(([label, it, value, note, cls, extra]) =>
      `<button type="button" class="${cls || ""}" data-mode="${it.mode}">${cls === "first" ? svg(bigIcon[it.mode], "i big-ico") : ""}<small>${label}</small><b>${value}</b>${extra || ""}<span>${note}</span></button>`).join("");
  }

  // Meilleur aller-retour, modes panachés (train à l'aller, avion au retour…).
  function renderRoundTrip() {
    const a = state.legs.aller, r = state.legs.retour;
    const best = (l) => (l ? cheapestOf(l.items.filter(passesFilters)) : null);
    const ba = best(a), br = best(r);
    if (!ba || !br) { el.roundTrip.hidden = true; return; }
    const line = (it, label) => `<span>${ICON[it.mode]}<span><b>${label}</b> ${fmtDate(it.date)}${it.dep != null ? " " + hm(it.dep) : ""} · ${esc(it.operator)}${it.mode === "combo" ? " via " + esc(it.hub.name) : ""} · ${eur(shown(it))}</span></span>`;
    const both = [ba, br].every((it) => state.basket.some((b) => b.key === itemKey(it)));
    el.roundTrip.hidden = false;
    el.roundTrip.innerHTML = `<div class="rt-head">Aller-retour le moins cher${ba.mode !== br.mode ? " (panaché)" : ""}<b>${eur(shown(ba) + shown(br))}</b></div>
      <div class="rt-legs">${line(ba, "Aller")}${line(br, "Retour")}</div>
      <button type="button" class="btn" id="rtKeep"${both ? " disabled" : ""}>${both ? svg("check") + "Gardés" : "Garder les deux"}</button>`;
    $("rtKeep").onclick = () => {
      for (const [it, legName] of [[ba, "aller"], [br, "retour"]]) {
        if (!state.basket.some((b) => b.key === itemKey(it))) state.basket.push({ key: itemKey(it), item: it, query: state.legs[legName].query, leg: legName, addedAt: Date.now() });
      }
      saveBasket(); renderBasket(); renderList();
      toast("Aller et retour ajoutés au panier");
    };
  }

  // Historique des prix vus sur ce trajet à cette date + conseil.
  function renderAdvice() {
    const h = current()?.history;
    if (!h?.points || h.points.length < 2) { el.advice.hidden = true; return; }
    const pts = h.points;
    const W = 120, H = 34;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const lo = h.lowest, hi = Math.max(h.highest, lo + 1);
    const x = (p) => (t1 === t0 ? W - 3 : ((p.t - t0) / (t1 - t0)) * (W - 6) + 3);
    const y = (p) => H - 4 - ((p.p - lo) / (hi - lo)) * (H - 8);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    const span = (t) => { const dd = (Date.now() - t) / 86400000; return dd < 1 ? `${Math.max(1, Math.round(dd * 24))} h` : plural(Math.round(dd), "jour"); };
    const verdict = { buy: "Bon moment pour acheter.", wait: "Ça peut encore baisser.", neutral: "Prix stable." }[h.advice?.kind] || "";
    el.advice.hidden = false;
    el.advice.className = `advice ${h.advice?.kind || ""}`;
    el.advice.innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${x(last).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2.5"/></svg>
      <div><div class="adv-head">Prix le plus bas par voyageur : <b>${h.current} €</b> maintenant, de ${h.lowest} à ${h.highest} € sur ${span(t0)} (${plural(pts.length, "relevé")}).</div>
      ${h.advice ? `<div class="adv-text"><span class="adv-verdict">${verdict}</span> ${esc(h.advice.text)}</div>` : ""}</div>`;
  }

  function renderNotices() {
    const leg = current();
    // Un blocage SNCF remonte une fois par recherche (directe, voisines, chaque correspondance) : un seul avertissement.
    let blockedShown = false;
    const seen = new Set();
    el.notices.innerHTML = leg ? leg.notices.map(([kind, text]) => {
      if (seen.has(text)) return "";
      seen.add(text);
      if (/datadome|bloqué/i.test(text)) {
        if (blockedShown) return "";
        blockedShown = true;
        if (macBridge) {
          return `<div class="notice warn">${svg("alert")}<div><b>SNCF Connect refuse le serveur.</b> Les prix des trains sont estimés. « Débloquer » ouvre le site SNCF dans VolRail : attends que la page s'affiche (ou réponds au captcha), l'app fait le reste.</div>
            <button type="button" class="btn notice-btn" id="unblockSncf">Débloquer</button></div>`;
        }
        if (touch()) {
          return `<div class="notice warn">${svg("alert")}<div><b>SNCF Connect fait une pause.</b> Les prix des trains sont estimés. Ça repart tout seul dans quelques minutes, ou tout de suite avec « Débloquer » dans l'app VolRail du Mac.</div></div>`;
        }
        return `<div class="notice warn">${svg("alert")}<div><b>SNCF Connect refuse le serveur.</b> Les prix des trains sont estimés en attendant un cookie frais.
          <details><summary>Comment récupérer le cookie</summary><p>Dans Safari, ouvre sncf-connect.com et lance une recherche. Menu Développement → Afficher l'inspecteur web → Stockage → Cookies → www.sncf-connect.com : copie la valeur de « datadome ». Pas de menu Développement ? Safari → Réglages → Avancées → « Afficher les fonctionnalités pour les développeurs web ».</p></details></div>
          <button type="button" class="btn notice-btn" id="pasteCookie">Coller le cookie</button></div>`;
      }
      return `<div class="notice ${kind}">${svg(kind === "info" ? "info" : "alert")}<span>${esc(text)}</span></div>`;
    }).join("") : "";
  }

  // App Mac : elle ouvre SNCF Connect dans sa propre fenêtre et transmet elle-même le cookie.
  const macBridge = window.webkit?.messageHandlers?.volrail || null;
  const unblockSncf = () => macBridge?.postMessage({ action: "unblockSncf" });
  window.volrailSncfUnblocked = () => {
    toast("SNCF Connect débloqué, nouvelle recherche…");
    loadStatus();
    if (state.legs.aller) search({ keepLeg: true });
  };

  async function pasteCookie() {
    const v = prompt("Valeur du cookie « datadome » copiée depuis Safari :");
    if (!v) return;
    try {
      await api("sncf-cookie", null, { method: "POST", body: { value: v.trim() } });
      toast("Cookie enregistré, nouvelle recherche…");
      search({ keepLeg: true });
    } catch (e) {
      alert("Cookie refusé : " + e.message);
    }
  }

  // Jours (train 90 j + vols autour de la date) fusionnés : le moins cher des deux par jour.
  function calendarDays(cal) {
    const days = new Map();
    for (const d of cal.train) days.set(d.date, { date: d.date, price: d.price, mode: "train", train: d.price, flight: null });
    for (const d of cal.flight) {
      const cur = days.get(d.date);
      if (!cur) days.set(d.date, { date: d.date, price: d.price, mode: "flight", train: null, flight: d.price });
      else {
        cur.flight = d.price;
        if (d.price < cur.price) { cur.price = d.price; cur.mode = "flight"; }
      }
    }
    return days;
  }

  function calendarMonths(days, sel) {
    return [...new Set([...[...days.keys()].map((d) => d.slice(0, 7)), sel.slice(0, 7)])].filter((m) => m >= today().slice(0, 7)).sort();
  }

  function renderCalendar() {
    const leg = current();
    const cal = leg?.calendar;
    if (!cal || (!cal.train.length && !cal.flight.length)) { el.calendar.hidden = true; return; }
    const days = calendarDays(cal);
    const prices = [...days.values()].map((d) => d.price).sort((a, b) => a - b);
    const q1 = prices[Math.floor(prices.length * 0.25)];
    const sel = leg.query.date;
    const months = calendarMonths(days, sel);
    if (!months.includes(state.calMonth)) state.calMonth = sel.slice(0, 7);
    const m = state.calMonth;
    const mi = months.indexOf(m);
    el.calPrev.disabled = mi <= 0;
    el.calNext.disabled = mi >= months.length - 1;
    const inMonth = [...days.values()].filter((d) => d.date.startsWith(m)).map((d) => d.price);
    el.calMonth.innerHTML = `${fmt(m + "-15", { month: "long", year: "numeric" })}<small>${inMonth.length ? `dès ${Math.min(...inMonth)} € par voyageur` : "pas de prix relevé"}</small>`;

    // Sélection : la date de ce sens, et celle de l'autre sens pour voir le séjour.
    const otherLeg = state.leg === "aller" ? state.legs.retour : state.legs.aller;
    const other = otherLeg?.query.date || null;
    const [lo, hi] = other ? [sel, other].sort() : [sel, sel];
    const first = new Date(m + "-01T12:00:00");
    const lead = (first.getDay() + 6) % 7;
    const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const t = today();
    const cells = ["L", "M", "M", "J", "V", "S", "D"].map((w) => `<div class="cal-w" aria-hidden="true">${w}</div>`);
    for (let i = 0; i < lead; i++) cells.push(`<div class="cal-c blank"></div>`);
    for (let day = 1; day <= nDays; day++) {
      const date = `${m}-${pad(day)}`;
      const d = days.get(date);
      const isSel = date === sel, isOther = other && date === other && !isSel;
      const cls = ["cal-c", d?.mode, isSel && "selected", isOther && "other", other && date > lo && date < hi && "range", date < t && "past", !d && "none", d && d.price <= q1 && "cheap"].filter(Boolean).join(" ");
      if (d && date >= t) {
        const alt = d.mode === "flight" && d.train != null ? `, train ${d.train} €` : d.mode === "train" && d.flight != null ? `, avion ${d.flight} €` : "";
        cells.push(`<button type="button" class="${cls}" data-date="${date}" aria-pressed="${isSel}" title="${fmtDate(date)} : ${d.price} € en ${d.mode === "train" ? "train" : "avion"}${alt}"><small>${day}</small><b>${d.price} €</b><span class="m">${ICON[d.mode]}</span></button>`);
      } else {
        cells.push(`<div class="${cls}"><small>${day}</small></div>`);
      }
    }
    el.calStrip.innerHTML = cells.join("");
    el.calSource.textContent = `dès ${prices[0]} €`;
    el.calSource.title = `Prix le plus bas sur ${days.size} jours relevés`;
    const demo = cal.trainSource === "démo" || cal.flightSource === "démo";
    el.calLegend.innerHTML = [
      other ? `<span><i class="sw sel"></i>${LEG_LABEL[state.leg].toLowerCase()}</span><span><i class="sw oth"></i>${LEG_LABEL[state.leg === "aller" ? "retour" : "aller"].toLowerCase()}</span>` : "",
      `<span><span class="lt">${svg("train")}</span><span class="lf">${svg("plane")}</span> le moins cher des deux</span>`,
      `<span><i class="sw lo"></i>petits prix</span>`,
      cal.flight.length ? `<span>vols relevés à ± 5 jours</span>` : "",
      demo ? "<span>démo</span>" : "",
    ].join("");
    el.calendar.hidden = false;
  }

  function renderNearby() {
    const leg = current();
    if (!leg?.nearby) { el.nearbyCard.hidden = true; return; }
    el.nearbyCard.hidden = false;
    el.nearbyTitle.textContent = `Moins cher en partant d'à côté de ${leg.query.fromName}`;
    el.nearbyList.innerHTML = leg.nearby;
  }

  function renderLegSwitch() {
    const both = !!state.legs.retour;
    el.legSwitch.hidden = !both;
    if (!both) return;
    for (const b of el.legSwitch.querySelectorAll("[data-leg]")) {
      const l = state.legs[b.dataset.leg];
      const min = cheapestOf(l.items);
      b.setAttribute("aria-selected", String(b.dataset.leg === state.leg));
      const price = l.loading && !min ? "recherche…" : min ? "dès " + eur(shown(min)) : "aucun prix";
      b.innerHTML = `<b>${LEG_LABEL[b.dataset.leg]} · ${fmtDate(l.query.date)}</b><small>${narrow() ? price : `${esc(l.query.fromName)} → ${esc(l.query.toName)} · ${price}`}</small>`;
    }
  }

  function renderHeader() {
    const leg = current();
    if (!leg) return;
    const q = leg.query;
    const card = state.card && el.card.selectedOptions[0] ? ` · ${el.card.selectedOptions[0].textContent}` : "";
    el.routeTitle.innerHTML = `${esc(q.fromName)} → ${esc(q.toName)}<small>${fmtLong(q.date)} · ${plural(q.pax, "voyageur")}${q.pax > 1 ? ", prix pour tous" : ""}${esc(card)}</small>`;
  }

  // Redessine tout pour le sens affiché.
  function render() {
    renderLegSwitch();
    renderHeader();
    renderNotices();
    renderCalendar();
    renderAdvice();
    renderNearby();
    renderList();
    const leg = current();
    el.combosState.hidden = !leg?.combosText;
    el.combosState.textContent = leg?.combosText || "";
  }
  const renderIf = (legName) => { if (legName === state.leg) render(); else renderLegSwitch(); };

  // --- Recherche --------------------------------------------------------------
  function newLeg(query) {
    return { query, items: [], notices: [], calendar: null, nearby: null, history: null, punctuality: null, combosText: "Recherche des trains et des vols…", loading: true };
  }

  function formError(msg) {
    el.formError.hidden = !msg;
    el.formError.textContent = msg || "";
    if (msg) setCompact(false);
  }

  function setCompact(on) {
    el.colSearch.classList.toggle("compact", on);
    el.searchSummary.hidden = !on && !state.legs.aller;
    el.searchSummary.setAttribute("aria-expanded", String(!on));
  }

  function renderSummary() {
    const a = state.legs.aller, r = state.legs.retour;
    if (!a) return;
    el.ssRoute.textContent = `${a.query.fromName} → ${a.query.toName}`;
    const card = state.card && el.card.selectedOptions[0] ? ` · ${el.card.selectedOptions[0].textContent}` : "";
    el.ssMeta.textContent = `${fmtDate(a.query.date)}${r ? " – " + fmtDate(r.query.date) : ", aller simple"} · ${plural(a.query.pax, "voyageur")}${card}`;
  }

  function rememberRoute(q) {
    const r = { from: q.from, to: q.to, fromName: q.fromName, toName: q.toName, fromAp: q.fromAp, toAp: q.toAp };
    const same = (x) => x.from === r.from && x.to === r.to && (x.fromAp || "") === r.fromAp && (x.toAp || "") === r.toAp;
    state.recents = [r, ...state.recents.filter((x) => !same(x))].slice(0, 4);
    store.set("recents", state.recents);
    renderQuick();
  }

  function renderQuick() {
    el.quick.innerHTML = state.recents.map((r, i) => `<button type="button" class="chip" data-i="${i}">${esc(r.fromName)}${svg("arrow-right")}${esc(r.toName)}</button>`).join("");
    $("recentCards").innerHTML = state.recents.map((r, i) => `<button type="button" class="recent-card" data-i="${i}">
        <span class="rc-art" aria-hidden="true"></span>
        <b>${esc(r.fromName)}${svg("arrow-right")}${esc(r.toName)}</b>
        <span>${fmtDate(el.date.value || addDays(today(), 1))}${el.dateRet.value ? " – " + fmtDate(el.dateRet.value) : ", aller simple"}</span>
        <span class="go-arrow" aria-hidden="true">${svg("arrow-right")}</span>
      </button>`).join("");
  }
  // Voyageurs et carte, résumés dans la barre de recherche.
  function renderPaxSummary() {
    const card = state.card && el.card.selectedOptions[0] ? el.card.selectedOptions[0].textContent : "";
    $("paxSummary").textContent = `${plural(state.pax, "voyageur")}${card ? " · " + card : ""}`;
  }

  async function search({ keepLeg = false } = {}) {
    formError("");
    const [okFrom, okTo] = await Promise.all([ensureFrom(), ensureTo()]);
    if (!okFrom || !okTo) return formError(`Ville ${!okFrom ? "de départ" : "d'arrivée"} introuvable : choisis-la dans la liste.`);
    const from = el.fromId.value, to = el.toId.value, date = el.date.value, dateRet = el.dateRet.value, pax = state.pax;
    if (from === to) return formError("Le départ et l'arrivée sont la même ville.");
    if (!date) return formError("Choisis une date d'aller.");
    if (date < today()) return formError("La date d'aller est passée.");
    if (dateRet && dateRet < date) return formError("Le retour est avant l'aller.");
    const fromName = el.from.value, toName = el.to.value;
    const fromAp = el.fromId.dataset.ap || "", toAp = el.toId.dataset.ap || "";
    const cards = cardsParam();
    const q1 = { from, to, date, pax, cards, fromName, toName, fromAp, toAp };
    const q2 = dateRet ? { from: to, to: from, date: dateRet, pax, cards, fromName: toName, toName: fromName, fromAp: toAp, toAp: fromAp } : null;
    store.set("last", { from, to, date, dateRet, pax, fa: fromAp, ta: toAp });
    rememberRoute(q1);
    // L'adresse reflète la recherche : on peut la partager ou la mettre en favori.
    const share = new URLSearchParams({ from, to, date, ...(dateRet ? { ret: dateRet } : {}), ...(pax > 1 ? { pax } : {}), ...(fromAp ? { fa: fromAp } : {}), ...(toAp ? { ta: toAp } : {}) });
    try { history.replaceState(null, "", "?" + share); } catch {}
    el.matrixBtn.hidden = !dateRet;
    el.matrixCard.hidden = true;

    const run = ++state.run;
    if (aborter) aborter.abort();
    aborter = new AbortController();
    state.legs = { aller: newLeg(q1), retour: q2 ? newLeg(q2) : null };
    if (!keepLeg || !state.legs[state.leg]) state.leg = "aller";
    state.calMonth = "";
    state.showAll = false;
    state.airport = "";
    el.empty.hidden = true;
    el.results.hidden = false;
    el.go.classList.add("busy");
    el.go.textContent = "Recherche…";
    renderSummary();
    setCompact(true);
    if (narrow()) window.scrollTo({ top: 0 });
    render();

    const jobs = [runLeg("aller", run)];
    if (q2) jobs.push(runLeg("retour", run));
    await Promise.all(jobs);
    if (run === state.run) loadStatus();
  }

  function searchDone(run) {
    if (run !== state.run) return;
    el.go.classList.remove("busy");
    el.go.textContent = "Comparer";
  }

  async function runLeg(legName, run) {
    const leg = state.legs[legName];
    const q = leg.query;
    const params = { from: q.from, to: q.to, date: q.date, pax: q.pax, ...(q.cards ? { cards: q.cards } : {}), ...apParams(q) };
    const signal = aborter.signal;
    const alive = () => run === state.run;
    const t0 = performance.now();
    const secs = () => ((performance.now() - t0) / 1000).toFixed(1).replace(".", ",");

    loadCalendar(legName, run, signal);

    // Trains et vols en parallèle, chacun affiché dès qu'il répond.
    const part = async (path, label) => {
      try {
        const r = await api(path, params, { signal });
        if (!alive()) return null;
        leg.items.push(...r.list);
        if (r.punctuality) leg.punctuality = r.punctuality;
        if (r.airportNames) leg.airportNames = r.airportNames;
        if (r.error) leg.notices.push(["warn", `${label} : ${r.error}`]);
        if (r.source === "démo" && !leg.notices.some((n) => n[1].startsWith("Données de démonstration"))) leg.notices.push(["info", "Données de démonstration : le serveur tourne en mode démo."]);
        leg.combosText = `${label} reçus en ${secs()} s…`;
        renderIf(legName);
        return r;
      } catch (e) {
        if (!alive() || e.name === "AbortError") return null;
        if (!state.needKey) leg.notices.push(["warn", `${label} : ${e.message}`]);
        renderIf(legName);
        return null;
      }
    };
    const [tr, fl] = await Promise.all([part("trains", "Trains"), part("flights", "Vols")]);
    if (!alive()) return;
    if (legName === "aller") searchDone(run);
    if (!tr && !fl) {
      leg.notices.push(["err", state.needKey ? "Cette app n'a pas encore la clé d'accès du Mac : touche « Clé d'accès » en haut pour la saisir." : "Recherche impossible : le serveur ne répond pas."]);
      leg.combosText = "";
      leg.loading = false;
      renderIf(legName);
      return;
    }
    if (!leg.items.length) leg.notices.push(["err", "Aucun trajet trouvé ce jour-là."]);
    leg.combosText = "Recherche des trajets train + avion…";
    renderIf(legName);
    loadHistory(legName, run, signal);

    const nearbyDone = loadNearby(legName, run, [...leg.items], signal);

    try {
      const r = await api("combos", params, { signal });
      if (!alive()) return;
      leg.items.push(...r.combos);
      for (const e of r.errors || []) leg.notices.push(["warn", e]);
      const n = r.combos.length;
      leg.combosText = n
        ? `${plural(n, "trajet train + avion trouvé", "trajets train + avion trouvés")} via ${plural(r.tried.length, "correspondance testée", "correspondances testées")}, en ${secs()} s.`
        : r.tried.length ? "Aucun trajet train + avion réalisable ce jour-là." : "Trajet trop court pour un assemblage train + avion.";
    } catch (e) {
      if (!alive() || e.name === "AbortError") return;
      leg.combosText = `Trajets train + avion indisponibles : ${e.message}`;
    }
    leg.loading = false;
    renderIf(legName);
    await nearbyDone;
  }

  // Villes voisines du départ, seulement si c'est moins cher que le meilleur résultat principal.
  async function loadNearby(legName, run, mainItems, signal) {
    const leg = state.legs[legName];
    if (!el.nearby.checked) return;
    const bestOf = (mode) => mainItems.filter((it) => it.mode === mode && it.price != null && !it.estimated).reduce((m, it) => (!m || it.price < m.price ? it : m), null);
    const bestTrain = bestOf("train"), bestFlight = bestOf("flight");
    leg.nearby = `<li class="none">Recherche depuis les villes voisines…</li>`;
    renderIf(legName);
    try {
      const q = leg.query;
      const r = await api("nearby", { from: q.from, to: q.to, date: q.date, pax: q.pax, side: "from", ...(q.cards ? { cards: q.cards } : {}), ...apParams(q) }, { signal });
      if (run !== state.run) return;
      const rows = [];
      for (const a of r.alternatives) {
        for (const [mode, it, best] of [["train", a.train, bestTrain], ["flight", a.flight, bestFlight]]) {
          if (!it || it.price == null || it.estimated) continue;
          const ref = best?.price ?? null;
          if (ref != null && it.price >= ref) continue; // pas moins cher : on n'en parle pas
          rows.push({ a, mode, it, ref, saving: ref != null ? ref - it.price : null });
        }
      }
      rows.sort((x, y) => (y.saving ?? 0) - (x.saving ?? 0));
      leg.nearby = rows.length
        ? rows.map(({ a, mode, it, ref }) => `<li>
            <span class="n-where">${ICON[mode]}<span>depuis <b>${esc(a.city.name)}</b> <span class="note">${a.distanceKm} km</span></span></span>
            <span class="n-price">${eur(it.price)}${ref != null ? `<s>${eur(ref)}</s>` : ""}</span>
            <span class="n-meta">${hm(it.dep)} · ${dur(it.duration)} · ${esc(it.operator)}${mode === "flight" ? " · " + esc(it.from) : ""}</span>
            <button type="button" class="btn" data-city="${esc(a.city.id)}" data-name="${esc(a.city.name)}">Partir de là</button>
          </li>`).join("")
        : `<li class="none">Rien de moins cher depuis ${esc(r.alternatives.map((a) => a.city.name).join(", ") || "les environs")} ce jour-là.</li>`;
    } catch (e) {
      if (run !== state.run || e.name === "AbortError") return;
      leg.nearby = `<li class="none">Villes voisines indisponibles : ${esc(e.message)}</li>`;
    }
    renderIf(legName);
  }

  async function loadCalendar(legName, run, signal) {
    const leg = state.legs[legName];
    leg.calendar = { train: [], flight: [], trainSource: null, flightSource: null };
    const q = leg.query;
    const train = api("calendar", { from: q.from, to: q.to }, { signal }).then((r) => {
      if (run !== state.run) return;
      leg.calendar.train = r.days || [];
      leg.calendar.trainSource = r.source;
      renderIf(legName);
    }).catch(() => {});
    // Les vols jour par jour coûtent un appel chacun : après le train, autour de la date seulement.
    const flight = train.then(() => api("calendar-flights", { from: q.from, to: q.to, date: q.date, span: 5, ...apParams(q) }, { signal })).then((r) => {
      if (run !== state.run) return;
      leg.calendar.flight = r.days || [];
      leg.calendar.flightSource = r.source;
      renderIf(legName);
    }).catch(() => {});
    await Promise.all([train, flight]);
  }

  async function loadHistory(legName, run, signal) {
    const leg = state.legs[legName];
    try {
      const q = leg.query;
      const r = await api("history", { from: q.from, to: q.to, date: q.date }, { signal });
      if (run !== state.run) return;
      leg.history = r;
      renderIf(legName);
    } catch {}
  }

  // --- Grille aller × retour ---------------------------------------------------------
  async function loadMatrix() {
    const a = state.legs.aller, r = state.legs.retour;
    if (!a || !r) return;
    el.matrixCard.hidden = false;
    el.matrixNote.textContent = "calcul…";
    el.matrixWrap.innerHTML = `<p class="note">Prix mini par jour dans les deux sens, train ou avion. Les vols demandent un appel par jour : compte une vingtaine de secondes.</p>`;
    el.matrixBtn.disabled = true;
    el.matrixCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      const q = a.query;
      const m = await api("matrix", { from: q.from, to: q.to, date: q.date, dateRet: r.query.date, span: 3, ...apParams(q) });
      const val = (d) => (d.train != null && d.flight != null ? Math.min(d.train, d.flight) : d.train ?? d.flight);
      const mode = (d) => (d.train != null && (d.flight == null || d.train <= d.flight) ? "train" : "flight");
      let best = null;
      for (const o of m.out) for (const b of m.back) {
        if (b.date < o.date || val(o) == null || val(b) == null) continue;
        const t = val(o) + val(b);
        if (!best || t < best.t) best = { o: o.date, b: b.date, t };
      }
      const cell = (o, b) => {
        if (b.date < o.date) return `<td class="na"></td>`;
        if (val(o) == null || val(b) == null) return `<td class="na">—</td>`;
        const t = val(o) + val(b);
        const cls = [best && best.o === o.date && best.b === b.date && "best", o.date === q.date && b.date === r.query.date && "current"].filter(Boolean).join(" ");
        return `<td class="${cls}"><button type="button" data-out="${o.date}" data-back="${b.date}" title="Aller ${fmtDate(o.date)}, retour ${fmtDate(b.date)}"><b>${Math.round(t)} €</b><small>${ICON[mode(o)]}${val(o)} + ${ICON[mode(b)]}${val(b)}</small></button></td>`;
      };
      el.matrixWrap.innerHTML = `<table class="matrix-table"><thead><tr><th>aller ↓ retour →</th>${m.back.map((b) => `<th>${fmtDay(b.date)}</th>`).join("")}</tr></thead><tbody>${m.out.map((o) => `<tr><th>${fmtDay(o.date)}</th>${m.back.map((b) => cell(o, b)).join("")}</tr>`).join("")}</tbody></table>`;
      el.matrixNote.textContent = best ? `le moins cher : ${fmtDate(best.o)} → ${fmtDate(best.b)}, ${Math.round(best.t)} € par voyageur` : "";
    } catch (e) {
      el.matrixWrap.innerHTML = `<p class="note">Grille indisponible : ${esc(e.message)}</p>`;
      el.matrixNote.textContent = "";
    }
    el.matrixBtn.disabled = false;
  }

  // --- Alertes de prix -------------------------------------------------------------
  async function loadAlerts() {
    try {
      state.alerts = (await api("alerts")).list || [];
    } catch { state.alerts = []; }
    renderAlerts();
  }

  function renderAlerts() {
    const list = [...state.alerts].sort((a, b) => a.date.localeCompare(b.date));
    el.alertsCard.hidden = !list.length;
    el.alertsCount.textContent = list.length;
    el.alertsList.innerHTML = list.map((a) => `<li>
      <div class="a-route"><span>${esc(a.fromName)} → ${esc(a.toName)}</span><span>${a.lastPrice != null ? eur(a.lastPrice) : "…"}</span></div>
      <div class="a-meta">${fmtDate(a.date)}${a.pax > 1 ? ` · ${a.pax} voyageurs` : ""} · ${a.modes === "train" ? "train" : a.modes === "flight" ? "avion" : "train ou avion"} · ${a.maxPrice != null ? `sous ${a.maxPrice} €` : "à chaque baisse"}${a.notifiedAt ? ` · <span class="ok">prévenu à ${eur(a.notifiedPrice)}</span>` : ""}</div>
      <div class="a-actions"><button type="button" class="linkbtn" data-open="${esc(a.id)}">Voir</button><button type="button" class="linkbtn rm" data-rm-alert="${esc(a.id)}">Retirer</button></div>
    </li>`).join("");
    const p = state.status?.push;
    el.alertsNote.textContent = !p ? "" : p.devices
      ? `Vérifiées toutes les 30 min, notifications sur ${plural(p.devices, "appareil")}${p.ntfy ? " et ntfy" : ""}.`
      : p.ntfy ? "Vérifiées toutes les 30 min, notifications par ntfy." : "Vérifiées toutes les 30 min. Aucun appareil ne reçoit encore les notifications.";
  }

  const urlB64ToU8 = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function ensurePush() {
    if (/VolRailMac/.test(navigator.userAgent)) return { ok: true, why: "L'app Mac affichera la notification." };
    if (!window.isSecureContext) return { ok: false, why: "Alerte vérifiée par le Mac toutes les 30 min. Pour la recevoir en notification sur l'iPhone, ouvre VolRail depuis son icône de l'écran d'accueil." };
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, why: "Pas de notifications dans ce navigateur. Sur iPhone : ajoute l'app à l'écran d'accueil et ouvre-la depuis son icône." };
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if ((await Notification.requestPermission()) !== "granted") return { ok: false, why: "Notifications refusées dans les réglages de l'appareil." };
        const { key } = await api("push/key");
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
      }
      await api("push/subscribe", null, { method: "POST", body: { subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) } });
      return { ok: true, why: "Notifications actives sur cet appareil." };
    } catch (e) {
      return { ok: false, why: e.message };
    }
  }

  function openAlertDialog() {
    const leg = current();
    if (!leg) return;
    const q = leg.query;
    const min = cheapestOf(leg.items.filter((it) => !it.estimated));
    el.alertRoute.textContent = `${q.fromName} → ${q.toName}, ${fmtLong(q.date)}${q.pax > 1 ? `, ${q.pax} voyageurs` : ""}${min ? `. Aujourd'hui dès ${eur(min.price)}.` : "."}`;
    el.alertMax.value = min ? Math.max(1, Math.round(min.price * 0.85)) : "";
    el.alertModes.value = state.tab === "train" || state.tab === "flight" ? state.tab : "all";
    el.alertPushState.textContent = "";
    el.alertSave.disabled = false;
    el.alertDialog.showModal();
    ensurePush().then((r) => { el.alertPushState.textContent = r.why; });
  }

  async function saveAlert(e) {
    e.preventDefault();
    const q = current()?.query;
    if (!q) return;
    el.alertSave.disabled = true;
    try {
      await api("alerts", null, { method: "POST", body: { from: q.from, to: q.to, date: q.date, pax: q.pax, cards: q.cards, fromAp: q.fromAp, toAp: q.toAp, maxPrice: el.alertMax.value || null, modes: el.alertModes.value } });
      el.alertDialog.close();
      toast("Alerte créée");
      await loadStatus();
      await loadAlerts();
    } catch (err) {
      el.alertPushState.textContent = "Impossible de créer l'alerte : " + err.message;
    }
    el.alertSave.disabled = false;
  }

  // --- Partage ------------------------------------------------------------------------
  async function share() {
    const leg = state.legs.aller;
    if (!leg) return;
    const q = leg.query;
    const min = cheapestOf(leg.items);
    const text = `${q.fromName} → ${q.toName} le ${fmtDate(q.date)}${state.legs.retour ? `, retour le ${fmtDate(state.legs.retour.query.date)}` : ""}${min ? ` : dès ${eur(min.price)}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "VolRail", text, url: location.href });
      else { await navigator.clipboard.writeText(location.href); toast("Lien copié"); }
    } catch {}
  }

  // --- Export calendrier --------------------------------------------------------------
  // Un trajet du panier -> événement(s) : un par tronçon pour les combinés.
  function basketEvents() {
    const out = [];
    const local = (date, min) => { const d = new Date(date + "T00:00:00"); d.setMinutes(min); return d; };
    const isoLocal = (d) => `${localISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    for (const b of state.basket) {
      const q = b.query || {};
      const legs = b.item.mode === "combo" ? b.item.legs : [b.item];
      for (const l of legs) {
        if (l.dep == null || l.arr == null) continue;
        const what = l.mode === "train" ? "Train" : "Vol";
        const where = l.mode === "flight" ? `${l.from} → ${l.to}` : b.item.mode === "combo" ? (l === legs[0] ? `${q.fromName} → ${b.item.hub.name}` : `${b.item.hub.name} → ${q.toName}`) : `${q.fromName} → ${q.toName}`;
        const link = l.link || b.item.link || "";
        out.push({
          title: `${what} ${where} · ${l.operator}`,
          start: isoLocal(local(l.date, l.dep)),
          end: isoLocal(local(l.date, l.arr)),
          url: link,
          notes: `${eur(l.price)}${q.pax > 1 ? ` pour ${q.pax} voyageurs` : ""} · ${dur(l.duration)}${l.direct === false ? ` · ${plural(l.changes, "correspondance")}` : ""}\nRéservation : ${link}\nAjouté par VolRail`,
        });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  async function downloadIcs() {
    const ev = basketEvents();
    if (!ev.length) return toast("Aucun horaire à exporter");
    const stamp = (s) => s.replace(/[-:]/g, "");
    const escI = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    // Lignes de plus de 75 octets repliées (RFC 5545) : certains agendas tronquent sinon.
    const fold = (line) => {
      const out = [];
      let cur = "";
      for (const ch of line) {
        if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = " "; }
        cur += ch;
      }
      out.push(cur);
      return out.join("\r\n");
    };
    const now = stamp(new Date().toISOString().slice(0, 19)) + "Z";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VolRail//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    ev.forEach((e, i) => lines.push("BEGIN:VEVENT", `UID:volrail-${stamp(e.start)}-${i}-${Math.random().toString(36).slice(2, 8)}@volrail`, `DTSTAMP:${now}`, `DTSTART;TZID=Europe/Paris:${stamp(e.start)}`, `DTEND;TZID=Europe/Paris:${stamp(e.end)}`, `SUMMARY:${escI(e.title)}`, `DESCRIPTION:${escI(e.notes)}`, ...(e.url ? [`URL:${e.url}`] : []), "END:VEVENT"));
    lines.push("END:VCALENDAR");
    const text = lines.map(fold).join("\r\n");
    // Au doigt (iPhone) : le serveur sert le fichier, Safari propose alors de l'ajouter au Calendrier.
    if (!macBridge && touch()) {
      try {
        const { url } = await api("ics", null, { method: "POST", body: { text } });
        location.href = API + url;
      } catch (e) { toast("Export impossible : " + e.message); }
      return;
    }
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "volrail.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function addToMacCalendar() {
    const ev = basketEvents();
    if (!ev.length) return toast("Aucun horaire à exporter");
    el.macCalBtn.disabled = true;
    try {
      const d = await api("calendar/mac", null, { method: "POST", body: { events: ev } });
      toast(`${plural(d.added, "événement ajouté", "événements ajoutés")} à « ${d.calendar} »`);
    } catch (e) {
      alert("Calendrier du Mac : " + e.message);
    }
    el.macCalBtn.disabled = false;
  }

  // --- Panier ---------------------------------------------------------------------
  // Clé stable d'un trajet : mode, jour, horaires, opérateur et aéroports.
  const itemKey = (it) => [it.mode, it.date, it.dep, it.arr, it.operator, it.from || "", it.to || "", it.hub?.id || ""].join("|");
  const saveBasket = () => store.set("basket", state.basket);

  function markKept(key, kept) {
    el.list.querySelectorAll(`[data-key="${CSS.escape(key)}"] .keep`).forEach((b) => {
      b.classList.toggle("kept", kept);
      b.setAttribute("aria-pressed", String(kept));
      b.innerHTML = kept ? svg("check") + "Gardé" : svg("plus") + "Garder";
    });
  }

  function toggleBasket(it) {
    const key = itemKey(it);
    const i = state.basket.findIndex((b) => b.key === key);
    if (i >= 0) state.basket.splice(i, 1);
    else state.basket.push({ key, item: it, query: current().query, leg: state.legs.retour ? state.leg : null, addedAt: Date.now() });
    saveBasket();
    renderBasket();
    markKept(key, i < 0);
    if (i < 0) { el.basketFab.classList.remove("bump"); void el.basketFab.offsetWidth; el.basketFab.classList.add("bump"); }
    renderRoundTrip();
  }

  function renderBasket() {
    const list = [...state.basket].sort((a, b) => (a.item.date + hm(a.item.dep)).localeCompare(b.item.date + hm(b.item.dep)));
    const n = list.length;
    el.basketCount.textContent = n;
    el.basketFabCount.textContent = n;
    el.basketFab.classList.toggle("has", n > 0);
    el.basketEmpty.hidden = n > 0;
    el.basketFoot.hidden = n === 0;
    el.basketExport.hidden = n === 0;
    el.basketTotal.textContent = eur(list.reduce((s, b) => s + (b.item.price || 0), 0));
    el.basketList.innerHTML = list.map((b) => {
      const it = b.item;
      const q = b.query || {};
      const detail = it.mode === "flight" ? `${esc(it.from)} → ${esc(it.to)}` : it.mode === "combo" ? `via ${esc(it.hub.name)}` : "";
      const ageH = Math.round((Date.now() - b.addedAt) / 3600000);
      const past = it.date < today();
      return `<li>
        <div class="b-route"><span>${b.leg ? `<span class="tag">${LEG_LABEL[b.leg]}</span>` : ""}${q.fromName ? `${esc(q.fromName)} → ${esc(q.toName)}` : esc(it.operator)}</span><span>${eur(it.price)}</span></div>
        <div class="b-when">${ICON[it.mode]}${fmtDate(it.date)} · ${hm(it.dep)} → ${hm(it.arr)}${plusDays(it.arr) ? " +1 j" : ""} · ${esc(it.operator)}${detail ? " · " + detail : ""}${q.pax > 1 ? ` · ${q.pax} voyageurs` : ""}</div>
        ${past ? `<div class="stale">Trajet passé</div>` : ageH >= 6 ? `<div class="stale">Prix vu il y a ${ageH < 48 ? ageH + " h" : Math.round(ageH / 24) + " j"}, à revérifier</div>` : ""}
        <div class="b-acts">${bookLinks(it)}<button type="button" class="rm" data-rm="${esc(b.key)}">Retirer</button></div>
      </li>`;
    }).join("");
  }

  function openBasket(open) {
    el.basket.classList.toggle("open", open);
    el.scrim.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open && !touch()) $("basketClose").focus();
  }

  // --- Dates du formulaire ------------------------------------------------------------
  function syncDates() {
    el.dateRet.min = el.date.value || today();
    if (el.dateRet.value && el.dateRet.value < el.date.value) el.dateRet.value = "";
    el.clearRet.hidden = !el.dateRet.value;
    el.dateRet.closest(".field").classList.toggle("is-blank", !el.dateRet.value);
    renderQuick();
  }
  const setPax = (n) => { state.pax = Math.min(9, Math.max(1, n)); el.pax.value = state.pax; renderPaxSummary(); };

  // --- Événements -------------------------------------------------------------
  const ensureFrom = bindSuggest(el.from, el.fromId, el.fromSuggest);
  const ensureTo = bindSuggest(el.to, el.toId, el.toSuggest);

  el.form.addEventListener("submit", (e) => { e.preventDefault(); search(); });
  el.searchSummary.addEventListener("click", () => setCompact(!el.colSearch.classList.contains("compact")));
  $("swap").addEventListener("click", () => {
    [el.from.value, el.to.value] = [el.to.value, el.from.value];
    [el.fromId.value, el.toId.value] = [el.toId.value, el.fromId.value];
    [el.fromId.dataset.ap, el.toId.dataset.ap] = [el.toId.dataset.ap || "", el.fromId.dataset.ap || ""];
  });
  $("paxMinus").addEventListener("click", () => setPax(state.pax - 1));
  $("paxPlus").addEventListener("click", () => setPax(state.pax + 1));
  el.date.addEventListener("change", syncDates);
  el.dateRet.addEventListener("change", syncDates);
  el.dateRet.addEventListener("input", syncDates);
  el.clearRet.addEventListener("click", () => { el.dateRet.value = ""; syncDates(); });
  const pickRecent = (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const r = state.recents[Number(b.dataset.i)];
    if (!r) return;
    setCity(el.from, el.fromId, r.from, r.fromName, r.fromAp);
    setCity(el.to, el.toId, r.to, r.toName, r.toAp);
    search();
  };
  el.quick.addEventListener("click", pickRecent);
  $("recentCards").addEventListener("click", pickRecent);
  // Menus déroulants (voyageurs, filtres) : un clic ailleurs ou Échap les referme.
  const pops = [$("paxPop"), el.options];
  document.addEventListener("click", (e) => { for (const d of pops) if (d.open && !d.contains(e.target)) d.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") for (const d of pops) d.open = false; });
  for (const d of pops) d.addEventListener("toggle", () => { if (d.open) for (const o of pops) if (o !== d) o.open = false; });
  el.notices.addEventListener("click", (e) => {
    if (e.target.closest("#pasteCookie")) pasteCookie();
    if (e.target.closest("#unblockSncf")) unblockSncf();
  });
  // « SNCF en pause » en haut : un clic débloque (app Mac) ou explique comment faire.
  el.status.addEventListener("click", () => {
    if (state.needKey) {
      const v = prompt("Clé d'accès VolRail :");
      if (v) { ls.set("volrail.key", v.trim()); location.reload(); }
      return;
    }
    if (!el.status.classList.contains("warn")) return;
    if (macBridge) unblockSncf();
    else if (touch()) toast("SNCF repart tout seul, ou via « Débloquer » sur le Mac");
    else pasteCookie();
  });
  el.legSwitch.addEventListener("click", (e) => {
    const b = e.target.closest("[data-leg]");
    if (!b || !state.legs[b.dataset.leg] || state.leg === b.dataset.leg) return;
    state.leg = b.dataset.leg;
    state.calMonth = "";
    state.showAll = false;
    state.airport = "";
    render();
  });
  el.tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    state.showAll = false;
    renderList();
  });
  el.sort.addEventListener("change", () => { state.sort = el.sort.value; renderList(); });
  el.airportChips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-airport]");
    if (!b) return;
    state.airport = b.dataset.airport;
    state.showAll = false;
    renderList();
  });
  el.moreBtn.addEventListener("click", () => { state.showAll = true; renderList(); });
  el.best.addEventListener("click", (e) => {
    const t = e.target.closest("[data-mode]");
    if (!t) return;
    state.tab = t.dataset.mode;
    state.sort = "price";
    el.sort.value = "price";
    state.showAll = false;
    renderList();
    el.tabs.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Calendrier : un clic change la date du sens affiché ; l'autre sens suit si besoin.
  el.calToggle.addEventListener("click", () => {
    const c = el.calendar.classList.toggle("collapsed");
    el.calToggle.setAttribute("aria-expanded", String(!c));
  });
  const stepMonth = (delta) => {
    const leg = current();
    if (!leg?.calendar) return;
    const months = calendarMonths(calendarDays(leg.calendar), leg.query.date);
    const i = months.indexOf(state.calMonth) + delta;
    if (i < 0 || i >= months.length) return;
    state.calMonth = months[i];
    renderCalendar();
  };
  el.calPrev.addEventListener("click", () => stepMonth(-1));
  el.calNext.addEventListener("click", () => stepMonth(1));
  el.calStrip.addEventListener("click", (e) => {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    const date = b.dataset.date;
    if (state.leg === "retour") {
      el.dateRet.value = date;
      if (date < el.date.value) el.date.value = date;
    } else {
      const stay = el.dateRet.value ? daysBetween(el.date.value, el.dateRet.value) : null;
      el.date.value = date;
      if (stay != null && el.dateRet.value < date) el.dateRet.value = addDays(date, stay);
    }
    syncDates();
    search({ keepLeg: true });
  });

  el.list.addEventListener("click", (e) => {
    const b = e.target.closest(".keep");
    if (!b) return;
    const it = visibleItems()[Number(b.closest(".item").dataset.i)];
    if (it) toggleBasket(it);
  });
  el.nearbyList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-city]");
    if (!b) return;
    // Sens aller : on change le départ ; sens retour : le départ du retour est l'arrivée de l'aller.
    if (state.leg === "retour") setCity(el.to, el.toId, b.dataset.city, b.dataset.name);
    else setCity(el.from, el.fromId, b.dataset.city, b.dataset.name);
    search({ keepLeg: true });
  });

  // Options et filtres
  el.nearby.checked = store.get("nearby", 1) !== 0 && store.get("nearby", "1") !== "0";
  el.nearby.addEventListener("change", () => store.set("nearby", el.nearby.checked ? 1 : 0));
  el.d2d.checked = state.d2d;
  el.d2d.addEventListener("change", () => {
    state.d2d = el.d2d.checked;
    store.set("d2d", state.d2d);
    if (current()) render();
  });
  el.card.addEventListener("change", () => { state.card = el.card.value; store.set("card", state.card); renderPaxSummary(); });
  el.fDepAfter.value = state.filters.depAfter; el.fArrBefore.value = state.filters.arrBefore;
  el.fDirect.checked = state.filters.direct; el.fNoLowcost.checked = state.filters.noLowcost;
  const readFilters = () => {
    state.filters = { depAfter: el.fDepAfter.value, arrBefore: el.fArrBefore.value, direct: el.fDirect.checked, noLowcost: el.fNoLowcost.checked };
    store.set("filters", state.filters);
    renderFilterCount();
    if (current()) renderList();
  };
  for (const x of [el.fDepAfter, el.fArrBefore, el.fDirect, el.fNoLowcost]) x.addEventListener("change", readFilters);
  el.fReset.addEventListener("click", () => { el.fDepAfter.value = ""; el.fArrBefore.value = ""; el.fDirect.checked = false; el.fNoLowcost.checked = false; readFilters(); });
  renderFilterCount();

  // Alertes, grille, partage, export
  el.alertBtn.addEventListener("click", openAlertDialog);
  el.alertForm.addEventListener("submit", saveAlert);
  $("alertCancel").addEventListener("click", () => el.alertDialog.close());
  el.alertsList.addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-rm-alert]");
    if (rm) {
      try { await api("alerts/" + encodeURIComponent(rm.dataset.rmAlert), null, { method: "DELETE" }); }
      catch (err) { toast("Impossible de retirer l'alerte : " + err.message); }
      return loadAlerts();
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      const a = state.alerts.find((x) => x.id === open.dataset.open);
      if (!a) return;
      el.date.value = a.date; el.dateRet.value = ""; syncDates(); setPax(a.pax);
      setCity(el.from, el.fromId, a.from, null, a.fromAp);
      setCity(el.to, el.toId, a.to, null, a.toAp);
      search();
    }
  });
  el.matrixBtn.addEventListener("click", loadMatrix);
  el.matrixWrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-out]");
    if (!b) return;
    el.date.value = b.dataset.out; el.dateRet.value = b.dataset.back; syncDates();
    search({ keepLeg: true });
  });
  el.shareBtn.addEventListener("click", share);
  $("icsBtn").addEventListener("click", downloadIcs);
  el.macCalBtn.addEventListener("click", addToMacCalendar);
  el.basketList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    state.basket = state.basket.filter((x) => x.key !== b.dataset.rm);
    saveBasket();
    renderBasket();
    markKept(b.dataset.rm, false);
    renderRoundTrip();
  });
  $("basketClear").addEventListener("click", () => {
    if (!state.basket.length || !confirm("Vider le panier ?")) return;
    const keys = state.basket.map((b) => b.key);
    state.basket = [];
    saveBasket();
    renderBasket();
    keys.forEach((k) => markKept(k, false));
    renderRoundTrip();
  });
  el.basketFab.addEventListener("click", () => openBasket(true));
  $("basketClose").addEventListener("click", () => openBasket(false));
  el.scrim.addEventListener("click", () => openBasket(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.basket.classList.contains("open")) openBasket(false); });
  renderBasket();
  renderQuick();

  // --- Démarrage ------------------------------------------------------------------
  // Cartes de réduction connues de SNCF Connect ; liste de repli si l'API ne répond pas.
  async function loadCards() {
    const fallback = [{ label: "Cartes SNCF", cards: [["WEEKEND_PASS", "Carte Avantage Adulte"], ["YOUNG_PASS", "Carte Avantage Jeune"], ["SENIOR_PASS", "Carte Avantage Senior"], ["LIBERTE_PASS_FE", "Carte Liberté"], ["TGV_MAX", "MAX JEUNE"], ["TGV_MAX_SENIOR", "MAX SENIOR"]].map(([code, label]) => ({ code, label })) }];
    let groups = [];
    try { groups = (await api("sncf/cards")).groups || []; } catch {}
    if (!groups.length) groups = fallback;
    el.card.innerHTML = `<option value="">Aucune</option>` + groups.map((g) => `<optgroup label="${esc(g.label)}">${g.cards.map((c) => `<option value="${esc(c.code)}">${esc(c.label)}</option>`).join("")}</optgroup>`).join("");
    if (state.card && !groups.some((g) => g.cards.some((c) => c.code === state.card))) el.card.insertAdjacentHTML("beforeend", `<option value="${esc(state.card)}">${esc(state.card)}</option>`);
    el.card.value = state.card;
    renderPaxSummary();
  }

  (async () => {
    if (narrow()) { el.calendar.classList.add("collapsed"); el.calToggle.setAttribute("aria-expanded", "false"); }
    const t = today();
    el.date.min = t;
    el.date.value = addDays(t, 1);
    loadCards();
    loadAlerts();
    loadStatus();
    setInterval(loadStatus, 60000); // « SNCF en pause » se met à jour sans recharger
    // Lien partagé (?from=nice&to=paris&date=…&ret=…&pax=2) : on lance la recherche directement.
    const u = new URLSearchParams(location.search);
    const last = store.get("last", null);
    const src = u.get("from") && u.get("to") ? { from: u.get("from"), to: u.get("to"), date: u.get("date"), dateRet: u.get("ret"), pax: Number(u.get("pax")) || 1, fa: u.get("fa"), ta: u.get("ta"), auto: true } : last;
    if (src) {
      if (src.date && src.date >= t) {
        el.date.value = src.date;
        if (src.dateRet && src.dateRet >= src.date) el.dateRet.value = src.dateRet;
      }
      setPax(src.pax || 1);
      await Promise.all([setCity(el.from, el.fromId, src.from, null, src.fa), setCity(el.to, el.toId, src.to, null, src.ta)]);
    } else {
      setCity(el.from, el.fromId, "nice", "Nice");
      setCity(el.to, el.toId, "paris", "Paris");
    }
    syncDates();
    if (src?.auto && el.fromId.value && el.toId.value) search();
  })();

  // L'avion du ciel suit une courbe calée sur la largeur de la fenêtre (offset-path est en pixels).
  const plane = $("heroPlane"), hero = $("hero");
  const planePath = () => {
    // Dans le ciel dégagé, au-dessus du titre : on monte doucement de gauche à droite.
    const w = hero.clientWidth;
    // Téléphone : pas de ciel libre au-dessus du titre, l'avion longe la bande dégagée sous la barre.
    if (matchMedia("(max-width: 600px)").matches) {
      const y = el.colSearch.offsetTop - 21;
      plane.style.offsetPath = `path("M -200 ${y + 9} C ${w * 0.3} ${y + 4}, ${w * 0.62} ${y - 3}, ${w + 220} ${y - 7}")`;
      return;
    }
    plane.style.offsetPath = `path("M -320 86 C ${w * 0.28} 52, ${w * 0.62} 22, ${w + 340} 30")`;
  };
  planePath();
  new ResizeObserver(planePath).observe(hero);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
