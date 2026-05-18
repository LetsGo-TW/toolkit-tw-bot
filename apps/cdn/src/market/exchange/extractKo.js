/**
 * Extrai o K (Continente) de uma coordenada.
 * Aceita string "555|555" ou objeto {x: 555, y: 555}.
 *
 * @param {string|Object} coord - A coordenada para processar.
 * @returns {string} O K correspondente (ex: "55", "5", "50").
 */
function extractKo(coord) {
    let x, y;

    if (typeof coord === 'string') {
        // Divide a string pelo pipe e converte para número
        const parts = coord.split('|');
        x = parseInt(parts[0], 10);
        y = parseInt(parts[1], 10);
    } else if (typeof coord === 'object' && coord !== null) {
        x = parseInt(coord.x, 10);
        y = parseInt(coord.y, 10);
    }

    // Se a conversão falhar, retorna null
    if (isNaN(x) || isNaN(y)) return null;

    // O K é formado pelo primeiro dígito da centena (floor de coord/100)
    // Ex: y: 555 -> 5 | x: 555 -> 5 => K55
    // Ex: y: 55  -> 0 | x: 555 -> 5 => K05 (ou K5)
    // Ex: y: 555 -> 5 | x: 55  -> 0 => K50
    const kY = Math.floor(y / 100);
    const kX = Math.floor(x / 100);

    // Retorna como string. Usamos Number() para remover zeros à esquerda se preferir "5" em vez de "05"
    return String(kY * 10 + kX);
}

export { extractKo }
