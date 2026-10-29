/**
 * @typedef {object} OptionsClient
 * @property {string} url Relay base URL, e.g. https://relais.alpes-ia.fr
 * @property {string} [noeud] Node id, once registered.
 * @property {string} [secret] Node secret, once registered.
 * @property {typeof fetch} [fetch] Injected fetch (tests).
 */
export type OptionsClient = {
    /**
     * Relay base URL, e.g. https://relais.alpes-ia.fr
     */
    url: string;
    /**
     * Node id, once registered.
     */
    noeud?: string;
    /**
     * Node secret, once registered.
     */
    secret?: string;
    /**
     * Injected fetch (tests).
     */
    fetch?: typeof fetch;
};
export type Partenaire = {
    id: string;
    nom: string;
    carte: Record<string, unknown> | null;
    vu_le: string | null;
};
export type Connexion = {
    id: string;
    cree_le: string;
    partenaire: Partenaire;
};
export type TypeEnveloppe = 'mission' | 'etat' | 'message' | 'donnee' | 'connexion';
export type Enveloppe = {
    id: string;
    connexion: string;
    /**
     * Sender node id, or `relais` for notices from the relay itself.
     */
    de: string;
    a: string;
    type: TypeEnveloppe;
    corps: Record<string, any>;
    cree_le: string;
};
export type Inscription = {
    id: string;
    /**
     * Shown once: store it.
     */
    secret: string;
    /**
     * Present when registering with an invitation.
     */
    connexion?: Connexion;
};
export type Invitation = {
    code: string;
    lien: string;
    expire_le: string;
};
export type Boite = {
    enveloppes: Enveloppe[];
    curseur: string | null;
    suite: boolean;
};
/**
 * @typedef {object} Partenaire
 * @property {string} id
 * @property {string} nom
 * @property {Record<string, unknown> | null} carte
 * @property {string | null} vu_le
 */
/**
 * @typedef {object} Connexion
 * @property {string} id
 * @property {string} cree_le
 * @property {Partenaire} partenaire
 */
/** @typedef {'mission' | 'etat' | 'message' | 'donnee' | 'connexion'} TypeEnveloppe */
/**
 * @typedef {object} Enveloppe
 * @property {string} id
 * @property {string} connexion
 * @property {string} de Sender node id, or `relais` for notices from the relay itself.
 * @property {string} a
 * @property {TypeEnveloppe} type
 * @property {Record<string, any>} corps
 * @property {string} cree_le
 */
/**
 * @typedef {object} Inscription
 * @property {string} id
 * @property {string} secret Shown once: store it.
 * @property {Connexion} [connexion] Present when registering with an invitation.
 */
/**
 * @typedef {object} Invitation
 * @property {string} code
 * @property {string} lien
 * @property {string} expire_le
 */
/**
 * @typedef {object} Boite
 * @property {Enveloppe[]} enveloppes
 * @property {string | null} curseur
 * @property {boolean} suite
 */
export declare class ErreurRelais extends Error {
    status: number;
    corps: unknown;
    /**
     * @param {number} status HTTP status, 0 when the relay could not be reached.
     * @param {string} message
     * @param {unknown} [corps]
     */
    constructor(status: number, message: string, corps?: unknown);
    /** Worth retrying later (network, timeout, rate limit, server error). */
    get passagere(): boolean;
}
/**
 * Accepts an invitation link (https://relais.example/invitations/CODE) or a bare code.
 * @param {string} lienOuCode
 * @returns {{ code: string, relais: string | null }}
 */
export declare function lireInvitation(lienOuCode: string): {
    code: string;
    relais: string | null;
};
/** @param {string} texte */
export declare const estLienInvitation: (texte: string) => boolean;
/**
 * Client for the relay HTTP API. Holds the node identity once registered.
 * @param {OptionsClient} options
 */
export declare function creerClient({ url, noeud, secret, fetch: fetchInjecte }: OptionsClient): {
    url: string;
    readonly noeud: string | undefined;
    readonly secret: string | undefined;
    readonly inscrit: boolean;
    /** @returns {Promise<{ ok: boolean }>} */
    sante: () => Promise<{
        ok: boolean;
    }>;
    /**
     * Registers this node, with the relay registration key or an invitation (link or code).
     * @param {{ nom: string, carte?: Record<string, unknown>, cle_inscription?: string, invitation?: string }} options
     * @returns {Promise<Inscription>}
     */
    inscrire({ nom, carte, cle_inscription, invitation }: {
        nom: string;
        carte?: Record<string, unknown>;
        cle_inscription?: string;
        invitation?: string;
    }): Promise<Inscription>;
    /** @returns {Promise<{ id: string, nom: string, carte: Record<string, unknown> | null, cree_le: string }>} */
    moi: () => Promise<{
        id: string;
        nom: string;
        carte: Record<string, unknown> | null;
        cree_le: string;
    }>;
    /** @param {Record<string, unknown>} carte */
    publierCarte: (carte: Record<string, unknown>) => Promise<any>;
    /** Unregisters the node: its connections are cut and partners are notified. */
    desinscrire: () => Promise<any>;
    /**
     * @param {{ email?: string }} [options]
     * @returns {Promise<Invitation>}
     */
    inviter: ({ email }?: {
        email?: string;
    }) => Promise<Invitation>;
    /**
     * @param {string} lienOuCode
     * @returns {Promise<{ connexion: Connexion }>}
     */
    accepter: (lienOuCode: string) => Promise<{
        connexion: Connexion;
    }>;
    /**
     * Joins through an invitation: accepts it when registered, otherwise registers with it.
     * @param {{ lien: string, nom: string, carte?: Record<string, unknown> }} options
     * @returns {Promise<{ connexion: Connexion, inscription?: Inscription }>}
     */
    rejoindre({ lien, nom, carte }: {
        lien: string;
        nom: string;
        carte?: Record<string, unknown>;
    }): Promise<{
        connexion: Connexion;
        inscription?: Inscription;
    }>;
    /** @returns {Promise<Connexion[]>} */
    connexions: () => Promise<Connexion[]>;
    /** @param {string} connexion */
    couper: (connexion: string) => Promise<any>;
    /**
     * Posts one envelope. Passing the same `id` again is a safe retry.
     * @param {{ connexion: string, type: TypeEnveloppe, corps: Record<string, unknown>, id?: string }} enveloppe
     * @returns {Promise<{ id: string, cree_le: string }>}
     */
    envoyer: ({ connexion, type, corps, id: idEnveloppe }: {
        connexion: string;
        type: TypeEnveloppe;
        corps: Record<string, unknown>;
        id?: string;
    }) => Promise<{
        id: string;
        cree_le: string;
    }>;
    /**
     * @param {string | null} [apres] Cursor from the previous page.
     * @returns {Promise<Boite>}
     */
    boite: (apres?: string | null) => Promise<Boite>;
    /**
     * @param {string[]} ids
     * @returns {Promise<{ acquittees: number }>}
     */
    acquitter: (ids: string[]) => Promise<{
        acquittees: number;
    }>;
};
export type Client = ReturnType<typeof creerClient>;
/** @typedef {ReturnType<typeof creerClient>} Client */
