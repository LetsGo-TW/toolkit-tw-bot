const fs = require("fs");
const { getDataFilePath, readJsonFile } = require("./_common");

const dataFile = getDataFilePath("data.json");
const outputFile = getDataFilePath("expired.json");
const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 90;

function main() {
  const data = readJsonFile(dataFile);
  console.log("📦 Total de registros no data.json:", data.length);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoff = nowSeconds - THREE_MONTHS_IN_SECONDS;

  console.log("⏱  Agora (segundos):", nowSeconds);
  console.log("⏱  Corte (vencido há mais de 3 meses, due <):", cutoff);

  const expired = data.filter((item) => {
    if (!item || typeof item.due !== "number") return false;
    return item.due < cutoff;
  });

  console.log("🗑  Total de registros vencidos há mais de 3 meses:", expired.length);

  if (expired.length > 0) {
    console.log("🔎 Alguns exemplos de vencidos:");
    console.log(expired.slice(0, 5));

    fs.writeFileSync(outputFile, JSON.stringify(expired, null, 2), "utf8");
    console.log("💾 Vencidos salvos em:", outputFile);
  } else {
    console.log("✅ Nenhum registro vencido há mais de 3 meses encontrado no data.json.");
  }
}

main();
