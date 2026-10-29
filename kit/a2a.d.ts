export type EtatMission = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'rejected';
/** @typedef {'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'rejected'} EtatMission */
/** @type {readonly EtatMission[]} */
export declare const ETATS: readonly EtatMission[];
/** @type {readonly EtatMission[]} */
export declare const ETATS_FINAUX: readonly EtatMission[];
export declare const OBJETS_DONNEE: readonly ['prospect', 'rendez_vous', 'affaire', 'compte_rendu'];
export declare const EVENEMENTS_DONNEE: readonly ['cree', 'modifie', 'gagne', 'perdu'];
export type ObjetDonnee = (typeof OBJETS_DONNEE)[number];
export type EvenementDonnee = (typeof EVENEMENTS_DONNEE)[number];
export type Part = {
    kind: 'text';
    text: string;
} | {
    kind: 'data';
    data: Record<string, unknown>;
} | {
    kind: 'file';
    file: {
        uri: string;
        name?: string;
        mimeType?: string;
    };
};
export type Message = {
    kind: 'message';
    messageId: string;
    role: 'user' | 'agent';
    parts: Part[];
    taskId?: string;
    contextId?: string;
    metadata?: Record<string, unknown>;
};
export type StatutMission = {
    state: EtatMission;
    message?: Message;
    timestamp: string;
};
export type Mission = {
    kind: 'task';
    id: string;
    contextId: string;
    status: StatutMission;
    history: Message[];
    metadata?: Record<string, unknown>;
};
export type Etat = {
    kind: 'status-update';
    taskId: string | null;
    contextId?: string;
    status: StatutMission;
    final: boolean;
    metadata?: Record<string, unknown>;
};
export type CarteAgent = {
    name: string;
    description: string;
    url: string;
    version: string;
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    defaultInputModes: string[];
    defaultOutputModes: string[];
    skills: {
        id: string;
        name: string;
        description: string;
        tags: string[];
    }[];
    provider?: {
        organization: string;
        url: string;
    };
};
/** @typedef {(typeof OBJETS_DONNEE)[number]} ObjetDonnee */
/** @typedef {(typeof EVENEMENTS_DONNEE)[number]} EvenementDonnee */
/**
 * @typedef {{ kind: 'text', text: string } | { kind: 'data', data: Record<string, unknown> } | { kind: 'file', file: { uri: string, name?: string, mimeType?: string } }} Part
 */
/**
 * @typedef {object} Message
 * @property {'message'} kind
 * @property {string} messageId
 * @property {'user' | 'agent'} role
 * @property {Part[]} parts
 * @property {string} [taskId]
 * @property {string} [contextId]
 * @property {Record<string, unknown>} [metadata]
 */
/**
 * @typedef {object} StatutMission
 * @property {EtatMission} state
 * @property {Message} [message]
 * @property {string} timestamp
 */
/**
 * @typedef {object} Mission A2A Task.
 * @property {'task'} kind
 * @property {string} id
 * @property {string} contextId
 * @property {StatutMission} status
 * @property {Message[]} history
 * @property {Record<string, unknown>} [metadata]
 */
/**
 * @typedef {object} Etat A2A TaskStatusUpdateEvent.
 * @property {'status-update'} kind
 * @property {string | null} taskId
 * @property {string} [contextId]
 * @property {StatutMission} status
 * @property {boolean} final
 * @property {Record<string, unknown>} [metadata]
 */
/**
 * @typedef {object} CarteAgent A2A AgentCard (subset).
 * @property {string} name
 * @property {string} description
 * @property {string} url
 * @property {string} version
 * @property {string} protocolVersion
 * @property {Record<string, unknown>} capabilities
 * @property {string[]} defaultInputModes
 * @property {string[]} defaultOutputModes
 * @property {{ id: string, name: string, description: string, tags: string[] }[]} skills
 * @property {{ organization: string, url: string }} [provider]
 */
export declare class ErreurFormat extends Error {
    problemes: string[];
    /** @param {string[]} problemes */
    constructor(problemes: string[]);
}
/**
 * A mission entrusted to the partner's agent (A2A Task, state `submitted`).
 * @param {{ consigne: string, contexte?: Record<string, unknown>, titre?: string, id?: string, contextId?: string }} options
 * @returns {Mission}
 */
export declare function mission({ consigne, contexte, titre, id, contextId }: {
    consigne: string;
    contexte?: Record<string, unknown>;
    titre?: string;
    id?: string;
    contextId?: string;
}): Mission;
/**
 * A state change of a mission (A2A TaskStatusUpdateEvent), sent back to whoever entrusted it.
 * @param {{ mission: string | { id: string, contextId?: string }, etat: EtatMission, message?: string, resultat?: string | Record<string, unknown> }} options
 * @returns {Etat}
 */
export declare function etat({ mission: m, etat: state, message: texte, resultat }: {
    mission: string | {
        id: string;
        contextId?: string;
    };
    etat: EtatMission;
    message?: string;
    resultat?: string | Record<string, unknown>;
}): Etat;
/**
 * A free message, optionally about a mission (e.g. "postponed").
 * @param {{ texte: string, mission?: string | { id: string, contextId?: string } }} options
 * @returns {Message}
 */
export declare function note({ texte, mission: m }: {
    texte: string;
    mission?: string | {
        id: string;
        contextId?: string;
    };
}): Message;
/**
 * A fact of the sales follow-up pushed to the partner (A2A Message with one data part).
 * @param {{ objet: ObjetDonnee, evenement: EvenementDonnee, ref: string, champs?: Record<string, string | number | boolean | null> }} options
 * @returns {Message}
 */
export declare function donnee({ objet, evenement, ref, champs }: {
    objet: ObjetDonnee;
    evenement: EvenementDonnee;
    ref: string;
    champs?: Record<string, string | number | boolean | null>;
}): Message;
/**
 * @param {{ nom: string, description: string, url?: string, organisation?: string, competences?: { id: string, nom: string, description?: string }[] }} options
 * @returns {CarteAgent}
 */
export declare function carte({ nom, description, url, organisation, competences }: {
    nom: string;
    description: string;
    url?: string;
    organisation?: string;
    competences?: {
        id: string;
        nom: string;
        description?: string;
    }[];
}): CarteAgent;
/**
 * Lists format problems of an envelope body; empty when valid.
 * @param {string} type
 * @param {unknown} corps
 * @returns {string[]}
 */
export declare function verifier(type: string, corps: unknown): string[];
/**
 * @param {string} type
 * @param {unknown} corps
 */
export declare function valider(type: string, corps: unknown): void;
/**
 * @param {Mission} m
 * @returns {{ id: string, contextId: string, consigne: string, contexte: Record<string, unknown> | null, titre: string }}
 */
export declare function lireMission(m: Mission): {
    id: string;
    contextId: string;
    consigne: string;
    contexte: Record<string, unknown> | null;
    titre: string;
};
/**
 * @param {Etat} e
 * @returns {{ mission: string | null, etat: EtatMission, message: string, resultat: Record<string, unknown> | null, final: boolean, quand: string }}
 */
export declare function lireEtat(e: Etat): {
    mission: string | null;
    etat: EtatMission;
    message: string;
    resultat: Record<string, unknown> | null;
    final: boolean;
    quand: string;
};
/**
 * @param {Message} m
 * @returns {{ objet: ObjetDonnee, evenement: EvenementDonnee, ref: string, champs: Record<string, string | number | boolean | null> }}
 */
export declare function lireDonnee(m: Message): {
    objet: ObjetDonnee;
    evenement: EvenementDonnee;
    ref: string;
    champs: Record<string, string | number | boolean | null>;
};
/**
 * @param {Message} m
 * @returns {{ mission: string | null, texte: string }}
 */
export declare function lireNote(m: Message): {
    mission: string | null;
    texte: string;
};
