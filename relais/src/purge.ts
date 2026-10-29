import { estObjet, uuid } from './lib';

const JOURS_CONSERVATION = 30;
const LOT = 200;
// Only what a node sent on purpose gets a failure notice: notifying about an expired notice
// would bounce forever between two silent nodes.
const A_SIGNALER = new Set(['mission', 'message', 'donnee']);

interface Expiree {
  id: string;
  connexion: string;
  de: string;
  type: string;
  corps: string;
}

function tacheConcernee(corps: string): { taskId: string | null; contextId: string | null } {
  try {
    const c: unknown = JSON.parse(corps);
    if (!estObjet(c)) return { taskId: null, contextId: null };
    const taskId = c.kind === 'task' ? c.id : c.taskId;
    return {
      taskId: typeof taskId === 'string' ? taskId : null,
      contextId: typeof c.contextId === 'string' ? c.contextId : null,
    };
  } catch {
    return { taskId: null, contextId: null };
  }
}

export function avisNonRelevee(e: Expiree, quand: string): Record<string, unknown> {
  const { taskId, contextId } = tacheConcernee(e.corps);
  return {
    kind: 'status-update',
    taskId,
    ...(contextId ? { contextId } : {}),
    status: {
      state: 'failed',
      message: {
        kind: 'message',
        role: 'agent',
        messageId: uuid(),
        parts: [{ kind: 'text', text: 'Non relevée en 30 jours.' }],
      },
      timestamp: quand,
    },
    final: true,
    metadata: { relais: { raison: 'non_relevee', enveloppe: e.id, type: e.type } },
  };
}

/** Daily cleanup: expired invitations, and envelopes nobody picked up within 30 days. */
export async function purger(env: Cloudflare.Env, maintenant = Date.now()): Promise<void> {
  const quand = new Date(maintenant).toISOString();
  const limite = new Date(maintenant - JOURS_CONSERVATION * 86_400_000).toISOString();

  await env.DB.prepare('DELETE FROM invitations WHERE acceptee_le IS NULL AND expire_le <= ?').bind(quand).run();

  for (;;) {
    const { results } = await env.DB.prepare(
      'SELECT id, connexion, de, type, corps FROM enveloppes WHERE cree_le < ? ORDER BY cree_le LIMIT ?',
    )
      .bind(limite, LOT)
      .all<Expiree>();
    if (results.length === 0) return;

    const avis = results
      .filter((e) => A_SIGNALER.has(e.type))
      .map((e) =>
        env.DB.prepare(
          `INSERT INTO enveloppes (id, connexion, de, a, type, corps, cree_le)
           SELECT ?, ?, 'relais', ?, 'etat', ?, ? WHERE EXISTS (SELECT 1 FROM noeuds WHERE id = ?)`,
        ).bind(uuid(), e.connexion, e.de, JSON.stringify(avisNonRelevee(e, quand)), quand, e.de),
      );
    await env.DB.batch([
      ...avis,
      env.DB.prepare('DELETE FROM enveloppes WHERE id IN (SELECT value FROM json_each(?))').bind(
        JSON.stringify(results.map((e) => e.id)),
      ),
    ]);
    if (results.length < LOT) return;
  }
}
