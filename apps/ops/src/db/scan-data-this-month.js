const { getDataFilePath, readJsonFile } = require("./_common");

const dataFile = getDataFilePath("data.json");

function formatDate(date) {
  if (!date) return null;
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDue(dueSeconds) {
  if (!dueSeconds || typeof dueSeconds !== "number") return null;
  return formatDate(new Date(dueSeconds * 1000));
}

function formatISO(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date);
}

function isSameMonthYear(date, year, month) {
  if (!date) return false;
  return date.getFullYear() === year && date.getMonth() === month;
}

function main() {
  const data = readJsonFile(dataFile);

  console.log("📦 Total de registros no data.json:", data.length);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  console.log("⏱  Agora:", now.toISOString());
  console.log(
    "📅 Mês/ano atual:",
    (currentMonth + 1).toString().padStart(2, "0"),
    "/",
    currentYear,
  );

  const thisMonth = data.filter((doc) => {
    const created = doc.createdAt ? new Date(doc.createdAt) : null;
    const updated = doc.updatedAt ? new Date(doc.updatedAt) : null;

    return (
      (created && isSameMonthYear(created, currentYear, currentMonth)) ||
      (updated && isSameMonthYear(updated, currentYear, currentMonth))
    );
  });

  console.log(
    "✅ Registros com createdAt ou updatedAt neste mês:",
    thisMonth.length,
  );

  const formatted = thisMonth.map((doc) => ({
    _id: doc._id,
    createdAt: doc.createdAt,
    createdAt_formatted: formatISO(doc.createdAt),
    due: doc.due,
    due_formatted: formatDue(doc.due),
    player_id: doc.player_id,
    updatedAt: doc.updatedAt || null,
    updatedAt_formatted: formatISO(doc.updatedAt),
    world: doc.world,
  }));

  console.log("🔎 Registros deste mês (formatados):");
  console.dir(formatted, { depth: null });
}

main();
