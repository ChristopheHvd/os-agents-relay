export type Niveau = 'montrer' | 'demander_avant' | 'faire_puis_valider' | 'faire_seul';
/** @typedef {'montrer' | 'demander_avant' | 'faire_puis_valider' | 'faire_seul'} Niveau */
/** @type {readonly Niveau[]} */
export declare const NIVEAUX: readonly Niveau[];
/** Most cautious level, used by default and for any unknown value. */
/** @type {Niveau} */
export declare const NIVEAU_PAR_DEFAUT: Niveau;
/** @type {Readonly<Record<Niveau, string>>} */
export declare const LIBELLES: Readonly<Record<Niveau, string>>;
/** SIMATIS OS autonomy marks. */
/** @type {Readonly<Record<Niveau, 'L0' | 'L1' | 'L2' | 'L3'>>} */
export declare const REPERES: Readonly<Record<Niveau, 'L0' | 'L1' | 'L2' | 'L3'>>;
export declare const GARDE_FOUS: readonly string[];
export type Etape = {
    action: 'montrer' | 'demander' | 'preparer' | 'faire';
    /**
     * Start the (restricted) execution right away.
     */
    executer: boolean;
    /**
     * Show a proposal to the human before anything else.
     */
    proposer: boolean;
    /**
     * The prepared result waits for the human before going back.
     */
    validerApres: boolean;
    /**
     * State to send back right away (`null`: stay `submitted`).
     */
    etat: 'working' | null;
};
/**
 * @param {unknown} niveau
 * @returns {Niveau}
 */
export declare function niveauValide(niveau: unknown): Niveau;
/**
 * First step for a received mission, given the connection's level.
 * @param {unknown} niveau
 * @returns {Etape}
 */
export declare function premiereEtape(niveau: unknown): Etape;
/**
 * @param {string} repere L0 to L3
 * @returns {Niveau}
 */
export declare function niveauDepuisRepere(repere: string): Niveau;
