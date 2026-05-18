(() => {
  const parseQueueTitle = (img) => img?.dataset?.title || img?.title || "";
  const parseQueueSource = (img) => ((img?.getAttribute("src") || img?.src || "").split("/").pop() || "").split(".")[0] || "";

  const parseTwInt = (value = "") => {
    const first = String(value || "").match(/-?[0-9][0-9.]*/)?.[0] || "0";
    const normalized = first.replaceAll(".", "");
    const parsed = Number(normalized || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const nDateTime = (date, time = "00:00:00", ms) => {
    const arrDate = String(date || "01/01/1970").split("/").map((e) => Number(e));
    const arrTime = String(time || "00:00:00").split(":").map((e) => Number(e));
    const nMs = ms ? Number(ms) : arrTime.length > 3 ? arrTime[3] : 0;

    if (arrTime.length === 2) {
      arrTime.unshift(0);
    }

    return Date.parse(new Date(
      arrDate[2],
      arrDate[1] - 1,
      arrDate[0],
      arrTime[0] || 0,
      arrTime[1] || 0,
      arrTime[2] || 0,
    )) + nMs;
  };

  const normalizeDateTwString = (value = "", doc = document) => {
    const strDate = String(value || "").trim().toLowerCase();
    const currentDate = doc.querySelector("#serverDate")?.textContent?.trim() || null;

    if (!strDate || !currentDate) return null;

    if (strDate.includes("hoje")) {
      return currentDate;
    }

    if (strDate.includes("amanhã") || strDate.includes("amanha")) {
      return new Date(nDateTime(currentDate) + 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR");
    }

    if (strDate.includes("ontem")) {
      return new Date(nDateTime(currentDate) - 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR");
    }

    const numericMatch = strDate.match(/[0-9]{1,2}[./][0-9]{1,2}(?:[./][0-9]{2,4})?/i);

    if (numericMatch) {
      const arrDate = numericMatch[0].split(/[./]/);
      const now = new Date(nDateTime(currentDate));
      const monthNow = now.getMonth() + 1;
      const yearNow = now.getFullYear();

      const day = Number(arrDate[0]);
      const month = Number(arrDate[1]);
      let year = arrDate[2] ? Number(arrDate[2]) : (month < monthNow ? yearNow + 1 : yearNow);

      if (year < 100) year += 2000;

      const normalized = new Date(year, month - 1, day).toLocaleDateString("pt-BR");
      return normalized !== "Invalid Date" ? normalized : null;
    }

    return null;
  };

  const parseDateAndTime = (strDate = "", html = document) => {
    const hhmm = strDate.match(/[0-9]{2}[:][0-9]{2}/ig);
    const strHour = hhmm ? `${hhmm[0]}:59` : "";
    const date =
      normalizeDateTwString(strDate, html) ||
      html.querySelector("#serverDate")?.textContent?.trim() ||
      document.querySelector("#serverDate")?.textContent?.trim() ||
      "01/01/1970";

    return {
      date: `${date}${strHour ? ` ${strHour}` : ""}`,
      time: nDateTime(date, strHour),
    };
  };

  const parseIncoming = (e, col) =>
    Array.from(e.querySelectorAll(`td:nth-child(${col}) > span > span > a:nth-child(1) > img`))
      .reduce((incoming, img) => {
        const title = img.title || img.dataset.title || "";
        const value = title.match(/[0-9]{1,}/ig) ? Number(title.match(/[0-9]{1,}/ig)[0]) : 0;

        if (img.src.includes("attack")) incoming.attack = value;
        if (img.src.includes("support")) incoming.support = value;

        return incoming;
      }, { attack: 0, support: 0 });

  const parseBuildQueue = (td) =>
    Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
      const source = parseQueueSource(img);
      const title = parseQueueTitle(img);
      const strDate = title.split(" - ")[1] || "";
      const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document);

      queue.push([source, date, time]);
      return queue;
    }, []);

  const parseSmithQueue = (td) =>
    Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
      const source = parseQueueSource(img).replace("unit_", "");
      const title = parseQueueTitle(img);
      const strDate = title.split(" - ")[1] || "";
      const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document);

      queue.push([source, date, time]);
      return queue;
    }, []);

  const resolveTrainBuilding = (unit = "") => {
    if (["spy", "light", "marcher", "heavy"].includes(unit)) return "stable";
    if (["spear", "sword", "axe", "archer"].includes(unit)) return "barracks";
    if (["ram", "catapult"].includes(unit)) return "garage";
    if (unit === "knight") return "statue";
    if (unit === "snob") return "snob";
    return "undefined";
  };

  const parseTrainQueue = (td) =>
    Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
      const unit = parseQueueSource(img).replace("unit_", "");
      const title = parseQueueTitle(img);
      const parts = title.split(" - ");
      const value = Number(parts[0] || 0);
      const strDate = parts[2] || "";
      const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document);

      queue.push({
        build: resolveTrainBuilding(unit),
        unit,
        value,
        time,
        date,
      });

      return queue;
    }, []);

  const TableProduction = (html = document) => {
    return Array.from(html.querySelectorAll("#production_table > tbody > tr"))
      .reduce((arr, e) => {
        const villageSpan = e.querySelector("span.quickedit-vn");
        const villageTd = villageSpan ? villageSpan.closest("td") : null;

        if (!villageSpan || !villageTd) {
          return arr;
        }

        const tds = Array.from(e.querySelectorAll("td"));
        const villageTdIndex = tds.indexOf(villageTd);

        if (villageTdIndex < 0) {
          return arr;
        }

        const col = villageTdIndex + 1;
        const id = Number(villageSpan.dataset.id);

        const coordMatch = e.querySelector("span.quickedit-content")?.innerText.match(/[0-9]{1,3}[|][0-9]{1,3}/ig);
        const coord = coordMatch ? coordMatch[0] : "0|0";
        const [x = 0, y = 0] = coord.split("|").map(Number);

        const bonusEl = e.querySelector("span.bonus_icon");
        const bonus = bonusEl
          ? [bonusEl.className, bonusEl.dataset.title || bonusEl.title || ""]
          : [];

        const incoming = parseIncoming(e, col);
        const points = parseTwInt((tds[col] || {}).innerText || 0);

        const [wood = 0, stone = 0, iron = 0] = String((tds[col + 1] || {}).innerText || "")
          .replaceAll(".", "")
          .trim()
          .split(/\s+/)
          .map(parseTwInt);

        const storage = parseTwInt((tds[col + 2] || {}).innerText || 0);
        const trader = parseTwInt(String((tds[col + 3] || {}).innerText || "").split("/")[0] || 0);
        const traderAll = parseTwInt(String((tds[col + 3] || {}).innerText || "").split("/")[1] || 0);

        const popValues = String((tds[col + 4] || {}).innerText || "0/0").split("/");
        const pop = parseTwInt(popValues[0] || 0);
        const pop_max = parseTwInt(popValues[1] || 0);

        const build = parseBuildQueue(tds[col + 5]);
        const smith = parseSmithQueue(tds[col + 6]);
        const train = parseTrainQueue(tds[col + 7]);

        arr.push({
          id,
          name: e.querySelector("span.quickedit-label")?.innerText?.replaceAll("\n", "").trim() || "",
          incoming,
          coord,
          bonus,
          x,
          y,
          points,
          wood,
          stone,
          iron,
          storage,
          trader,
          traderAll,
          pop,
          pop_max,
          build,
          smith,
          train,
        });

        return arr;
      }, []);
  };

  const data = TableProduction(document);
  window.__tableProductionData__ = data;
  console.log("__tableProductionData__", data);
  console.table(data.map(v => ({
    id: v.id,
    name: v.name,
    coord: v.coord,
    wood: v.wood,
    stone: v.stone,
    iron: v.iron,
    storage: v.storage,
    trader: v.trader,
    attack: v.incoming.attack,
    support: v.incoming.support,
  })));
  return data;
})();
