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
export type Stockage = {
    dejaVu: (id: string) => Promise<boolean>;
    marquerVu: (id: string) => Promise<void>;
    ajouterSortie: (enveloppe: Sortie) => Promise<void>;
    sorties: () => Promise<Sortie[]>;
    retirerSortie: (id: string) => Promise<void>;
    reporterSortie: (id: string, prochainEssai: string) => Promise<void>;
};
export type Sortie = {
    id: string;
    connexion: string;
    type: import('./client.js').TypeEnveloppe;
    corps: Record<string, any>;
    cree_le: string;
    prochain_essai?: string | null;
    essais?: number;
};
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
export declare function stockageMemoire(): Stockage & {
    vus: Set<string>;
};
