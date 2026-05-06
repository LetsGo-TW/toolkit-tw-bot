// 1) Mapeia market -> fuso do servidor (ajuste aqui se precisar)
const SERVER_TZ_BY_MARKET = {
  br: "America/Sao_Paulo",
  us: "America/New_York",
  uk: "Europe/London",
  en: "Europe/London",
  de: "Europe/Berlin",
  es: "Europe/Madrid",
  pl: "Europe/Warsaw",
  // fallback:
  default: "UTC",
};

// 2) Descobre o offset (minutos) de uma zona IANA em um instante
function offsetMinutesForZone(timeZone, at = new Date()) {
  // formata a data na zona pedida e pega a diferença para o UTC
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
  const parts = dtf.formatToParts(at).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  // constroi uma data UTC a partir das partes (na zona do servidor)
  const serverUTC = Date.UTC(
    Number(parts.year), Number(parts.month)-1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second), 0
  );
  // diferença entre "mesma hora na zona" e o timestamp local real
  return Math.round((serverUTC - at.getTime()) / 60000);
}

// 3) Dicionários de meses por idioma principal do locale
function monthDictForLocale(locale = "pt_BR") {
  const lang = String(locale).toLowerCase().split(/[_-]/)[0]; // "pt", "en", "de"…
  const base = {
    // PT
    pt: {
      jan:1,janeiro:1, fev:2,fevereiro:2, mar:3,março:3,marco:3, abr:4,abril:4,
      mai:5,maio:5, jun:6,junho:6, jul:7,julho:7, ago:8,agosto:8,
      set:9,setembro:9, out:10,outubro:10, nov:11,novembro:11, dez:12,dezembro:12,
    },
    // EN
    en: {
      jan:1,january:1, feb:2,february:2, mar:3,march:3, apr:4,april:4,
      may:5, jun:6,june:6, jul:7,july:7, aug:8,august:8,
      sep:9,sept:9,september:9, oct:10,october:10, nov:11,november:11, dec:12,december:12,
    },
    // fallback razoável
    default: {}
  };
  return base[lang] || base.default;
}

// 4) Parser de relatório integrando locale/market e inferência de ano
function parseReportTimeToEpochAuto(s, { locale, market, now = new Date() }) {
  if (typeof s !== "string") throw new Error("Esperado string");
  const raw = s.trim().toLowerCase().replace(/\s+/g," ");
  const meses = monthDictForLocale(locale);

  // tenta "mon dd, [yyyy] HH:MM" e "dd mon [yyyy] HH:MM"
  const norm = (m) => m.replace(/\./g,"");
  let m = raw.match(/^([a-zç.]+)\s+(\d{1,2}),\s*(?:(\d{4})\s*)?(\d{1,2}):(\d{2})$/i);
  let day, mon, year, hh, mm;
  if (m) {
    day  = +m[2]; year = m[3] ? +m[3] : null; hh = +m[4]; mm = +m[5];
    mon  = meses[norm(m[1])] ?? null;
  } else {
    m = raw.match(/^(\d{1,2})\s+([a-zç.]+)\s*(?:(\d{4})\s*)?(\d{1,2}):(\d{2})$/i);
    if (!m) throw new Error("Formato inválido");
    day  = +m[1]; year = m[3] ? +m[3] : null; hh = +m[4]; mm = +m[5];
    mon  = meses[norm(m[2])] ?? null;
  }
  if (!mon || day<1 || day>31 || hh>23 || mm>59) throw new Error("Data/hora inválida");

  // fuso do servidor a partir do market
  const tz = SERVER_TZ_BY_MARKET[market] || SERVER_TZ_BY_MARKET.default;
  const off = offsetMinutesForZone(tz, now); // minutos (UTC -> server)

  // constrói epoch interpretando a string na HORA DO SERVIDOR
  const makeEpoch = (y) => {
    const utcMs = Date.UTC(y, mon-1, day, hh, mm, 0, 0);
    // server time = UTC + offset  => epoch real = utcMs - off(min)
    return utcMs - off*60000;
  };

  const baseYear = year ?? now.getFullYear();
  let t = makeEpoch(baseYear);

  // se sem ano e ficou no "futuro" (24h), assume ano anterior
  if (!year && t > now.getTime() + 24*60*60*1000) t = makeEpoch(baseYear - 1);
  return t;
}
export { parseReportTimeToEpochAuto }
