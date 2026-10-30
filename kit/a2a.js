// A2A objects (Task, Message, TaskStatusUpdateEvent, AgentCard) used as the envelope format.
// The relay does not expose A2A endpoints: only the JSON shapes are shared. A `donnee` envelope
// carries a batch of the CRM profile instead (crm.js).

import { verifierLot } from './crm.js';

/** @typedef {'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'rejected'} EtatMission */

/** @type {readonly EtatMission[]} */
export const ETATS = ['submitted', 'working', 'input-required', 'completed', 'failed', 'canceled', 'rejected'];
/** @type {readonly EtatMission[]} */
export const ETATS_FINAUX = ['completed', 'failed', 'canceled', 'rejected'];

export const TYPES_MESSAGE = /** @type {const} */ (['question', 'reponse', 'info']);

/** @typedef {(typeof TYPES_MESSAGE)[number]} TypeMessage */

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

export class ErreurFormat extends Error {
  /** @param {string[]} problemes */
  constructor(problemes) {
    super(`format invalide : ${problemes.join(' ; ')}`);
    this.name = 'ErreurFormat';
    this.problemes = problemes;
  }
}

const maintenant = () => new Date().toISOString();
const nouvelId = () => crypto.randomUUID();

/** @param {unknown} v @returns {v is Record<string, any>} */
const estObjet = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @param {string} texte
 * @param {{ role?: 'user' | 'agent', taskId?: string, contextId?: string, data?: Record<string, unknown> }} [options]
 * @returns {Message}
 */
function message(texte, { role = 'agent', taskId, contextId, data } = {}) {
  /** @type {Part[]} */
  const parts = [];
  if (texte) parts.push({ kind: 'text', text: texte });
  if (data) parts.push({ kind: 'data', data });
  return {
    kind: 'message',
    messageId: nouvelId(),
    role,
    parts,
    ...(taskId ? { taskId } : {}),
    ...(contextId ? { contextId } : {}),
  };
}

/**
 * A mission entrusted to the partner's agent (A2A Task, state `submitted`).
 * @param {{ consigne: string, contexte?: Record<string, unknown>, titre?: string, id?: string, contextId?: string }} options
 * @returns {Mission}
 */
export function mission({ consigne, contexte, titre, id = nouvelId(), contextId = nouvelId() }) {
  const m = /** @type {Mission} */ ({
    kind: 'task',
    id,
    contextId,
    status: { state: 'submitted', timestamp: maintenant() },
    history: [message(consigne, { role: 'user', taskId: id, contextId, data: contexte })],
    ...(titre ? { metadata: { titre } } : {}),
  });
  valider('mission', m);
  return m;
}

/**
 * A state change of a mission (A2A TaskStatusUpdateEvent), sent back to whoever entrusted it.
 * @param {{ mission: string | { id: string, contextId?: string }, etat: EtatMission, message?: string, resultat?: string | Record<string, unknown> }} options
 * @returns {Etat}
 */
export function etat({ mission: m, etat: state, message: texte, resultat }) {
  const taskId = typeof m === 'string' ? m : m.id;
  const contextId = typeof m === 'string' ? undefined : m.contextId;
  const data = resultat === undefined ? undefined : typeof resultat === 'string' ? { resume: resultat } : resultat;
  const e = /** @type {Etat} */ ({
    kind: 'status-update',
    taskId,
    ...(contextId ? { contextId } : {}),
    status: {
      state,
      timestamp: maintenant(),
      ...(texte || data ? { message: message(texte ?? '', { taskId, contextId, data }) } : {}),
    },
    final: ETATS_FINAUX.includes(state),
  });
  valider('etat', e);
  return e;
}

/**
 * A note about a mission (e.g. "postponed").
 * @param {{ texte: string, mission?: string | { id: string, contextId?: string } }} options
 * @returns {Message}
 */
export function note({ texte, mission: m }) {
  const taskId = m === undefined ? undefined : typeof m === 'string' ? m : m.id;
  const contextId = m === undefined || typeof m === 'string' ? undefined : m.contextId;
  const n = message(texte, { taskId, contextId });
  valider('message', n);
  return n;
}

/**
 * A free message to the partner, tied to no mission: Markdown text, links included (a file never
 * travels). It cannot be changed once sent: answer with another one.
 * @param {{ type: TypeMessage, sujet: string, texte: string, en_reponse_a?: string }} options
 *   `en_reponse_a`: `messageId` of the message answered.
 * @returns {Message}
 */
export function messageLibre({ type, sujet, texte, en_reponse_a }) {
  const m = message(texte, { role: 'user' });
  m.metadata = { type, sujet: typeof sujet === 'string' ? sujet.trim() : sujet, ...(en_reponse_a ? { en_reponse_a } : {}) };
  valider('message', m);
  return m;
}

/**
 * @param {{ nom: string, description: string, url?: string, organisation?: string, competences?: { id: string, nom: string, description?: string }[] }} options
 * @returns {CarteAgent}
 */
export function carte({ nom, description, url = '', organisation, competences = [] }) {
  return {
    name: nom,
    description,
    url,
    version: '1.0.0',
    protocolVersion: '0.3.0',
    capabilities: {},
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: competences.map((c) => ({ id: c.id, name: c.nom, description: c.description ?? c.nom, tags: [] })),
    ...(organisation ? { provider: { organization: organisation, url } } : {}),
  };
}

// ---------------------------------------------------------------- validation

/** @param {unknown} m @param {string} ou @param {string[]} p */
function verifierMessage(m, ou, p) {
  if (!estObjet(m)) return void p.push(`${ou} : objet attendu`);
  if (m.kind !== 'message') p.push(`${ou}.kind : "message" attendu`);
  if (typeof m.messageId !== 'string' || !m.messageId) p.push(`${ou}.messageId manquant`);
  if (m.role !== 'user' && m.role !== 'agent') p.push(`${ou}.role : "user" ou "agent" attendu`);
  if (!Array.isArray(m.parts)) return void p.push(`${ou}.parts : liste attendue`);
  m.parts.forEach((/** @type {unknown} */ part, /** @type {number} */ i) => {
    const o = `${ou}.parts[${i}]`;
    if (!estObjet(part)) return void p.push(`${o} : objet attendu`);
    if (part.kind === 'text' && typeof part.text !== 'string') p.push(`${o}.text manquant`);
    else if (part.kind === 'data' && !estObjet(part.data)) p.push(`${o}.data : objet attendu`);
    else if (part.kind === 'file' && !(estObjet(part.file) && typeof part.file.uri === 'string')) p.push(`${o}.file.uri manquant`);
    else if (!['text', 'data', 'file'].includes(part.kind)) p.push(`${o}.kind inconnu`);
  });
}

/** @param {unknown} s @param {string} ou @param {string[]} p */
function verifierStatut(s, ou, p) {
  if (!estObjet(s)) return void p.push(`${ou} : objet attendu`);
  if (!ETATS.includes(s.state)) p.push(`${ou}.state : un de ${ETATS.join(', ')}`);
  if (typeof s.timestamp !== 'string') p.push(`${ou}.timestamp manquant`);
  if (s.message !== undefined) verifierMessage(s.message, `${ou}.message`, p);
}

/** @type {Record<string, (corps: Record<string, any>, p: string[]) => void>} */
const VERIFS = {
  mission(c, p) {
    if (c.kind !== 'task') p.push('kind : "task" attendu');
    if (typeof c.id !== 'string' || !c.id) p.push('id manquant');
    if (typeof c.contextId !== 'string' || !c.contextId) p.push('contextId manquant');
    verifierStatut(c.status, 'status', p);
    if (!Array.isArray(c.history) || c.history.length === 0) return void p.push('history : au moins un message');
    c.history.forEach((/** @type {unknown} */ m, /** @type {number} */ i) => verifierMessage(m, `history[${i}]`, p));
    if (!c.history[0]?.parts?.some((/** @type {Part} */ x) => x.kind === 'text' && x.text.trim())) {
      p.push('history[0] : la consigne (texte) manque');
    }
  },
  etat(c, p) {
    if (c.kind !== 'status-update') p.push('kind : "status-update" attendu');
    if (c.taskId !== null && (typeof c.taskId !== 'string' || !c.taskId)) p.push('taskId manquant');
    verifierStatut(c.status, 'status', p);
    if (typeof c.final !== 'boolean') p.push('final : booléen attendu');
  },
  message(c, p) {
    verifierMessage(c, 'message', p);
    // A message with no mission and a metadata type is a free message: its fields are fixed.
    if (c.taskId || !estObjet(c.metadata) || c.metadata.type === undefined) return;
    const { type, sujet, en_reponse_a } = c.metadata;
    if (!(/** @type {readonly unknown[]} */ (TYPES_MESSAGE)).includes(type)) p.push(`metadata.type : un de ${TYPES_MESSAGE.join(', ')}`);
    if (typeof sujet !== 'string' || !sujet.trim() || /[\r\n]/.test(sujet)) p.push('metadata.sujet : une ligne de texte attendue');
    if (en_reponse_a !== undefined && (typeof en_reponse_a !== 'string' || !en_reponse_a)) p.push('metadata.en_reponse_a : id de message attendu');
    if (!(Array.isArray(c.parts) && c.parts.some((/** @type {any} */ x) => x?.kind === 'text' && typeof x.text === 'string' && x.text.trim()))) {
      p.push('message : le texte manque');
    }
  },
  donnee(c, p) {
    p.push(...verifierLot(c));
  },
  connexion(c, p) {
    if (!['acceptee', 'coupee'].includes(c.evenement)) p.push('evenement : "acceptee" ou "coupee" attendu');
    if (!estObjet(c.connexion) || typeof c.connexion.id !== 'string') p.push('connexion.id manquant');
  },
};

/**
 * Lists format problems of an envelope body; empty when valid.
 * @param {string} type
 * @param {unknown} corps
 * @returns {string[]}
 */
export function verifier(type, corps) {
  const verif = VERIFS[type];
  if (!verif) return [`type inconnu : ${type}`];
  if (!estObjet(corps)) return ['corps : objet attendu'];
  /** @type {string[]} */
  const problemes = [];
  verif(corps, problemes);
  return problemes;
}

/**
 * @param {string} type
 * @param {unknown} corps
 */
export function valider(type, corps) {
  const problemes = verifier(type, corps);
  if (problemes.length) throw new ErreurFormat(problemes);
}

// ---------------------------------------------------------------- reading

/** @param {Message | undefined} m */
const textes = (m) => (m?.parts ?? []).flatMap((x) => (x.kind === 'text' ? [x.text] : []));
/** @param {Message | undefined} m */
const premiereDonnee = (m) => m?.parts?.find((x) => x.kind === 'data')?.data;

/**
 * @param {Mission} m
 * @returns {{ id: string, contextId: string, consigne: string, contexte: Record<string, unknown> | null, titre: string }}
 */
export function lireMission(m) {
  const premier = m.history[0];
  const consigne = textes(premier).join('\n\n');
  const titre = typeof m.metadata?.titre === 'string' && m.metadata.titre.trim()
    ? m.metadata.titre.trim()
    : consigne.split('\n')[0].slice(0, 80);
  return { id: m.id, contextId: m.contextId, consigne, contexte: premiereDonnee(premier) ?? null, titre };
}

/**
 * @param {Etat} e
 * @returns {{ mission: string | null, etat: EtatMission, message: string, resultat: Record<string, unknown> | null, final: boolean, quand: string }}
 */
export function lireEtat(e) {
  return {
    mission: e.taskId,
    etat: e.status.state,
    message: textes(e.status.message).join('\n\n'),
    resultat: premiereDonnee(e.status.message) ?? null,
    final: e.final,
    quand: e.status.timestamp,
  };
}

/**
 * @param {Message} m
 * @returns {{ id: string, type: TypeMessage, sujet: string, texte: string, en_reponse_a: string | null } | null}
 *   null for a note about a mission (read it with `lireNote`).
 */
export function lireMessageLibre(m) {
  const meta = /** @type {Record<string, any> | undefined} */ (m.metadata);
  if (m.taskId || !estObjet(meta) || meta.type === undefined) return null;
  return { id: m.messageId, type: meta.type, sujet: meta.sujet, texte: textes(m).join('\n\n'), en_reponse_a: meta.en_reponse_a ?? null };
}

/**
 * @param {Message} m
 * @returns {{ mission: string | null, texte: string }}
 */
export function lireNote(m) {
  return { mission: m.taskId ?? null, texte: textes(m).join('\n\n') };
}
