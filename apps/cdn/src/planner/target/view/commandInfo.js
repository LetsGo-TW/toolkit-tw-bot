import { getInfoCommand } from '../../../requests/getInfoCommand'
import { commandCache, inFlight, setCache } from '../../view'
import { resolveCommandCatapultTargetLabel } from './commandInfoCatapult'
import { maxBuildings } from '../../../stable-compat/max-buildings'

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const insertHead = (units) => {
  return `
    <tr>
      ${Object.entries(units).reduce((textHtml ,[_unit, { count, image_src }]) => {
        if (Number(count) > 0) {
          textHtml += `
            <th width="50">
              <img
                src="${image_src}"
              >
            </th>
          `
        }
        return textHtml
      }, '')}
    </tr>
  `
}
const insertBody = (units) => {
  return `
    <tr>
      ${Object.entries(units).reduce((textHtml ,[unit, { count }]) => {
        if (Number(count) > 0) {
          textHtml += `
            <td class="unit-item unit-item-${unit} go-black">${count}</td>
          `
        }
        return textHtml
      }, '')}
    </tr>
  `
}
const insertResources = (booty) => {
  if (!booty) return ''
  return `
    <p>
      ${Object.entries(booty).map(([resource, value]) => {
        if (!resource) return ''
        return `
          <span>
            <span class="icon header ${resource}"> </span>
            ${value}
          </span>
        `
      }).join('\n ')}
    </p>
  `
}
export async function renderCommandInfo(el, { signal } = {}) {
  const commandId = el.getAttribute("data-command-id");
  const commandTitle = el.getAttribute("data-icon-hint");

  if (!commandId) return "";

  // 1) cache pronto
  const cached = commandCache.get(commandId);
  if (cached) return cached;

  // 2) request já rolando
  if (inFlight.has(commandId)) {
    return await inFlight.get(commandId);
  }

  // 3) cria promise e registra em inFlight
  const promise = (async () => {
    const commandInfo = await getInfoCommand(commandId, { signal });
    const { units, booty } = commandInfo || {};
    if (!units) return "";
    const catapultTargetLabel = resolveCommandCatapultTargetLabel(commandInfo, {
      buildingLabels: maxBuildings
    })

    const html = `
      <div>
        ${commandTitle ? `<h4>${escapeHtml(commandTitle)}</h4>` : ""}
        <table class="vis" width="100%">
          <tbody>
            ${insertHead(units)}
            ${insertBody(units)}
          </tbody>
        </table>
        ${catapultTargetLabel ? `<p><strong>Alvo da catapulta:</strong> ${escapeHtml(catapultTargetLabel)}</p>` : ''}
        ${insertResources(booty)}
      </div>
    `;

    // guarda no cache
    setCache(commandCache, commandId, html);
    return html;
  })();

  setCache(inFlight, commandId, promise)

  try {
    return await promise;
  } catch (err) {
    // se abortou, não cacheia
    if (err?.name === "AbortError") return "";
    throw err;
  } finally {
    inFlight.delete(commandId);
  }
}
