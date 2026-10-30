# Relais d'agents, brique 1

Statut : implémentée (relais, kit, Alpes OS en PR), à valider. Date : 29 octobre 2026, mise à jour le 30.

## Le but

Deux OS d'entreprise (Alpes OS, SIMATIS OS, puis les outils livrés aux clients de Marc) se
connectent l'un à l'autre en quelques clics, et leurs agents se confient des missions.
Chaque côté règle une fois jusqu'où son agent va sans demander. Une machine éteinte ne perd
rien : les missions l'attendent et arrivent quand elle se rallume.

Ce que Marc installera chez un client doit être exactement ce qui relie Alpes OS et SIMATIS OS.

## Les trois pièces

| Pièce | Où | Rôle |
|---|---|---|
| **Relais** | Cloudflare Worker + D1, `relais.alpes-ia.fr` | Annuaire, invitations, boîtes aux lettres. Garde une mission jusqu'à ce que le destinataire l'ait relevée, puis l'efface. |
| **Kit de connexion** | Ce dépôt, paquet installé dans chaque OS | Inscription, invitations, relève et envoi, file d'attente, règles d'autonomie. |
| **Langue commune** | Format A2A | Une mission = une tâche A2A (consigne, messages, résultat, état). |

Pourquoi un relais plutôt qu'un tunnel : aucun OS n'ouvre de porte sur Internet (les deux ont
des API locales sans authentification), la file d'attente est au même endroit pour tout le monde,
et chez un client il n'y a rien à installer côté réseau.

A2A sert ici de **format** : on reprend ses objets (carte d'agent, tâche, message, résultat,
états) sans exposer chaque OS en serveur A2A. Le relais pourra plus tard servir de porte A2A
publique pour un OS local (voir « Plus tard »).

## Vocabulaire

- **Nœud** : un OS inscrit au relais. Côté SIMATIS OS, un nœud = une instance.
- **Connexion** : le lien accepté entre deux nœuds. Symétrique, coupable par l'un ou l'autre.
- **Mission** : une demande d'un agent à l'autre. Une tâche A2A.
- **Donnée** : une information poussée par un partenaire sans rien demander (nouveau prospect,
  rendez-vous pris, affaire gagnée ou perdue, compte rendu). Un message A2A avec une partie `data`.
  Elle se range seule : aucun niveau d'autonomie ne s'applique, puisque rien n'est exécuté.
- **Enveloppe** : ce qui transite par le relais (une mission, un changement d'état, un message).
- **Niveau d'autonomie** : réglé par chaque côté, pour chaque connexion, sur les missions qu'il reçoit.

## Niveaux d'autonomie

Un seul réglage par connexion, sur les missions reçues. Les types de mission ne sont pas connus
à l'avance, donc on ne règle pas mission par mission.

| Niveau | Ce que fait l'agent qui reçoit | Repère SIMATIS OS |
|---|---|---|
| Me montrer seulement | Rien. La mission arrive dans la boîte de réception ; l'humain la traite. | L0 |
| Demander avant | Demande l'accord avant de commencer. Refus = mission refusée. | L1 |
| Faire, puis valider | Prépare le résultat. Rien ne repart sans l'accord de l'humain. | L2 |
| Faire seul | Fait et répond seul. | L3 |

**Garde-fous fixes**, quel que soit le niveau : prix, devis ou engagement ; envoi à un client ou
un prospect ; publication ; suppression. Ils ne reposent pas sur la lecture de la mission :
l'agent qui l'exécute n'a pas les outils pour faire ces gestes. Il prépare (un brouillon, une
proposition) et la décision remonte à l'humain. C'est déjà la règle de SIMATIS OS (autonomie
verrouillée, double verrou) et des délégations d'Alpes OS (outils restreints, brouillons seulement).

## Déroulé d'une mission : le livre blanc

1. Marc, dans son Claude branché sur SIMATIS OS : « Demande à Christophe un livre blanc sur … ».
   L'agent appelle l'outil MCP `confier_mission(partenaire, consigne)`.
2. SIMATIS OS range la mission dans sa file d'envoi, puis la poste au relais (état `submitted`).
3. Alpes OS la relève au démarrage puis toutes les minutes, l'enregistre, acquitte. Le relais l'efface.
4. Niveau de la connexion Simatis = « Faire, puis valider » : Alpes OS lance une délégation
   (outils restreints) avec la skill `livre-blanc`. État `working`, renvoyé à Marc.
5. La proposition (sujet, plan, date) arrive dans le bloc Propositions d'Aujourd'hui, à côté des
   suggestions de la revue horaire. Christophe ajuste le titre et accepte : elle devient une tâche
   de sa journée, et la réponse repart chez Marc (« acceptée, livraison le … »).
6. Plus tard, le livre blanc fini est publié dans l'espace partagé ; la mission se clôt
   (`completed`) avec le lien. Marc le voit dans son Inbox.

Si Alpes OS est éteint à l'étape 3, la mission attend au relais. Si le relais est injoignable à
l'étape 2, elle attend dans la file d'envoi de SIMATIS OS.

## Les données poussées

Remplacées par le profil CRM de la brique 2 (`docs/spec-brique-2.md`), avant leur mise en service.

Une donnée décrit un fait du suivi commercial, en champs fixes pour que chaque OS la range sans IA :

```json
{ "objet": "prospect | rendez_vous | affaire | compte_rendu",
  "evenement": "cree | modifie | gagne | perdu",
  "ref": "id stable chez l'expéditeur",
  "champs": { "entreprise": "…", "ville": "…", "etape": "…", "date": "…", "resume": "…" } }
```

- L'expéditeur n'envoie que ce que son réglage de partage autorise (« Simatis voit » / « Alpes OS voit »).
- Côté Alpes OS : la donnée est gardée dans la base locale (liste « Données reçues » de la page
  Connexions) et produit un événement dans la file du curateur, qui met à jour la fiche prospect
  ou client du second cerveau. Même `ref` = même fiche.
- Brique 1 : le format, la réception, et l'outil MCP `envoyer_donnee` dans SIMATIS OS (l'agent de
  Marc pousse une donnée quand Marc le lui demande). L'envoi automatique à chaque changement du
  suivi de Marc vient en brique 2 : SIMATIS OS n'a pas encore de journal des changements exploitable
  (son journal ne garde ni identifiants ni valeurs).

## Le relais

Cloudflare Worker et base D1, comme le site alpes-ia.fr. Gratuit au volume visé (quelques
dizaines de missions par jour).

**Ce qu'il garde** : les nœuds (id, nom, carte d'agent, empreinte du secret), les invitations,
les connexions, les enveloppes **non encore relevées**. Une enveloppe est effacée dès son
acquittement ; non relevée après 30 jours, elle est effacée et l'expéditeur en est averti.

**Authentification** : chaque nœud a un secret (32 octets aléatoires), montré une fois, stocké
haché (SHA-256) côté relais, comme les jetons de SIMATIS OS. En-tête `Authorization: Bearer`.

**Inscription d'un nœud** : avec la clé d'inscription du relais (secret Cloudflare, pour le premier
nœud d'une entreprise) ou en acceptant une invitation. Pas d'inscription ouverte.

**API**

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/sante` | État du relais (sans authentification) |
| POST | `/noeuds` | Inscription (clé d'inscription ou code d'invitation) → id + secret |
| GET | `/noeuds/moi` | Mon nœud (vérifie l'identité) |
| PUT | `/noeuds/moi/carte` | Publier sa carte d'agent |
| DELETE | `/noeuds/moi` | Désinscription : connexions coupées, partenaires avertis |
| POST | `/invitations` | Créer une invitation (option : e-mail du destinataire) → code, lien, expiration 7 j |
| POST | `/invitations/:code/accepter` | Accepter → connexion créée, l'invitant est averti |
| GET | `/connexions` | Mes connexions et la carte de chaque partenaire |
| DELETE | `/connexions/:id` | Couper la connexion (l'autre côté est averti) |
| POST | `/envois` | Poster une enveloppe sur une de mes connexions ; un `id` fourni rend le renvoi idempotent |
| GET | `/boite?apres=<curseur>` | Relever mes enveloppes : `{ enveloppes, curseur, suite }`, 100 par page |
| POST | `/boite/acquitter` | Acquitter (`ids`) → effacement |

Le lien d'invitation a la forme `https://relais.alpes-ia.fr/invitations/<CODE>` (24 caractères base32) :
c'est lui qu'on colle dans l'autre OS. Une enveloppe déposée par le relais lui-même (avis d'échec
après 30 jours) porte `de: "relais"`. Taille maximale d'une enveloppe : 256 Ko. Un fichier ne transite pas par le relais : la mission
porte un lien (espace partagé, Drive).

**Enveloppe**

```json
{
  "id": "uuid",
  "connexion": "uuid",
  "de": "noeud-id",
  "a": "noeud-id",
  "type": "mission | etat | message | donnee | connexion",
  "corps": { "…": "objet A2A : Task, TaskStatusUpdate ou Message" },
  "cree_le": "2026-11-04T09:42:00Z"
}
```

## Le kit de connexion

Un paquet JavaScript (ESM, sans build, types fournis) publié depuis ce dépôt, installé dans chaque
OS. Il ne connaît ni Postgres ni fichiers : chaque OS lui fournit son stockage par une petite interface.

- **Client du relais** : inscription, carte d'agent, invitations, connexions.
- **Relève** : au démarrage puis toutes les 60 s. Enregistre les enveloppes (idempotent sur `id`),
  puis acquitte, seulement après l'enregistrement. Même principe que la relève des demandes du
  site dans SIMATIS OS.
- **Envoi** : file d'envoi locale, nouvel essai avec délai croissant tant que le relais ne répond pas.
- **Autonomie** : à la réception, renvoie la première étape selon le niveau (montrer, demander,
  préparer, faire). L'exécution reste à l'OS.
- **Types** : `Mission`, `Etat`, `CarteAgent`, `Niveau`, `Enveloppe`, alignés sur A2A.

Le dépôt contient aussi `relais/` (le Worker) et cette spec.

## Qui stocke quoi

| Où | Ce qui y vit |
|---|---|
| Relais | Seulement ce qui transite, effacé à la relève. Plus l'annuaire (nœuds, connexions, invitations). |
| SIMATIS OS (Postgres, par instance) | Partenaires, missions envoyées et reçues, file d'envoi. Les retours deviennent des sujets de l'Inbox et des lignes du journal. Le CRM reste dans ses tables. |
| Alpes OS (fichiers JSON dans `output/`) | Partenaires, réglages d'autonomie, missions, données reçues, file d'envoi. Même principe que les propositions. |
| Second cerveau | Le savoir qui en sort : fiches prospects et clients mises à jour par les données reçues, « Marc a demandé le livre blanc n° 3, livré le … ». Par événements dans la file du curateur, comme aujourd'hui. |
| Espace partagé (kDrive) | Les documents communs : offre, tarifs, pitch, livres blancs, comptes rendus. Les missions y renvoient par lien. Alpes OS l'affiche dans l'onglet Second brain (« Partagé avec Marc »). |

L'espace partagé reste la **bibliothèque commune**. Son dossier `echanges/` (questions et réponses,
un fichier par message) est remplacé par les missions une fois la brique 1 en service.

## Côté SIMATIS OS (brique 1)

- Tables `partenaires` et `missions` (isolées par instance, comme le reste).
- Outils MCP : `confier_mission`, `missions_partenaires`, `envoyer_donnee`.
- Les changements d'état d'une mission envoyée deviennent des sujets de l'Inbox.
- Écran minimal : coller un lien d'invitation, voir la connexion, régler le niveau d'autonomie.
- Brique 1 : SIMATIS OS envoie des missions et reçoit leurs états. La réception de missions vient en brique 2.

## Côté Alpes OS (brique 1)

- Fichiers JSON dans `output/`, écriture atomique, comme `lib/propositions.js` : partenaires,
  missions, données reçues, file d'envoi.
- Page Connexions sous l'onglet Outils (maquette : https://claude.ai/artifact/CjxVHbY2qSe3AEEExog1Nb).
- Une mission reçue devient une **proposition** du bloc Propositions d'Aujourd'hui, le même que la
  revue horaire (`lib/propositions.js`, en cours de refonte : relire son format sur `main` avant de
  brancher le kit). Champs : `source: 'mission'`, `from: 'Marc · SIMATIS OS'`, `title`, `why`.
- Selon le niveau de la connexion :

  | Niveau | Ce qui arrive dans Propositions |
  |---|---|
  | Me montrer seulement | La consigne de Marc, telle quelle. |
  | Demander avant | La consigne ; Accepter lance la délégation, qui répondra seule. |
  | Faire, puis valider | Le résultat préparé par la délégation (`why` le résume). |
  | Faire seul | Rien : la mission se range dans « Missions terminées » de la page Connexions. |

- Les trois gestes du bloc renvoient l'état à Marc : **Accepter** → tâche du jour, mission
  `working` avec le titre retenu (`resultat.titre`) ; **Plus tard** → rangée dans « Plus tard »,
  Marc est prévenu par un `message` ; **Ignorer** → mission `rejected`. En « Demander avant »,
  Accepter lance la délégation sans ajouter de tâche. Une mission acceptée comme tâche se clôt
  depuis la page Connexions (« Marquer faite » → `completed`, avec un message, un lien par exemple).
- Une mission reçue est exécutée par une délégation aux outils restreints (`--strict-mcp-config`),
  jamais par le chat principal.

## Sécurité

- Une mission reçue est une demande, jamais une consigne de confiance : son texte entre dans le
  prompt de l'agent comme une donnée, balisée comme telle.
- Aucune porte ouverte sur les machines : les OS appellent le relais, jamais l'inverse.
- Secrets dans `.env` (SIMATIS OS) ou `credentials/` (Alpes OS), jamais dans git.
- Le relais ne garde pas les contenus au-delà de la relève.

## Hors brique 1

- Missions CRM (mettre à jour une affaire, état du pipeline AlpesIA) : brique 2.
- Envoi automatique des données à chaque changement du suivi de Marc : brique 2.
- Missions d'Alpes OS vers SIMATIS OS : brique 2.
- Chiffrement de bout en bout (le relais ne lit plus les contenus) : brique 2.
- Livraison immédiate par connexion permanente (WebSocket) à la place de la relève par minute.
- Porte A2A publique sur le relais, pour qu'un agent externe parle à un OS local.
- Installation chez un client de Marc : après la brique 2.

## Critères d'acceptation

1. Le relais est en ligne, couvert par des tests (Vitest, environnement Workers).
2. Alpes OS et une instance SIMATIS OS se connectent par invitation, sans toucher au code.
3. Marc confie un livre blanc ; la proposition arrive dans Aujourd'hui ; la validation de
   Christophe revient dans l'Inbox de Marc.
4. Alpes OS éteint pendant l'envoi : la mission arrive au redémarrage, une seule fois.
5. Les quatre niveaux d'autonomie se comportent comme décrit ; aucun garde-fou ne peut être franchi
   par une mission, quel que soit le niveau.

## Questions ouvertes

1. Côté SIMATIS OS, quelle instance porte la connexion avec AlpesIA : l'instance propre, ou une
   instance dédiée ?
2. ~~Données en Europe~~ : base D1 créée avec `--jurisdiction eu` (30/10/2026).
3. ~~Nom du dépôt et du paquet~~ : `os-agents-relay` (29/10/2026).
4. ~~Stockage d'Alpes OS~~ : fichiers JSON dans `output/`, comme les propositions (29/10/2026).

## Décisions prises à l'implémentation (30/10/2026)

- Une donnée est un message A2A à une seule partie `data` (`objet`, `evenement`, `ref`, `champs`) ;
  le titre d'une mission voyage dans `metadata.titre` de la tâche A2A.
- La relève acquitte sans la traiter une enveloppe mal formée (sinon elle reviendrait sans fin) ;
  l'OS est prévenu par un rappel `invalide`.
- La file d'envoi garde l'ordre par connexion, réessaie (1 min → 1 h) tant que l'erreur est passagère
  (réseau, 408, 429, 5xx) et abandonne sur un refus définitif (connexion coupée…) ou après 30 jours.
- Côté Alpes OS, une donnée va dans la fiche client seulement si le nom d'entreprise correspond
  exactement ; sinon un événement autoportant laisse le curateur décider. Les valeurs du partenaire
  y figurent en bloc de données, jamais comme consignes.
- Le kit fournit un relais simulé en mémoire (`relaisSimule`) pour les tests de chaque OS.
