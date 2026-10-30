import test from 'node:test';
import assert from 'node:assert/strict';
import { ErreurFormat, lireMessageLibre, messageLibre, verifier } from './a2a.js';
import { creerClient, ErreurRelais } from './client.js';
import {
  MODELE_CRM,
  OBJETS_CRM,
  TAILLE_LOT_MAX,
  changement,
  decouper,
  difference,
  fusionner,
  lireLot,
  lireReference,
  lot,
  reference,
  retenir,
} from './crm.js';
import { deposer, vider } from './envoi.js';
import { relaisSimule } from './relais-simule.js';
import { relever } from './releve.js';
import { stockageMemoire } from './stockage-memoire.js';

// Fictitious nodes, records and people only.
const A = 'noeud-a';
const B = 'noeud-b';
const T = (/** @type {string} */ heure) => `2026-11-04T${heure}:00.000Z`;
const octets = (/** @type {unknown} */ v) => new TextEncoder().encode(JSON.stringify(v)).length;

const PIPELINE = [
  { id: 'decouverte', libelle: 'Découverte', ordre: 1, clos: false, gagne: false, probabilite: 10 },
  { id: 'negociation', libelle: 'Négociation', ordre: 2, clos: false, gagne: false, probabilite: 60 },
  { id: 'gagne', libelle: 'Gagné', ordre: 3, clos: true, gagne: true, probabilite: 100 },
  { id: 'perdu', libelle: 'Perdu', ordre: 4, clos: true, gagne: false },
];

function exemples() {
  const ent = `${A}/ent-1`;
  const con = `${A}/con-1`;
  const aff = `${A}/aff-1`;
  return [
    changement({ objet: 'pipeline', ref: `${A}/pipeline`, modifie_le: T('08:00'), champs: { etapes: PIPELINE } }),
    changement({
      objet: 'entreprise',
      ref: ent,
      modifie_le: T('08:00'),
      champs: { nom: 'Entreprise fictive', secteur: 'Industrie', ville: 'Ville fictive', taille: 25, domaine: 'exemple.fr' },
    }),
    changement({
      objet: 'contact',
      ref: con,
      modifie_le: T('08:00'),
      champs: { nom: 'Camille Exemple', fonction: 'Directrice', email: 'camille@exemple.fr', emails: ['c.exemple@exemple.fr'], telephone: '00 00 00 00 00', role: 'decideur' },
      liens: { entreprises: [ent] },
    }),
    changement({
      objet: 'affaire',
      ref: aff,
      modifie_le: T('08:00'),
      champs: {
        titre: 'Accompagnement fictif',
        etape: 'decouverte',
        montant: 12000,
        echeance: '2026-12-15',
        clos: null,
        motif: null,
        proprietaire: 'Commercial fictif',
        origine: 'salon (fictif)',
        prochaine_etape: 'Envoyer la proposition',
        mode_facturation: 'recurrent',
        duree_engagement_mois: 12,
        tacite_reconduction: true,
        probabilite_manuelle: 40,
        derniere_activite: T('07:30'),
        etapes_dates: { decouverte: '2026-10-01T08:00:00.000Z' },
        qualification: { besoin: 3, decideur: 2, budget: 2, timing: 1, engagement: 2 },
        potentiel: 'fort',
        faisabilite: 'moyenne',
        x_alpes_projet: { code: 'P-1', etiquettes: ['essai'] },
      },
      liens: { contacts: [con], entreprises: [ent] },
    }),
    changement({
      objet: 'tache',
      ref: `${A}/tac-1`,
      modifie_le: T('08:00'),
      champs: { titre: 'Rappeler', type: 'appel', echeance: T('14:00'), avec_heure: true, duree_minutes: 30, occupe: false, fait_at: null, notes: 'Après la réunion' },
      liens: { contact: con, entreprise: ent, affaire: aff },
    }),
    changement({
      objet: 'rendez_vous',
      ref: `${A}/rdv-1`,
      modifie_le: T('08:00'),
      champs: { titre: 'Atelier fictif', debut: T('09:00'), fin: T('10:00'), lieu: 'Visio', compte_rendu: 'Besoin confirmé.', compte_rendu_at: T('10:15') },
      liens: { contacts: [con], entreprises: [ent], affaires: [aff] },
    }),
    changement({
      objet: 'activite',
      ref: `${A}/act-1`,
      modifie_le: T('08:00'),
      champs: { type: 'note', at: T('10:20'), titre: 'Suite', resume: 'Relancer en décembre.' },
      liens: { contact: null, entreprise: ent, affaire: aff },
    }),
  ];
}

test('describes the profile objects, in sending order', () => {
  assert.deepEqual(OBJETS_CRM, ['pipeline', 'entreprise', 'contact', 'affaire', 'tache', 'rendez_vous', 'activite']);
  for (const objet of OBJETS_CRM) {
    const def = MODELE_CRM[objet];
    for (const nom of def.obligatoires) assert.ok(nom in def.champs, `${objet}.${nom}`);
    for (const lien of Object.values(def.liens)) assert.ok(OBJETS_CRM.includes(lien.vers));
  }
  assert.equal(MODELE_CRM.affaire.champs.montant, 'entier');
  assert.deepEqual(MODELE_CRM.affaire.liens.contacts, { vers: 'contact', multiple: true });
  assert.deepEqual(MODELE_CRM.tache.liens.affaire, { vers: 'affaire', multiple: false });
});

test('builds a valid change for every object, and a deletion', () => {
  const tous = exemples();
  const l = lot({ changements: tous });
  assert.deepEqual(verifier('donnee', l), []);
  assert.deepEqual(lireLot(l).changements.map((c) => c.objet), OBJETS_CRM);
  const s = changement({ objet: 'contact', ref: `${A}/con-1`, action: 'supprime', modifie_le: T('11:00') });
  assert.deepEqual(s, { objet: 'contact', ref: `${A}/con-1`, action: 'supprime', modifie_le: T('11:00') });
  assert.deepEqual(lireLot(lot({ changements: [s] })).changements[0], { ...s, champs: {}, liens: {} });
  assert.match(changement({ objet: 'entreprise', ref: `${A}/e`, champs: { nom: 'x' } }).modifie_le, /^\d{4}-\d{2}-\d{2}T/);
});

test('refuses what the profile does not know, internal fields included', () => {
  const maj = (/** @type {any} */ objet, /** @type {any} */ champs, /** @type {any} */ liens = undefined, /** @type {any} */ autres = {}) =>
    changement({ objet, ref: `${A}/x`, modifie_le: T('08:00'), champs, liens, ...autres });
  const refuse = (/** @type {() => unknown} */ f, /** @type {RegExp} */ motif) =>
    assert.throws(f, (/** @type {any} */ e) => e instanceof ErreurFormat && motif.test(e.message));

  refuse(() => maj('prospect', { nom: 'x' }), /objet/);
  refuse(() => maj('entreprise', { nom: 'x' }, undefined, { ref: 'sans-noeud' }), /ref/);
  refuse(() => maj('entreprise', { nom: 'x' }, undefined, { modifie_le: 'hier' }), /modifie_le/);
  for (const interne of ['source', 'source_id', 'instance_id', 'event_id', 'participants', 'hubspot_id']) {
    refuse(() => maj('rendez_vous', { [interne]: 'x' }), /champ inconnu/);
  }
  refuse(() => maj('affaire', { montant: 12000.5 }), /montant : entier/);
  refuse(() => maj('affaire', { montant: '12000' }), /montant : entier/);
  refuse(() => maj('affaire', { echeance: '15/12/2026' }), /echeance : date/);
  refuse(() => maj('affaire', { clos: 'gagné' }), /clos : un de gagne, perdu/);
  refuse(() => maj('affaire', { probabilite_manuelle: 120 }), /0 à 100/);
  refuse(() => maj('affaire', { qualification: { besoin: 'fort' } }), /besoin : entier/);
  refuse(() => maj('affaire', { qualification: { humeur: 1 } }), /critère inconnu/);
  refuse(() => maj('affaire', { etapes_dates: { decouverte: 'hier' } }), /decouverte/);
  refuse(() => maj('tache', { type: 'visite' }), /type : un de/);
  refuse(() => maj('rendez_vous', { debut: '2026-11-04 09:00' }), /horodatage/);
  refuse(() => maj('contact', { emails: 'a@exemple.fr' }), /liste de textes/);
  refuse(() => maj('pipeline', { etapes: [PIPELINE[0], PIPELINE[0]] }), /en double/);
  refuse(() => maj('pipeline', { etapes: [{ ...PIPELINE[0], couleur: 'bleu' }] }), /clé inconnue/);
  refuse(() => maj('affaire', { titre: null }), /obligatoire/);
  refuse(() => maj('affaire', { montant: undefined }), /valeur manquante/);
  refuse(() => maj('entreprise', { x_Projet: 1 }), /champ propre invalide/);
  refuse(() => maj('entreprise', {}), /au moins un champ ou un lien/);
  refuse(() => maj('entreprise', { nom: 'x' }, undefined, { action: 'supprime' }), /suppression/);
  refuse(() => maj('entreprise', { nom: 'x' }, undefined, { action: 'efface' }), /action/);
  refuse(() => maj('affaire', undefined, { contacts: `${A}/c` }), /liste de références/);
  refuse(() => maj('affaire', undefined, { contacts: [`${A}/c`, `${A}/c`] }), /en double/);
  refuse(() => maj('tache', undefined, { contact: [`${A}/c`] }), /référence ou null/);
  refuse(() => maj('contact', undefined, { affaires: [`${A}/a`] }), /lien inconnu/);
  refuse(() => maj('activite', { resume: 'x'.repeat(TAILLE_LOT_MAX) }), /trop volumineux/);

  const propre = maj('entreprise', { x_alpes_note: { libre: [1, 'deux'] }, x_vide: null });
  assert.deepEqual(propre.champs, { x_alpes_note: { libre: [1, 'deux'] }, x_vide: null });
  assert.deepEqual(maj('affaire', { titre: 'x', clos: null, montant: null }).champs, { titre: 'x', clos: null, montant: null });
});

test('reads and checks a batch: the body of a donnee envelope', () => {
  const [c] = exemples();
  const l = lot({ changements: [c] });
  assert.deepEqual(l, { profil: 'crm/1', changements: [c] });
  assert.deepEqual(lireLot(l).instantane, null);
  assert.throws(() => lot({ changements: [] }), /au moins un/);
  const vide = lot({ changements: [], instantane: { id: 'snap-1', page: 1, pages: 1 } });
  assert.deepEqual(lireLot(vide), { instantane: { id: 'snap-1', page: 1, pages: 1 }, changements: [] });

  assert.match(verifier('donnee', { ...l, profil: 'crm/2' }).join(), /profil/);
  assert.match(verifier('donnee', { ...l, origine: 'x' }).join(), /origine : clé inconnue/);
  assert.match(verifier('donnee', { ...l, instantane: { id: 's', page: 3, pages: 2 } }).join(), /pages/);
  assert.match(verifier('donnee', { ...l, changements: [{ ...c, champ: {} }] }).join(), /changements\[0\]\.champ : clé inconnue/);
  // A data push of the first brick is no longer a valid body.
  const brique1 = { kind: 'message', messageId: 'm', role: 'agent', parts: [{ kind: 'data', data: { objet: 'prospect', evenement: 'cree', ref: 'p', champs: {} } }] };
  assert.throws(() => lireLot(brique1), ErreurFormat);
});

test('builds and splits references', () => {
  assert.equal(reference(A, 'aff-1'), 'noeud-a/aff-1');
  assert.deepEqual(lireReference('noeud-a/aff-1'), { noeud: A, id: 'aff-1' });
  assert.deepEqual(lireReference(reference(A, 'dossier/aff-1')), { noeud: A, id: 'dossier/aff-1' });
  assert.throws(() => reference('noeud/a', 'x'), ErreurFormat);
  assert.throws(() => reference(A, ''), ErreurFormat);
  assert.throws(() => lireReference('sans-noeud'), ErreurFormat);
});

test('difference sends only what changed since the last exchange', () => {
  const fiche = {
    champs: { titre: 'Affaire fictive', etape: 'decouverte', montant: 12000, motif: null, derniere_activite: T('07:30'), x_alpes: { a: 1, b: 2 } },
    liens: { contacts: [`${A}/c1`, `${A}/c2`], entreprises: [] },
    modifie_le: T('08:00'),
  };
  assert.deepEqual(difference(null, fiche), {
    champs: { titre: 'Affaire fictive', etape: 'decouverte', montant: 12000, derniere_activite: T('07:30'), x_alpes: { a: 1, b: 2 } },
    liens: { contacts: [`${A}/c1`, `${A}/c2`] },
  });
  const etat = retenir(null, changement({ objet: 'affaire', ref: `${A}/a`, modifie_le: fiche.modifie_le, .../** @type {any} */ (difference(null, fiche)) }));
  assert.equal(difference(etat, fiche), null);
  // Same instant written another way, same object in another key order, nulls and empty lists: no change.
  assert.equal(difference(etat, { champs: { derniere_activite: '2026-11-04T07:30:00Z', x_alpes: { b: 2, a: 1 }, motif: null }, liens: { entreprises: null } }), null);
  assert.deepEqual(difference(etat, { champs: { etape: 'negociation', montant: null, titre: undefined } }), { champs: { etape: 'negociation', montant: null }, liens: {} });
  // A field or link left out is not shared: nothing to send.
  assert.equal(difference(etat, { champs: {} }), null);
  // The order of a link matters: the first one is the main one.
  assert.deepEqual(difference(etat, { liens: { contacts: [`${A}/c2`, `${A}/c1`] } }), { champs: {}, liens: { contacts: [`${A}/c2`, `${A}/c1`] } });
  assert.deepEqual(difference(etat, { liens: { contacts: null } }), { champs: {}, liens: { contacts: [] } });
});

test('retenir keeps the sent values with their date; a deletion leaves the share', () => {
  const c = changement({ objet: 'affaire', ref: `${A}/a`, modifie_le: T('08:00'), champs: { titre: 'x', etape: 'decouverte' }, liens: { contacts: [`${A}/c`] } });
  const etat = retenir(null, c);
  assert.deepEqual(etat, {
    champs: { titre: 'x', etape: 'decouverte' },
    liens: { contacts: [`${A}/c`] },
    dates: { titre: T('08:00'), etape: T('08:00'), contacts: T('08:00') },
  });
  const suite = retenir(etat, changement({ objet: 'affaire', ref: `${A}/a`, modifie_le: T('09:00'), champs: { etape: 'negociation' } }));
  assert.equal(suite?.dates.etape, T('09:00'));
  assert.equal(suite?.dates.titre, T('08:00'));
  assert.equal(etat.champs.etape, 'decouverte');
  assert.equal(retenir(etat, changement({ objet: 'affaire', ref: `${A}/a`, action: 'supprime' })), null);
});

/** One side of a connection holding one shared deal: its record and the last exchanged state. */
function cote(/** @type {Record<string, unknown>} */ champs, /** @type {string} */ quand) {
  const c = changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: quand, champs });
  return { fiche: { champs: { ...champs }, liens: {}, modifie_le: quand }, etat: /** @type {any} */ (retenir(null, c)) };
}

/** Local edit, then what the loop would send (and remember). */
function modifierPuisEnvoyer(/** @type {ReturnType<typeof cote>} */ s, /** @type {Record<string, unknown>} */ champs, /** @type {string} */ quand) {
  Object.assign(s.fiche.champs, champs);
  s.fiche.modifie_le = quand;
  const d = /** @type {any} */ (difference(s.etat, s.fiche));
  const c = changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: quand, ...d });
  s.etat = retenir(s.etat, c);
  return c;
}

/** Applies a received change the way an OS would. */
function recevoir(/** @type {ReturnType<typeof cote>} */ s, /** @type {import('./crm.js').Changement} */ c, /** @type {string} */ maintenant) {
  const f = fusionner(s.etat, s.fiche, c);
  if (f.appliquer) {
    Object.assign(s.fiche.champs, f.appliquer.champs);
    s.fiche.modifie_le = maintenant;
  }
  s.etat = f.etat;
  return f;
}

test('fusionner creates a record never seen, with all it received', () => {
  const [, , , affaire] = exemples();
  const f = fusionner(null, null, affaire);
  assert.deepEqual(f.appliquer, { champs: affaire.champs, liens: affaire.liens });
  assert.equal(f.etat?.dates.montant, T('08:00'));
  assert.deepEqual(f.conflits, []);
  assert.equal(f.suppression, false);
});

test('fusionner applies a partner change, which is then not sent back', () => {
  const b = cote({ titre: 'Affaire fictive', etape: 'decouverte', montant: 12000 }, T('08:00'));
  const f = recevoir(b, changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: T('09:00'), champs: { etape: 'negociation' } }), T('09:01'));
  assert.deepEqual(f.appliquer, { champs: { etape: 'negociation' }, liens: {} });
  assert.deepEqual(f.conflits, []);
  assert.equal(difference(b.etat, b.fiche), null);
});

test('two different fields changed at the same time are not a conflict', () => {
  const b = cote({ titre: 'Affaire fictive', etape: 'decouverte', montant: 12000 }, T('08:00'));
  Object.assign(b.fiche, { champs: { ...b.fiche.champs, montant: 15000 }, modifie_le: T('09:05') });
  const f = recevoir(b, changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: T('09:00'), champs: { etape: 'negociation' } }), T('09:06'));
  assert.deepEqual(f.appliquer?.champs, { etape: 'negociation' });
  assert.deepEqual(f.conflits, []);
  assert.deepEqual(difference(b.etat, b.fiche), { champs: { montant: 15000 }, liens: {} });
});

test('the same field changed on both sides: the most recent wins and the other value is reported', () => {
  const recu = changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: T('09:03'), champs: { montant: 13000 } });

  const plusRecentIci = cote({ titre: 'x', etape: 'decouverte', montant: 12000 }, T('08:00'));
  Object.assign(plusRecentIci.fiche, { champs: { ...plusRecentIci.fiche.champs, montant: 11000 }, modifie_le: T('09:05') });
  const f = recevoir(plusRecentIci, recu, T('09:06'));
  assert.equal(f.appliquer, null);
  assert.deepEqual(f.conflits, [{ nom: 'montant', lien: false, local: 11000, recu: 13000, gagnant: 'local', local_le: T('09:05'), recu_le: T('09:03') }]);
  // The local value still has to reach the partner.
  assert.deepEqual(difference(plusRecentIci.etat, plusRecentIci.fiche), { champs: { montant: 11000 }, liens: {} });

  const plusAncienIci = cote({ titre: 'x', etape: 'decouverte', montant: 12000 }, T('08:00'));
  Object.assign(plusAncienIci.fiche, { champs: { ...plusAncienIci.fiche.champs, montant: 11000 }, modifie_le: T('09:01') });
  const g = recevoir(plusAncienIci, recu, T('09:06'));
  assert.deepEqual(g.appliquer?.champs, { montant: 13000 });
  assert.equal(g.conflits[0].gagnant, 'recu');
  assert.equal(g.conflits[0].local, 11000);
  assert.equal(difference(plusAncienIci.etat, plusAncienIci.fiche), null);

  const memeValeur = cote({ titre: 'x', etape: 'decouverte', montant: 12000 }, T('08:00'));
  Object.assign(memeValeur.fiche, { champs: { ...memeValeur.fiche.champs, montant: 13000 }, modifie_le: T('09:01') });
  const h = recevoir(memeValeur, recu, T('09:06'));
  assert.equal(h.appliquer, null);
  assert.deepEqual(h.conflits, []);
  assert.equal(difference(memeValeur.etat, memeValeur.fiche), null);
});

test('crossed changes end on the most recent value on both sides, reported once', () => {
  for (const [quandA, quandB] of [[T('10:05'), T('10:03')], [T('10:03'), T('10:05')], [T('10:04'), T('10:04')]]) {
    const a = cote({ titre: 'x', etape: 'decouverte', montant: 10000 }, T('09:00'));
    const b = cote({ titre: 'x', etape: 'decouverte', montant: 10000 }, T('09:00'));
    // Both send before receiving the other's change.
    const deA = modifierPuisEnvoyer(a, { montant: 11000, etape: 'negociation' }, quandA);
    const deB = modifierPuisEnvoyer(b, { montant: 13000 }, quandB);
    const fa = recevoir(a, deB, T('10:10'));
    const fb = recevoir(b, deA, T('10:10'));
    assert.deepEqual(a.fiche.champs, b.fiche.champs, `${quandA} / ${quandB}`);
    assert.equal(a.fiche.champs.etape, 'negociation');
    if (quandA !== quandB) assert.equal(a.fiche.champs.montant, quandA > quandB ? 11000 : 13000);
    assert.equal(fa.conflits.length + fb.conflits.length, 1);
    assert.deepEqual([...fa.conflits, ...fb.conflits].map((c) => c.nom), ['montant']);
    // Nothing left to send on either side: no echo.
    assert.equal(difference(a.etat, a.fiche), null);
    assert.equal(difference(b.etat, b.fiche), null);
  }
});

test('a received deletion is never applied alone', () => {
  const b = cote({ titre: 'x', etape: 'decouverte' }, T('08:00'));
  const f = fusionner(b.etat, b.fiche, changement({ objet: 'affaire', ref: `${A}/aff-1`, action: 'supprime' }));
  assert.deepEqual(f, { appliquer: null, etat: null, conflits: [], suppression: true });
});

test('a record missing here gets the whole record as now known', () => {
  const b = cote({ titre: 'Affaire fictive', etape: 'decouverte', montant: 12000 }, T('08:00'));
  const f = fusionner(b.etat, null, changement({ objet: 'affaire', ref: `${A}/aff-1`, modifie_le: T('09:00'), champs: { etape: 'gagne' } }));
  assert.deepEqual(f.appliquer, { champs: { titre: 'Affaire fictive', etape: 'gagne', montant: 12000 }, liens: {} });
});

test('decouper keeps batches under the limit, by object then in the given order', () => {
  const texte = 'Compte rendu fictif. '.repeat(400);
  const activites = Array.from({ length: 60 }, (_, i) =>
    changement({ objet: 'activite', ref: `${A}/act-${i}`, modifie_le: T('08:00'), champs: { type: 'note', at: T('08:00'), resume: texte } }));
  const entreprise = changement({ objet: 'entreprise', ref: `${A}/ent-1`, modifie_le: T('08:00'), champs: { nom: 'Entreprise fictive' } });
  const lots = decouper([...activites, entreprise]);
  assert.ok(lots.length >= 2);
  for (const l of lots) {
    assert.ok(octets(l) <= TAILLE_LOT_MAX);
    assert.equal(l.instantane, undefined);
  }
  const suite = lots.flatMap((l) => l.changements.map((c) => c.ref));
  assert.deepEqual(suite, [entreprise.ref, ...activites.map((c) => c.ref)]);

  const pages = decouper(activites, { instantane: 'snap-1' });
  assert.deepEqual(pages.map((l) => l.instantane), pages.map((_, i) => ({ id: 'snap-1', page: i + 1, pages: pages.length })));
  const [seule] = decouper([], { instantane: true });
  assert.equal(seule.changements.length, 0);
  assert.equal(seule.instantane?.pages, 1);
  assert.deepEqual(decouper([]), []);

  assert.throws(() => lot({ changements: activites }), /decouper/);
  const enorme = { ...activites[0], champs: { type: 'note', at: T('08:00'), resume: 'x'.repeat(TAILLE_LOT_MAX) } };
  assert.throws(() => decouper([enorme]), /trop volumineux/);
});

test('the simulated relay refuses what the real one refuses', async () => {
  const relais = relaisSimule();
  const a = creerClient({ url: relais.url, fetch: relais.fetch });
  const b = creerClient({ url: relais.url, fetch: relais.fetch });
  await a.inscrire({ nom: 'A', cle_inscription: 'cle-de-test' });
  const { connexion } = await b.rejoindre({ lien: (await a.inviter()).lien, nom: 'B' });
  const trop = { profil: 'crm/1', changements: [{ resume: 'x'.repeat(256 * 1024) }] };
  await assert.rejects(b.envoyer({ connexion: connexion.id, type: 'donnee', corps: trop }), (e) => e instanceof ErreurRelais && e.status === 413);
  await assert.rejects(b.envoyer({ connexion: connexion.id, type: /** @type {any} */ ('fiche'), corps: {} }), (e) => e instanceof ErreurRelais && e.status === 400);
});

test('two OS exchange a snapshot, changes and free messages through the simulated relay', async () => {
  const relais = relaisSimule();
  const simatis = { client: creerClient({ url: relais.url, fetch: relais.fetch }), stockage: stockageMemoire(), etats: new Map(), fiches: new Map() };
  const alpes = { client: creerClient({ url: relais.url, fetch: relais.fetch }), stockage: stockageMemoire(), etats: new Map(), fiches: new Map() };
  await simatis.client.inscrire({ nom: 'SIMATIS OS (test)', cle_inscription: 'cle-de-test' });
  const { connexion } = await alpes.client.rejoindre({ lien: (await simatis.client.inviter()).lien, nom: 'Alpes OS (test)' });
  relais.enveloppes.length = 0;

  /** @param {typeof simatis} os */
  const envoyer = async (os, /** @type {import('./crm.js').Lot[]} */ lots) => {
    for (const corps of lots) await deposer({ stockage: os.stockage, connexion: connexion.id, type: 'donnee', corps });
    await vider({ client: os.client, stockage: os.stockage });
  };
  /** @param {typeof simatis} os */
  const releverOs = async (os) => {
    /** @type {import('./crm.js').Conflit[]} */
    const conflits = [];
    /** @type {any[]} */
    const messages = [];
    const bilan = await relever({
      client: os.client,
      stockage: os.stockage,
      traiter: (e) => {
        if (e.type === 'message') return void messages.push(lireMessageLibre(/** @type {any} */ (e.corps)));
        for (const c of lireLot(e.corps).changements) {
          const f = fusionner(os.etats.get(c.ref), os.fiches.get(c.ref), c);
          if (f.appliquer) {
            const fiche = os.fiches.get(c.ref) ?? { champs: {}, liens: {} };
            os.fiches.set(c.ref, { champs: { ...fiche.champs, ...f.appliquer.champs }, liens: { ...fiche.liens, ...f.appliquer.liens }, modifie_le: c.modifie_le });
          }
          os.etats.set(c.ref, f.etat);
          conflits.push(...f.conflits);
        }
      },
    });
    assert.deepEqual(bilan.erreurs, []);
    assert.equal(bilan.invalides, 0);
    return { conflits, messages };
  };
  /** Local loop: what changed since the last exchange. @param {typeof simatis} os */
  const changementsLocaux = (os) => {
    const sortants = [];
    for (const [ref, fiche] of os.fiches) {
      const d = difference(os.etats.get(ref), fiche);
      if (!d) continue;
      const c = changement({ objet: ref.includes('aff') ? 'affaire' : 'entreprise', ref, modifie_le: fiche.modifie_le, ...d });
      os.etats.set(ref, retenir(os.etats.get(ref), c));
      sortants.push(c);
    }
    return sortants;
  };

  // SIMATIS OS shares 300 fictitious companies and one deal: the snapshot spans several pages.
  const affaire = { champs: { titre: 'Accompagnement fictif', etape: 'decouverte', montant: 12000 }, liens: { entreprises: [`${B}/ent-0`] }, modifie_le: T('08:00') };
  simatis.fiches.set(`${B}/aff-1`, affaire);
  for (let i = 0; i < 300; i++) {
    simatis.fiches.set(`${B}/ent-${i}`, { champs: { nom: `Entreprise fictive ${i}`, ville: 'Ville fictive', secteur: 'Secteur fictif '.repeat(60) }, liens: {}, modifie_le: T('08:00') });
  }
  const instantane = decouper(changementsLocaux(simatis), { instantane: true });
  assert.ok(instantane.length > 1);
  await envoyer(simatis, instantane);
  await releverOs(alpes);
  assert.equal(alpes.fiches.size, 301);
  assert.deepEqual(alpes.fiches.get(`${B}/aff-1`)?.champs, affaire.champs);
  assert.deepEqual(changementsLocaux(alpes), []);

  // Christophe moves the deal forward in Alpes OS; Marc changes the amount at the same time.
  Object.assign(alpes.fiches.get(`${B}/aff-1`), { champs: { ...alpes.fiches.get(`${B}/aff-1`).champs, etape: 'negociation', montant: 11000 }, modifie_le: T('09:00') });
  Object.assign(affaire, { champs: { ...affaire.champs, montant: 13000 }, modifie_le: T('09:02') });
  await envoyer(alpes, decouper(changementsLocaux(alpes)));
  await envoyer(simatis, decouper(changementsLocaux(simatis)));
  const chezSimatis = await releverOs(simatis);
  const chezAlpes = await releverOs(alpes);
  assert.deepEqual(simatis.fiches.get(`${B}/aff-1`)?.champs, { titre: 'Accompagnement fictif', etape: 'negociation', montant: 13000 });
  assert.deepEqual(alpes.fiches.get(`${B}/aff-1`)?.champs, simatis.fiches.get(`${B}/aff-1`)?.champs);
  assert.deepEqual([...chezSimatis.conflits, ...chezAlpes.conflits].map((c) => [c.nom, c.gagnant, c.local, c.recu]), [['montant', 'local', 13000, 11000]]);
  assert.deepEqual(changementsLocaux(simatis), []);
  assert.deepEqual(changementsLocaux(alpes), []);

  // A free message each way, the answer pointing to the question.
  const question = messageLibre({ type: 'question', sujet: 'Atelier fictif', texte: 'Le compte rendu est ici : https://exemple.fr/cr' });
  await deposer({ stockage: simatis.stockage, connexion: connexion.id, type: 'message', corps: question });
  await vider({ client: simatis.client, stockage: simatis.stockage });
  const [recue] = (await releverOs(alpes)).messages;
  assert.equal(recue.sujet, 'Atelier fictif');
  const reponse = messageLibre({ type: 'reponse', sujet: 'Re : Atelier fictif', texte: 'Merci, **lu**.', en_reponse_a: recue.id });
  await deposer({ stockage: alpes.stockage, connexion: connexion.id, type: 'message', corps: reponse });
  await vider({ client: alpes.client, stockage: alpes.stockage });
  const [retour] = (await releverOs(simatis)).messages;
  assert.deepEqual(retour, { id: reponse.messageId, type: 'reponse', sujet: 'Re : Atelier fictif', texte: 'Merci, **lu**.', en_reponse_a: question.messageId });
});
