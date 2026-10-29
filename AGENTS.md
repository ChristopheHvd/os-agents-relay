# os-agents-relay — consignes pour les agents

Relais et kit de connexion qui permettent aux agents de deux OS d'entreprise (Alpes OS,
SIMATIS OS, puis les outils livrés aux clients) de se confier des missions et de se pousser
des données. Spec : `docs/spec-brique-1.md`. Plan : `docs/plan-brique-1.md`.

- `relais/` : Cloudflare Worker + D1 (TypeScript, wrangler, Vitest dans l'environnement Workers).
- `kit/` : paquet JavaScript ESM sans build, types en JSDoc, installé dans chaque OS.

## Vérifier son travail

    npm test                 # kit (node --test)
    npm run test:relais      # relais (tsc + Vitest)
    npm run e2e              # bout en bout : kit contre un relais local (wrangler dev)
    npm run types            # régénère kit/*.d.ts (à committer : SIMATIS OS est en TypeScript)

La CI rejoue tout cela (et vérifie que les `.d.ts` sont à jour) sur chaque PR et chaque push sur `main`.

## Branches

- Petits changements (docs, config) : commit direct sur `main`.
- Feature de code : branche `feature/<nom>`, PR, CI verte, puis merge.
- Jamais `--no-verify`, `push --force` ni `reset --hard` sans demande explicite.

## Confidentialité (dépôt public)

- Aucune donnée réelle : ni client, prospect, contact, montant, ni contenu du second cerveau.
  Exemples et tests avec des données fictives uniquement.
- Aucun secret : la clé d'inscription du relais vit dans `.secrets/` (ignoré par git) et
  dans les secrets Cloudflare ; les identités des nœuds vivent chez chaque OS.
- Relire `git diff --staged` avant chaque commit ; ajouter les fichiers un par un.
