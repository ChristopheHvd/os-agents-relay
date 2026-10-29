import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { appel, inscrire, mission, paire } from './outils';

describe('inscription', () => {
  it("refuse sans clé d'inscription ni invitation", async () => {
    const r = await appel('POST', '/noeuds', { corps: { nom: 'Sans clé' } });
    expect(r.status).toBe(403);
    expect(r.json.erreur).toBeTypeOf('string');
  });

  it('refuse une clé fausse', async () => {
    const r = await appel('POST', '/noeuds', { corps: { nom: 'Mauvaise clé', cle_inscription: 'pas-la-bonne' } });
    expect(r.status).toBe(403);
  });

  it('exige un nom', async () => {
    const r = await appel('POST', '/noeuds', { corps: { cle_inscription: 'cle-de-test' } });
    expect(r.status).toBe(400);
  });

  it('inscrit avec la clé et renvoie un secret utilisable une fois montré', async () => {
    const r = await appel('POST', '/noeuds', {
      corps: { nom: 'OS fictif', cle_inscription: 'cle-de-test', carte: { name: 'OS fictif' } },
    });
    expect(r.status).toBe(201);
    expect(r.json.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.json.secret.length).toBeGreaterThanOrEqual(43);

    const moi = await appel('GET', '/noeuds/moi', { auth: `${r.json.id}.${r.json.secret}` });
    expect(moi.status).toBe(200);
    expect(moi.json).toMatchObject({ id: r.json.id, nom: 'OS fictif', carte: { name: 'OS fictif' } });

    const stocke = await env.DB.prepare('SELECT secret_hash FROM noeuds WHERE id = ?').bind(r.json.id).first<{ secret_hash: string }>();
    expect(stocke?.secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stocke?.secret_hash).not.toContain(r.json.secret);
  });

  it('refuse un secret faux, un nœud inconnu ou une absence d’en-tête', async () => {
    const n = await inscrire();
    expect((await appel('GET', '/connexions', { auth: `${n.id}.faux` })).status).toBe(401);
    expect((await appel('GET', '/connexions', { auth: `${crypto.randomUUID()}.${n.secret}` })).status).toBe(401);
    expect((await appel('GET', '/connexions')).status).toBe(401);
  });

  it('publie la carte du nœud', async () => {
    const n = await inscrire();
    const carte = { name: 'OS fictif', description: 'Pour les tests', skills: [{ id: 'livre-blanc', name: 'Livre blanc' }] };
    expect((await appel('PUT', '/noeuds/moi/carte', { auth: n.auth, corps: carte })).status).toBe(200);
    expect((await appel('GET', '/noeuds/moi', { auth: n.auth })).json.carte).toEqual(carte);
  });
});

describe('invitations', () => {
  it('crée une invitation avec un lien et une expiration à 7 jours', async () => {
    const a = await inscrire();
    const r = await appel('POST', '/invitations', { auth: a.auth, corps: { email: 'contact@exemple.fr' } });
    expect(r.status).toBe(201);
    expect(r.json.code).toMatch(/^[A-Z2-7]{24}$/);
    expect(r.json.lien).toBe(`https://relais.test/invitations/${r.json.code}`);
    const jours = (Date.parse(r.json.expire_le) - Date.now()) / 86_400_000;
    expect(jours).toBeGreaterThan(6.9);
    expect(jours).toBeLessThanOrEqual(7);
  });

  it('refuse un e-mail invalide', async () => {
    const a = await inscrire();
    expect((await appel('POST', '/invitations', { auth: a.auth, corps: { email: 'pas un mail' } })).status).toBe(400);
  });

  it('crée la connexion, visible des deux côtés, et avertit l’invitant', async () => {
    const a = await inscrire('Alpes (test)');
    const b = await inscrire('Simatis (test)');
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    const acc = await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: b.auth });
    expect(acc.status).toBe(201);
    expect(acc.json.connexion.partenaire).toMatchObject({ id: a.id, nom: 'Alpes (test)' });

    const deA = await appel('GET', '/connexions', { auth: a.auth });
    const deB = await appel('GET', '/connexions', { auth: b.auth });
    expect(deA.json.connexions).toHaveLength(1);
    expect(deA.json.connexions[0]).toMatchObject({ id: acc.json.connexion.id, partenaire: { id: b.id, nom: 'Simatis (test)' } });
    expect(deB.json.connexions[0]).toMatchObject({ id: acc.json.connexion.id, partenaire: { id: a.id } });

    const boite = await appel('GET', '/boite', { auth: a.auth });
    expect(boite.json.enveloppes).toHaveLength(1);
    expect(boite.json.enveloppes[0]).toMatchObject({
      type: 'connexion',
      de: b.id,
      a: a.id,
      corps: { evenement: 'acceptee', invitation: inv.json.code, connexion: { id: acc.json.connexion.id, partenaire: { id: b.id } } },
    });
  });

  it('refuse de réutiliser une invitation', async () => {
    const a = await inscrire();
    const b = await inscrire();
    const c = await inscrire();
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    expect((await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: b.auth })).status).toBe(201);
    expect((await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: c.auth })).status).toBe(409);
  });

  it('refuse une invitation expirée', async () => {
    const a = await inscrire();
    const b = await inscrire();
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    await env.DB.prepare('UPDATE invitations SET expire_le = ? WHERE code = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), inv.json.code)
      .run();
    expect((await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: b.auth })).status).toBe(410);
  });

  it('refuse un code inconnu, sa propre invitation et une connexion en double', async () => {
    const a = await inscrire();
    const b = await inscrire();
    expect((await appel('POST', `/invitations/${'A'.repeat(24)}/accepter`, { auth: b.auth })).status).toBe(404);
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    expect((await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: a.auth })).status).toBe(400);
    expect((await appel('POST', `/invitations/${inv.json.code}/accepter`, { auth: b.auth })).status).toBe(201);
    const inv2 = await appel('POST', '/invitations', { auth: b.auth, corps: {} });
    expect((await appel('POST', `/invitations/${inv2.json.code}/accepter`, { auth: a.auth })).status).toBe(409);
  });

  it("inscrit un nouveau nœud par invitation et l'accepte dans la foulée", async () => {
    const a = await inscrire('Alpes (test)');
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    const r = await appel('POST', '/noeuds', { corps: { nom: 'Instance fictive', invitation: inv.json.code } });
    expect(r.status).toBe(201);
    expect(r.json.connexion.partenaire).toMatchObject({ id: a.id });
    const auth = `${r.json.id}.${r.json.secret}`;
    expect((await appel('GET', '/connexions', { auth })).json.connexions).toHaveLength(1);
    const boite = await appel('GET', '/boite', { auth: a.auth });
    expect(boite.json.enveloppes[0].corps.connexion.partenaire.nom).toBe('Instance fictive');

    const encore = await appel('POST', '/noeuds', { corps: { nom: 'Second essai', invitation: inv.json.code } });
    expect(encore.status).toBe(409);
  });
});

describe('envois et boîte', () => {
  it('refuse un envoi hors connexion', async () => {
    const { connexion } = await paire();
    const intrus = await inscrire('Intrus');
    const r = await appel('POST', '/envois', { auth: intrus.auth, corps: { connexion, type: 'mission', corps: mission() } });
    expect(r.status).toBe(403);
  });

  it('valide le type et le corps', async () => {
    const { a, connexion } = await paire();
    expect((await appel('POST', '/envois', { auth: a.auth, corps: { connexion, type: 'autre', corps: {} } })).status).toBe(400);
    expect((await appel('POST', '/envois', { auth: a.auth, corps: { connexion, type: 'mission', corps: 'texte' } })).status).toBe(400);
    expect((await appel('POST', '/envois', { auth: a.auth, brut: '{pas du json' })).status).toBe(400);
  });

  it("dépose chez l'autre bout, et lui seul la voit", async () => {
    const { a, b, connexion } = await paire();
    const m = mission();
    const envoi = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'mission', corps: m } });
    expect(envoi.status).toBe(201);

    const boiteA = await appel('GET', '/boite', { auth: a.auth });
    expect(boiteA.json.enveloppes).toHaveLength(1);
    expect(boiteA.json.enveloppes[0]).toMatchObject({ id: envoi.json.id, connexion, de: b.id, a: a.id, type: 'mission', corps: m });
    expect((await appel('GET', '/boite', { auth: b.auth })).json.enveloppes).toHaveLength(0);
  });

  it("n'efface pas l'enveloppe d'un autre nœud", async () => {
    const { a, b, connexion } = await paire();
    const envoi = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'message', corps: { kind: 'message' } } });
    const ack = await appel('POST', '/boite/acquitter', { auth: b.auth, corps: { ids: [envoi.json.id] } });
    expect(ack.json.acquittees).toBe(0);
    expect((await appel('GET', '/boite', { auth: a.auth })).json.enveloppes).toHaveLength(1);
  });

  it("efface à l'acquittement", async () => {
    const { a, b, connexion } = await paire();
    const e1 = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'mission', corps: mission() } });
    const e2 = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'donnee', corps: { kind: 'message' } } });
    const ack = await appel('POST', '/boite/acquitter', { auth: a.auth, corps: { ids: [e1.json.id] } });
    expect(ack.json.acquittees).toBe(1);
    const boite = await appel('GET', '/boite', { auth: a.auth });
    expect(boite.json.enveloppes.map((e: any) => e.id)).toEqual([e2.json.id]);
    const compte = await env.DB.prepare('SELECT COUNT(*) AS n FROM enveloppes WHERE id = ?').bind(e1.json.id).first<{ n: number }>();
    expect(compte?.n).toBe(0);
  });

  it('pagine la relève par 100 avec un curseur', async () => {
    const { a, b, connexion } = await paire();
    const ids: string[] = [];
    for (let i = 0; i < 130; i++) {
      const r = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'message', corps: { n: i } } });
      ids.push(r.json.id);
    }
    const p1 = await appel('GET', '/boite', { auth: a.auth });
    expect(p1.json.enveloppes).toHaveLength(100);
    expect(p1.json.suite).toBe(true);
    const p2 = await appel('GET', `/boite?apres=${encodeURIComponent(p1.json.curseur)}`, { auth: a.auth });
    expect(p2.json.enveloppes).toHaveLength(30);
    expect(p2.json.suite).toBe(false);
    const vus = [...p1.json.enveloppes, ...p2.json.enveloppes].map((e: any) => e.id);
    expect(new Set(vus).size).toBe(130);
    expect(new Set(vus)).toEqual(new Set(ids));
    expect((await appel('GET', '/boite?apres=pas-un-curseur', { auth: a.auth })).status).toBe(400);
  });

  it('accepte de renvoyer la même enveloppe (même id) sans la dupliquer', async () => {
    const { a, b, connexion } = await paire();
    const id = crypto.randomUUID();
    const premier = await appel('POST', '/envois', { auth: b.auth, corps: { id, connexion, type: 'mission', corps: mission() } });
    const second = await appel('POST', '/envois', { auth: b.auth, corps: { id, connexion, type: 'mission', corps: mission() } });
    expect(premier.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await appel('GET', '/boite', { auth: a.auth })).json.enveloppes).toHaveLength(1);
    const vol = await appel('POST', '/envois', { auth: a.auth, corps: { id, connexion, type: 'mission', corps: mission() } });
    expect(vol.status).toBe(409);
  });

  it('refuse une enveloppe de plus de 256 Ko', async () => {
    const { b, connexion } = await paire();
    const gros = { kind: 'message', texte: 'x'.repeat(256 * 1024) };
    const r = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'message', corps: gros } });
    expect(r.status).toBe(413);
    const juste = { kind: 'message', texte: 'x'.repeat(200 * 1024) };
    expect((await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'message', corps: juste } })).status).toBe(201);
  });
});

describe('coupure et désinscription', () => {
  it("coupe la connexion, avertit l'autre et bloque les envois", async () => {
    const { a, b, connexion } = await paire();
    expect((await appel('DELETE', `/connexions/${connexion}`, { auth: b.auth })).status).toBe(200);
    const boite = await appel('GET', '/boite', { auth: a.auth });
    expect(boite.json.enveloppes).toHaveLength(1);
    expect(boite.json.enveloppes[0]).toMatchObject({ type: 'connexion', de: b.id, corps: { evenement: 'coupee', connexion: { id: connexion } } });
    expect((await appel('GET', '/connexions', { auth: a.auth })).json.connexions).toHaveLength(0);
    expect((await appel('POST', '/envois', { auth: a.auth, corps: { connexion, type: 'mission', corps: mission() } })).status).toBe(403);
    expect((await appel('DELETE', `/connexions/${connexion}`, { auth: a.auth })).status).toBe(409);
  });

  it("refuse de couper la connexion d'autrui", async () => {
    const { connexion } = await paire();
    const intrus = await inscrire();
    expect((await appel('DELETE', `/connexions/${connexion}`, { auth: intrus.auth })).status).toBe(404);
  });

  it('désinscrit un nœud, coupe ses connexions et avertit le partenaire', async () => {
    const { a, b, connexion } = await paire();
    await appel('POST', '/envois', { auth: a.auth, corps: { connexion, type: 'mission', corps: mission() } });
    expect((await appel('DELETE', '/noeuds/moi', { auth: b.auth })).status).toBe(200);
    expect((await appel('GET', '/noeuds/moi', { auth: b.auth })).status).toBe(401);
    const restantes = await env.DB.prepare('SELECT COUNT(*) AS n FROM enveloppes WHERE a = ?').bind(b.id).first<{ n: number }>();
    expect(restantes?.n).toBe(0);
    const boite = await appel('GET', '/boite', { auth: a.auth });
    expect(boite.json.enveloppes[0].corps).toMatchObject({ evenement: 'coupee', raison: 'desinscription' });
  });
});

describe('tâche planifiée', () => {
  async function lancerPurge(quand = Date.now()) {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: quand, cron: '17 3 * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
  }

  it('efface les enveloppes de plus de 30 jours et avertit l’expéditeur', async () => {
    const { a, b, connexion } = await paire();
    const m = mission();
    const vieille = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'mission', corps: m } });
    const recente = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'message', corps: { kind: 'message' } } });
    await env.DB.prepare('UPDATE enveloppes SET cree_le = ? WHERE id = ?')
      .bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), vieille.json.id)
      .run();

    await lancerPurge();

    const boiteA = await appel('GET', '/boite', { auth: a.auth });
    expect(boiteA.json.enveloppes.map((e: any) => e.id)).toEqual([recente.json.id]);
    const boiteB = await appel('GET', '/boite', { auth: b.auth });
    expect(boiteB.json.enveloppes).toHaveLength(1);
    expect(boiteB.json.enveloppes[0]).toMatchObject({
      type: 'etat',
      de: 'relais',
      a: b.id,
      connexion,
      corps: { kind: 'status-update', taskId: m.id, status: { state: 'failed' }, final: true },
    });
    expect(boiteB.json.enveloppes[0].corps.status.message.parts[0].text).toContain('30 jours');
  });

  it("n'avertit pas pour un avis expiré (pas de rebond)", async () => {
    const { a, b, connexion } = await paire();
    const etat = await appel('POST', '/envois', { auth: b.auth, corps: { connexion, type: 'etat', corps: { kind: 'status-update' } } });
    await env.DB.prepare('UPDATE enveloppes SET cree_le = ? WHERE id = ?')
      .bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), etat.json.id)
      .run();
    await lancerPurge();
    expect((await appel('GET', '/boite', { auth: a.auth })).json.enveloppes).toHaveLength(0);
    expect((await appel('GET', '/boite', { auth: b.auth })).json.enveloppes).toHaveLength(0);
  });

  it('supprime les invitations expirées non acceptées', async () => {
    const a = await inscrire();
    const inv = await appel('POST', '/invitations', { auth: a.auth, corps: {} });
    await env.DB.prepare('UPDATE invitations SET expire_le = ? WHERE code = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), inv.json.code)
      .run();
    await lancerPurge();
    const reste = await env.DB.prepare('SELECT COUNT(*) AS n FROM invitations WHERE code = ?').bind(inv.json.code).first<{ n: number }>();
    expect(reste?.n).toBe(0);
  });
});

describe('routes', () => {
  it('répond 404 en JSON sur un chemin inconnu et 405 sur une mauvaise méthode', async () => {
    const r = await appel('GET', '/nulle-part');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ erreur: 'introuvable' });
    expect((await appel('GET', '/envois')).status).toBe(405);
  });
});
