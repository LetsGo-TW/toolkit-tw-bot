const {
  getDataFilePath,
  requireOptionArg,
  readJsonFile,
} = require("./_common");

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

function main() {
  const idArg = requireOptionArg("id");
  console.log("🔎 Procurando _id =", idArg);

  const data = readJsonFile(dataFile);
  console.log("📦 Total de registros no data.json:", data.length);

  const doc = data.find((item) => item._id === idArg);

  if (!doc) {
    console.log("⚠️ Nenhum documento encontrado com esse _id no data.json.");
    process.exit(0);
  }

  console.log("✅ Documento encontrado:");
  console.dir(
    {
      _id: doc._id,
      __v: doc.__v ?? null,
      createdAt: doc.createdAt || null,
      createdAt_formatted: formatISO(doc.createdAt),
      due: doc.due,
      due_formatted: formatDue(doc.due),
      player_id: doc.player_id,
      updatedAt: doc.updatedAt || null,
      updatedAt_formatted: formatISO(doc.updatedAt),
      world: doc.world,
    },
    { depth: null },
  );
}

main();
