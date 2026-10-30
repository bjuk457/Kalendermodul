// Kalendermodul – Listen-Kalenderkarte für Home Assistant.
// Liest beliebige calendar.*-Entitäten (ICS/Remote Calendar, Google, CalDAV, Local …) über die HA-API.

// 20 Farben im Regenbogen-Verlauf für das Dropdown im Editor.
const COLORS = [
  ["#e53935", "Rot"], ["#f4511e", "Orangerot"], ["#fb8c00", "Orange"], ["#ffb300", "Bernstein"], ["#fdd835", "Gelb"],
  ["#c0ca33", "Limette"], ["#7cb342", "Hellgrün"], ["#43a047", "Grün"], ["#2e7d32", "Dunkelgrün"], ["#00897b", "Türkis"],
  ["#00acc1", "Cyan"], ["#039be5", "Hellblau"], ["#1e88e5", "Blau"], ["#3949ab", "Königsblau"], ["#5c6bc0", "Indigo"],
  ["#7e57c2", "Violett"], ["#8e24aa", "Lila"], ["#ab47bc", "Purpur"], ["#d81b60", "Magenta"], ["#ec407a", "Pink"],
];
// Standardfarbe ohne Angabe: Schrittweite 7 hält benachbarte Kalender optisch auseinander.
const defaultColor = (i) => COLORS[(i * 7) % COLORS.length][0];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Ganztägig: "YYYY-MM-DD" lokal parsen (new Date("YYYY-MM-DD") wäre UTC).
const parseTime = (t) => {
  if (t.dateTime) return { date: new Date(t.dateTime), allDay: false };
  const [y, m, d] = t.date.split("-").map(Number);
  return { date: new Date(y, m - 1, d), allDay: true };
};

// Ereignisse -> [{key, date, events:[...]}], nächster Tag zuerst, innerhalb des Tages ganztägig zuerst.
// shortcut: mehrtägige Termine erscheinen nur an ihrem (auf heute begrenzten) Starttag, bei Bedarf auf jeden Tag ausrollen.
function groupEvents(events, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const groups = new Map();
  for (const ev of events) {
    if (ev.end <= now) continue;
    const day = ev.start < today ? today : new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
    const key = dayKey(day);
    if (!groups.has(key)) groups.set(key, { key, date: day, events: [] });
    groups.get(key).events.push(ev);
  }
  const out = [...groups.values()].sort((a, b) => a.date - b.date);
  for (const g of out) g.events.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
  return out;
}

// Ende ist exklusiv (Ganztägig: Folgetag 00:00; 22:00–00:00 zählt als ein Tag), daher 1 ms abziehen.
const lastDay = (ev) => new Date(ev.end.getTime() - 1);
const isMultiDay = (ev) => dayKey(ev.start) !== dayKey(lastDay(ev));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Fallback nur, damit test.js die Logik unter Node laden kann.
class KalendermodulCard extends (typeof HTMLElement !== "undefined" ? HTMLElement : class {}) {
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "days", selector: { number: { min: 1, max: 365, mode: "box" } } },
        {
          name: "entities",
          selector: {
            object: {
              multiple: true,
              label_field: "entity",
              fields: {
                entity: { label: "Kalender", required: true, selector: { entity: { filter: { domain: "calendar" } } } },
                color: {
                  label: "Farbe",
                  selector: { select: { mode: "dropdown", custom_value: true, options: COLORS.map(([value, label]) => ({ value, label })) } },
                },
              },
            },
          },
        },
      ],
      computeLabel: (s) => ({ title: "Titel", days: "Tage im Voraus", entities: "Kalender" })[s.name],
    };
  }

  static getStubConfig(hass) {
    const cal = Object.keys(hass.states).filter((e) => e.startsWith("calendar.")).slice(0, 2);
    return { title: "Termine", days: 14, entities: cal.map((entity, i) => ({ entity, color: defaultColor(i) })) };
  }

  setConfig(config) {
    if (!Array.isArray(config.entities) || !config.entities.length) throw new Error("Bitte mindestens einen Kalender unter 'entities' angeben.");
    this._config = {
      days: 14,
      ...config,
      entities: config.entities.map((e, i) => {
        const c = typeof e === "string" ? { entity: e } : e;
        return { ...c, color: c.color || defaultColor(i) };
      }),
    };
    this._events = null;
    if (this._hass) this._fetch();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config) this._fetch();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._fetch(), 5 * 60 * 1000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 6;
  }

  async _fetch() {
    if (!this._hass || !this._config) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + this._config.days * 86400000);
    const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const results = await Promise.all(
      this._config.entities.map(async (cal) => {
        try {
          const list = await this._hass.callApi("GET", `calendars/${cal.entity}?${range}`);
          return list.map((ev) => {
            const s = parseTime(ev.start);
            const e = parseTime(ev.end);
            return { summary: ev.summary, location: ev.location, start: s.date, end: e.date, allDay: s.allDay, color: cal.color };
          });
        } catch (err) {
          console.warn("kalendermodul-card:", cal.entity, err);
          return [];
        }
      })
    );
    this._events = results.flat();
    this._render();
  }

  _render() {
    const lang = this._hass.locale?.language || this._hass.language || "de";
    const now = new Date();
    const todayKey = dayKey(now);
    const tomorrowKey = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const fmtTime = (d) => d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
    const fmtDate = (d) => d.toLocaleDateString(lang, { day: "2-digit", month: "2-digit" });
    const groups = groupEvents(this._events || [], now);

    const rows = groups.map((g) => {
      const label = g.key === todayKey ? "Heute" : g.key === tomorrowKey ? "Morgen" : g.date.toLocaleDateString(lang, { weekday: "short" });
      const items = g.events.map((ev) => {
        const time = isMultiDay(ev)
          ? ev.allDay
            ? `${fmtDate(ev.start)} – ${fmtDate(lastDay(ev))}`
            : `${fmtDate(ev.start)} ${fmtTime(ev.start)} – ${fmtDate(ev.end)} ${fmtTime(ev.end)}`
          : ev.allDay ? "Ganztägig" : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
        const loc = ev.location ? ` · ${esc(ev.location)}` : "";
        return `<div class="ev" style="--c:${esc(ev.color)}"><div class="sum">${esc(ev.summary)}</div><div class="time">${time}${loc}</div></div>`;
      });
      return `<div class="day${g.key === todayKey ? " today" : ""}">
        <div class="date"><div class="wd">${esc(label)}</div><div class="num">${g.date.getDate()}</div><div class="mon">${esc(g.date.toLocaleDateString(lang, { month: "short" }))}</div></div>
        <div class="events">${items.join("")}</div></div>`;
    });

    const body = this._events === null ? `<div class="empty">Lade …</div>` : rows.length ? rows.join("") : `<div class="empty">Keine Termine</div>`;
    const title = this._config.title ? `<h1 class="card-header">${esc(this._config.title)}</h1>` : "";

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
      .wrap { padding: 0 16px 16px; }
      .card-header { padding: 16px 0 8px; margin: 0; font-size: var(--ha-card-header-font-size, 24px); font-weight: 400; }
      .day { display: flex; gap: 16px; padding: 10px 0; border-top: 1px solid var(--divider-color); }
      .day:first-child { border-top: none; }
      .date { flex: 0 0 52px; text-align: center; color: var(--secondary-text-color); }
      .today .date { color: var(--primary-color); }
      .num { font-size: 2em; font-weight: 500; line-height: 1.1; }
      .wd, .mon { font-size: 0.8em; text-transform: uppercase; }
      .events { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .sum { font-weight: 500; color: var(--c); overflow-wrap: anywhere; }
      .time { font-size: 0.85em; color: var(--secondary-text-color); }
      .empty { padding: 16px 0; color: var(--secondary-text-color); }
    </style><ha-card><div class="wrap">${title}${body}</div></ha-card>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("kalendermodul-card")) {
  customElements.define("kalendermodul-card", KalendermodulCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "kalendermodul-card", name: "Kalendermodul", description: "Terminliste mehrerer Kalender, farbig nach Kalender, gruppiert nach Tag." });
}

if (typeof module !== "undefined") module.exports = { groupEvents, parseTime, isMultiDay };
