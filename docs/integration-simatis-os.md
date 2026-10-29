# Intégration côté SIMATIS OS, brique 1

Pour Marc et son agent. Date : 30 octobre 2026. Référence fonctionnelle : [spec-brique-1.md](spec-brique-1.md).
Écrite à partir du code de SIMATIS OS au commit `0a88a35` (les chemins et numéros de ligne cités
peuvent avoir bougé depuis : se fier aux noms). Toutes les données d'exemple sont fictives.

## Ce que SIMATIS OS doit savoir faire en brique 1

1. Se connecter à un partenaire (Alpes OS d'abord) en collant le lien d'invitation qu'il a reçu.
2. Confier une mission au partenaire depuis le Claude de Marc (outil MCP `confier_mission`).
3. Suivre ces missions : les changements d'état reçus deviennent des sujets de l'Inbox, et l'outil
   MCP `missions_partenaires` les liste.
4. Pousser un fait du suivi commercial quand Marc le demande (outil MCP `envoyer_donnee`), dans la
   limite de ce que le réglage « Alpes OS voit » autorise.

Hors brique 1 : recevoir des missions (brique 2 ; le niveau L0–L3 est déjà réglable et stocké),
l'envoi automatique des données à chaque changement du suivi, la réception de données.

## Vue d'ensemble

```
Claude de Marc ──MCP──▶ SIMATIS OS (instance) ──HTTPS──▶ relais.alpes-ia.fr ◀──HTTPS── Alpes OS
                         │  file d'envoi (Postgres)          boîtes aux lettres
                         │  relève toutes les 60 s ◀──────── états, messages, avis
                         └─▶ sujets de l'Inbox, journal
```

SIMATIS OS n'ouvre aucune porte : il appelle le relais, jamais l'inverse. Le kit
(`os-agents-relay`) fait le protocole (inscription, invitations, relève idempotente, file d'envoi
avec nouvel essai, format A2A) ; SIMATIS OS lui fournit son stockage et décide quoi faire de ce qui
arrive.

## 1. Installer le kit

```bash
npm install "os-agents-relay@github:ChristopheHvd/os-agents-relay#<sha de main>"
```

Paquet ESM sans build, types fournis (`kit/index.d.ts`). Épingler un commit de `main` (la CI du
dépôt est verte sur chaque commit de `main`). Ce qui sert ici :

| Import | Rôle |
|---|---|
| `creerClient({ url, noeud, secret })` | Client du relais. `rejoindre({ lien, nom, carte })` s'inscrit par l'invitation si le nœud n'existe pas encore, sinon l'accepte. |
| `carte(…)`, `mission(…)`, `donnee(…)` | Fabriques au format A2A (validées). |
| `lireEtat`, `lireNote`, `lireMission` | Lecture des enveloppes reçues. |
| `relever({ client, stockage, traiter, invalide })` | Relève idempotente ; acquitte seulement après `traiter`. |
| `deposer({ stockage, connexion, type, corps })`, `vider({ client, stockage, surAbandon })` | File d'envoi : valide, met en file, envoie avec nouvel essai (1 min → 1 h), abandon sur refus définitif ou après 30 jours. |
| `NIVEAUX`, `REPERES`, `niveauDepuisRepere('L2')` | Correspondance L0–L3 ↔ niveaux du relais. |
| `relaisSimule()` | Relais en mémoire pour les tests (même API HTTP). |

## 2. Configuration

- Nouvelle variable serveur `RELAIS_URL` (optionnelle ; absente → module éteint), dans le schéma zod
  de `src/config.ts` (`Config.relaisUrl`), dans `.env.example` (sans valeur) et dans `compose.yaml`.
  Valeur de production : `https://relais.alpes-ia.fr`.
- Identité du nœud **par instance**, dans les secrets de l'instance (`src/secrets.ts`) :
  `writeInstanceSecret(dir, slug, 'RELAIS_NOEUD', id)` et `'RELAIS_SECRET'`. Relues par
  `loadInstanceSecrets`. Le secret n'apparaît jamais dans une réponse d'API, un outil MCP, le journal
  ni les logs (règle du module connexions, `docs/plan.md`).
- SIMATIS OS n'a **pas besoin de la clé d'inscription** du relais : chaque instance s'inscrit en
  acceptant une invitation (le lien suffit).

## 3. Tables (Drizzle, isolées par instance)

Toutes avec `...metierColumns()` et `instanceIsolation('<table>')` (`src/db/columns.ts`), créées par
`npm run db:generate`, et ajoutées à `METIER_TABLES` (`src/db/metier-tables.ts`, enfants avant
parents) pour la purge d'une instance. Les requêtes filtrent aussi par `currentInstance`, comme le
reste du code.

**`partenaires`** : une ligne par connexion du relais.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | |
| `connexion_id` | text, unique par instance | id de la connexion au relais |
| `noeud_id` | text | nœud du partenaire |
| `nom` | text | nom du nœud partenaire (« Alpes OS · … ») |
| `carte` | jsonb | carte d'agent A2A du partenaire |
| `niveau` | text enum L0–L3, défaut `L0` | missions **reçues** (brique 2) |
| `partage` | jsonb `string[]` | objets que le partenaire voit : `prospect`, `rendez_vous`, `affaire`, `compte_rendu` ; vide par défaut |
| `statut` | `active` \| `coupee` | |
| `coupee_at` | timestamptz | |

**`missions`** : missions envoyées (et reçues en brique 2).

| Colonne | Type | Rôle |
|---|---|---|
| `id` | text | id de la tâche A2A (`mission().id`), clé partagée avec le partenaire |
| `partenaire_id` | uuid → `partenaires` | |
| `sens` | `envoyee` \| `recue` | |
| `titre`, `consigne` | text | |
| `contexte` | jsonb | données jointes (optionnel) |
| `etat` | text | état A2A : `submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`, `rejected` ; plus `simulation` tant que les écritures réelles sont fermées |
| `dernier_message` | text | dernier message reçu |
| `resultat` | jsonb | dernier résultat reçu (`titre`, `resume`, lien…) |
| `historique` | jsonb | `[{ etat, at, message, enveloppe }]` |
| `proposition_id` | uuid | proposition qui l'a créée |
| `confiee_par` | text | acteur (`agent:<jeton>`, `pilote`) |

**`donnees_envoyees`** : trace de ce qui est parti (jamais de réception en brique 1).

| Colonne | Type | Rôle |
|---|---|---|
| `id` | text | id de l'enveloppe |
| `partenaire_id` | uuid | |
| `objet`, `evenement`, `ref` | text | champs fixes de la donnée |
| `champs` | jsonb | |
| `proposition_id`, `envoyee_par` | | |

**`relais_sorties`** (file d'envoi) et **`relais_vus`** (enveloppes déjà traitées) : le stockage du
kit. `relais_sorties` : `id` (id de l'enveloppe), `connexion_id`, `type`, `corps` jsonb, `cree_le`,
`prochain_essai`. `relais_vus` : `enveloppe_id` unique par instance, `vu_at` ; purger au-delà de
90 jours.

## 4. Brancher le kit sur Postgres

L'interface de stockage du kit : `dejaVu(id)`, `marquerVu(id)`, `ajouterSortie(e)`, `sorties()`,
`retirerSortie(id)`, `reporterSortie(id, prochainEssai)`.

- Chaque appel ouvre sa propre transaction `withInstance(db, instance.id, …)`.
- **Traiter et marquer vu dans la même transaction** : `traiter(enveloppe)` fait le changement
  métier **et** insère l'id dans `relais_vus` (`onConflictDoNothing`) ; `marquerVu` est alors sans
  effet. Le kit n'acquitte qu'après le retour de `traiter`, donc après le commit : c'est le même
  principe que la relève des demandes du site (`src/site/releve.ts`).
- Une enveloppe mal formée est acquittée sans être traitée (rappel `invalide`) : la journaliser.

## 5. La boucle

`startRelevePartenaires(...)` dans `src/partenaires/releve.ts`, démarrée dans `src/server.ts` comme
`startReleveSite` (un tour immédiat, puis toutes les 60 s, garde de réentrance, arrêt sur SIGTERM).
À chaque tour, pour chaque instance active qui a `RELAIS_NOEUD` dans ses secrets :

1. `relever({ client, stockage, traiter })` ;
2. `vider({ client, stockage, surAbandon })`.

Erreurs réseau : un avertissement dans les logs, rien d'autre ; le tour suivant réessaie.

**Ce que fait `traiter`** selon le type d'enveloppe :

| Type | Effet |
|---|---|
| `etat` | Mission retrouvée par `taskId` **et** par la connexion de l'enveloppe (un état venu d'une autre connexion est ignoré). Mise à jour de `etat`, `dernier_message`, `resultat`, `historique`. Sujet dans l'Inbox (voir § 6). |
| `message` | Ajout à l'historique de la mission (`taskId`), sujet dans l'Inbox (« Reportée à plus tard », par exemple). |
| `connexion` | `acceptee` : crée la ligne `partenaires` si l'invitation venait de SIMATIS OS. `coupee` : `statut = 'coupee'`, sujet « Connexion coupée par … ». |
| `mission`, `donnee` | Brique 2 : journalisées (« reçue, non prise en charge en brique 1 »), acquittées, sans autre effet. |

Une enveloppe déposée par le relais lui-même a `de: "relais"` : c'est l'avis `failed`
« Non relevée en 30 jours » d'une mission que le partenaire n'a jamais relevée.

`surAbandon(sortie, raison)` (connexion coupée, ou relais injoignable pendant 30 jours) : mission
passée en `failed` localement, sujet dans l'Inbox.

Pour l'ordre : un état final (`completed`, `failed`, `canceled`, `rejected`) n'est jamais remplacé
par un état non final reçu après.

## 6. Sujets de l'Inbox

`deposerSujet(tx, …)` (`src/inbox/depot.ts`), dans la transaction de `traiter` :

- `origine: 'partenaire'` : nouvelle valeur à ajouter à `ORIGINES_SUJET` (`src/inbox/schema.ts`) et
  à `SujetVue.origine` côté web (`web/src/api.ts`) ; pas de migration (pas de contrainte en base).
- `source: 'relais'`, `sourceId` = **id de l'enveloppe** : une enveloppe relevée deux fois ne crée
  qu'un sujet.
- `type: 'autre'` ; `titre` : « Alpes OS a accepté « Livre blanc (essai) » », « … a refusé … »,
  « … : mission faite », « … : reportée à plus tard » ; `resume` : le message reçu ;
  `lien` : un lien http(s) du résultat s'il y en a un (sinon rien).
- Priorité 2 pour `completed`, `rejected`, `failed` ; 3 sinon. Pas de sujet pour un `working` sans
  message.

Chaque état reçu fait aussi une ligne de journal (`logEvent`, acteur `'relais'`).

## 7. Envoyer = écrire vers un système tiers

Tout ce qui part au relais suit la règle du dépôt : **simulation par défaut, double verrou pour le
réel** (`canWriteReal(instance, config.realWrites)` : `REAL_WRITES=on` **et**
`instances.config.ecrituresReelles`).

Deux types de propositions (`registerPropositionType`, `src/propositions/registry.ts`) :

| Type | Contenu (zod) | `apply` |
|---|---|---|
| `partenaire.mission` | `{ partenaireId, titre, consigne, contexte? }` | Crée la mission (`mission({ consigne, titre, contexte })`). Si `ctx.reel` : `deposer(...)` dans `relais_sorties`, état `submitted`. Sinon : état `simulation`, rien ne part, journal « (simulation) ». |
| `partenaire.donnee` | `{ partenaireId, objet, evenement, ref, champs }` | Refuse si `objet` n'est pas dans `partage`. Si `ctx.reel` : `deposer(...)`, ligne `donnees_envoyees`. Sinon : simulation. |

**Action d'autonomie** : ajouter une action `partenaire` à `AUTONOMIE`
(`src/propositions/autonomie.ts`), recommandation : défaut `L3`, min `L1`, max `L3`. L'agent agit
sur une demande explicite de Marc ; Marc peut passer à `L2` pour valider chaque envoi dans l'Inbox.
À trancher par Marc.

Se connecter (inscription, acceptation d'une invitation) écrit aussi au relais : même double verrou.
Fermé, l'écran l'explique et ne fait rien.

## 8. Outils MCP

Dans `src/partenaires/outils-mcp.ts`, déclarés avec `registerTool({ ..., scope: 'instance' })`
(`src/mcp/tools.ts`) et importés pour effet dans `src/mcp/server.ts`.

| Outil | Entrée | Effet |
|---|---|---|
| `confier_mission` | `partenaire` (nom ou id), `consigne`, `titre?`, `contexte?` | `propose(type 'partenaire.mission')`. Renvoie l'id de la mission, son état (`submitted` ou `simulation`) ou la proposition en attente. Partenaire inconnu ou coupé : erreur qui liste les partenaires actifs. |
| `missions_partenaires` | `partenaire?`, `etat?`, `limite?` (défaut 20) | Liste : titre, partenaire, état, dernier message, résultat, dates. Sert aussi à lister les partenaires connectés. |
| `envoyer_donnee` | `partenaire`, `objet` (`prospect` \| `rendez_vous` \| `affaire` \| `compte_rendu`), `evenement` (`cree` \| `modifie` \| `gagne` \| `perdu`), `ref`, `champs` (`entreprise`, `ville`, `etape`, `date`, `resume`…) | `propose(type 'partenaire.donnee')`. `ref` = id stable dans SIMATIS OS (même `ref` = même fiche chez le partenaire). |

Les descriptions des outils disent ce que voit le partenaire : la consigne et les champs partent
**tels quels**. L'agent n'y met rien qui ne concerne pas le partenaire.

## 9. Écran Partenaires

Un onglet « Partenaires » dans Paramètres (`web/src/pages/Parametres.tsx`, à côté de Connexions),
composant `web/src/pages/parametres/Partenaires.tsx`, routes sous `/api/i/:slug/partenaires` :

- `GET` : module actif ou non, état du double verrou, partenaires (nom, connecté depuis, niveau,
  partage, statut), dix dernières missions envoyées avec leur état.
- `POST /rejoindre { lien }` : colle un lien d'invitation. Instance sans nœud : `client.rejoindre`
  l'inscrit (nom `SIMATIS OS · <nom de l'instance>`, carte `carte({ … organisation: 'Simatis' })`),
  puis `writeInstanceSecret` du nœud et du secret ; sinon il accepte. Crée la ligne `partenaires`.
- `PATCH /:id { niveau?, partage? }` : niveau L0–L3 (stocké pour la brique 2), cases « Alpes OS
  voit » : Prospects, Rendez-vous, Affaires, Comptes rendus.
- `DELETE /:id` : coupe la connexion (le partenaire est averti).

Bandeau « simulation » quand le double verrou est fermé, comme sur l'écran Connexions.

## 10. Tests attendus

Avec `setupTestApp()` (`test/database.ts`) et le relais simulé du kit (`relaisSimule()`, passé en
`fetch` au client) :

- `rejoindre` : inscription par invitation, secrets écrits, ligne `partenaires` ; refus si double
  verrou fermé.
- `confier_mission` en simulation : mission `simulation`, rien chez le relais simulé ; en réel :
  mission dans la file, puis chez le relais après `vider`.
- État reçu : mission mise à jour, **un seul** sujet même si l'enveloppe est relevée deux fois ;
  état venu d'une autre connexion ignoré ; état final non remplacé par un état non final.
- `message` reçu (« plus tard ») : historique et sujet.
- `envoyer_donnee` refusée hors partage ; acceptée dans le partage, trace dans `donnees_envoyees`.
- Coupure reçue : partenaire `coupee`, sujet ; envoi vers un partenaire coupé : abandon, mission
  `failed`, sujet.
- Isolation RLS : une instance ne voit ni les partenaires ni les missions d'une autre
  (comme `src/db/isolation.test.ts`).
- Outils MCP avec un vrai client MCP (comme `src/mcp/server.test.ts`).
- Écran : `Partenaires.test.tsx` (jsdom), comme `Connexions.test.tsx`.

Essai de bout en bout, sans toucher à la production : relais local (`npm run e2e` du dépôt
`os-agents-relay` montre comment lancer `wrangler dev`) et une instance de test d'Alpes OS, ou deux
clients du kit dans un script.

## 11. Critères d'acceptation

1. Marc colle le lien d'invitation d'Alpes OS dans Paramètres › Partenaires : la connexion apparaît
   des deux côtés, sans toucher au code.
2. « Demande à Christophe un livre blanc sur … » dans le Claude de Marc : la mission part (double
   verrou ouvert) ; double verrou fermé, elle reste en simulation et rien ne part.
3. L'acceptation de Christophe dans Aujourd'hui revient comme sujet dans l'Inbox de Marc, une seule
   fois, avec le titre retenu.
4. SIMATIS OS éteint pendant que Christophe répond : l'état arrive au redémarrage, une seule fois.
5. `envoyer_donnee` ne fait partir que ce que « Alpes OS voit » autorise.
6. `npm run verify` vert ; aucune donnée réelle dans les tests.

## Questions pour Marc

1. Quelle instance porte la connexion avec AlpesIA : l'instance `propre`, ou une instance dédiée ?
   Le modèle ci-dessus marche pour n'importe laquelle (un nœud par instance).
2. Niveau par défaut de l'action `partenaire` : `L3` (l'agent envoie quand Marc le demande) ou `L2`
   (Marc valide chaque envoi dans l'Inbox) ?
