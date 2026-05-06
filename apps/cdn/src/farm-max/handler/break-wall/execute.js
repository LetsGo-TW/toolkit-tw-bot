// src/content-scripts/dinamic/send-attack-next-attacable-villages/handler.js
import { fetchCommand, fetchConfirmCommand, fetchPopupCommand } from "./requests.js";
import { sleep } from "../../utils/sleep.js";
import { ProtectingBot } from "@toolkit-tw-bot/document";

async function execute(villageId, template, targetId, targetX, targetY, api, d = document, w = window) {
  api.footer.set(`Abrindo a praça.`, 'ok');
  await sleep()

  const payloadCommand = await fetchCommand(villageId, targetId, targetX, targetY, template);

  api.footer.set(`Engatilhando comando.`, 'ok');
  await sleep()
  console.debug({payloadCommand});

  if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
    api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
    await sleep(1000, 1111);
    throw ProtectingBot.error();
  }

  const { payload: payloadConfirm, durationSecond } = await fetchConfirmCommand(villageId, payloadCommand);

  api.footer.set(`Enviando comando.`, 'ok');
  await sleep()
  console.debug({payloadConfirm});

  if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
    api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
    await sleep(1000, 1111);
    throw ProtectingBot.error();
  }

  const { time_generated, message, target_village, source_village } = await fetchPopupCommand(villageId, payloadConfirm);

  const arrival = time_generated + (durationSecond * 1000)

  const { id: target, x, y } = target_village

  console.debug({
    target, x, y, arrival, arrivalDateTime: new Date(arrival).toLocaleString(), message, source_village
  })

  return { target, x, y, arrival, duration: durationSecond, message }
}

export { execute }
