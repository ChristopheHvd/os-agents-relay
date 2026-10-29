/**
 * Storage interface each OS provides to the kit.
 * @typedef {object} Stockage
 * @property {(id: string) => Promise<boolean>} dejaVu
 * @property {(id: string) => Promise<void>} marquerVu
 * @property {(enveloppe: Sortie) => Promise<void>} ajouterSortie
 * @property {() => Promise<Sortie[]>} sorties
 * @property {(id: string) => Promise<void>} retirerSortie
 * @property {(id: string, prochainEssai: string) => Promise<void>} reporterSortie
 */

/**
 * An envelope waiting in the local outbox.
 * @typedef {object} Sortie
 * @property {string} id
 * @property {string} connexion
 * @property {import('./client.js').TypeEnveloppe} type
 * @property {Record<string, any>} corps
 * @property {string} cree_le
 * @property {string | null} [prochain_essai]
 * @property {number} [essais]
 */

/**
 * In-memory storage, for tests and examples.
 * @returns {Stockage & { vus: Set<string> }}
 */
export function stockageMemoire() {
  const vus = new Set();
  /** @type {Map<string, Sortie>} */
  const file = new Map();
  return {
    vus,
    async dejaVu(id) {
      return vus.has(id);
    },
    async marquerVu(id) {
      vus.add(id);
    },
    async ajouterSortie(enveloppe) {
      file.set(enveloppe.id, structuredClone(enveloppe));
    },
    async sorties() {
      return [...file.values()].map((s) => structuredClone(s));
    },
    async retirerSortie(id) {
      file.delete(id);
    },
    async reporterSortie(id, prochainEssai) {
      const s = file.get(id);
      if (s) {
        s.prochain_essai = prochainEssai;
        s.essais = (s.essais ?? 0) + 1;
      }
    },
  };
}
