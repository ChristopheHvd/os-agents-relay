import { verifier } from './a2a.js';

/**
 * @typedef {object} BilanReleve
 * @property {number} traitees
 * @property {number} doublons Already seen: acknowledged without processing.
 * @property {number} invalides Malformed body: acknowledged without processing.
 * @property {{ id: string, erreur: unknown }[]} erreurs Processing failed: left at the relay for the next round.
 */

/**
 * Picks up the mailbox. Each envelope is processed once (`stockage.dejaVu`), and acknowledged
 * (hence deleted by the relay) only after `traiter` succeeded and the id was recorded.
 *
 * @param {object} options
 * @param {import('./client.js').Client} options.client
 * @param {import('./stockage-memoire.js').Stockage} options.stockage
 * @param {(enveloppe: import('./client.js').Enveloppe) => Promise<void> | void} options.traiter
 * @param {(enveloppe: import('./client.js').Enveloppe, problemes: string[]) => Promise<void> | void} [options.invalide]
 * @param {number} [options.pagesMax]
 * @returns {Promise<BilanReleve>}
 */
export async function relever({ client, stockage, traiter, invalide, pagesMax = 20 }) {
  /** @type {BilanReleve} */
  const bilan = { traitees: 0, doublons: 0, invalides: 0, erreurs: [] };
  /** @type {string | null} */
  let curseur = null;
  for (let page = 0; page < pagesMax; page++) {
    const { enveloppes, curseur: suivant, suite } = await client.boite(curseur);
    /** @type {string[]} */
    const aAcquitter = [];
    for (const enveloppe of enveloppes) {
      if (await stockage.dejaVu(enveloppe.id)) {
        bilan.doublons++;
        aAcquitter.push(enveloppe.id);
        continue;
      }
      const problemes = verifier(enveloppe.type, enveloppe.corps);
      try {
        if (problemes.length) {
          await invalide?.(enveloppe, problemes);
          bilan.invalides++;
        } else {
          await traiter(enveloppe);
          bilan.traitees++;
        }
        await stockage.marquerVu(enveloppe.id);
        aAcquitter.push(enveloppe.id);
      } catch (erreur) {
        bilan.erreurs.push({ id: enveloppe.id, erreur });
      }
    }
    if (aAcquitter.length) await client.acquitter(aAcquitter);
    if (!suite) break;
    curseur = suivant;
  }
  return bilan;
}
