# Relais d'agents, brique 2 : profil CRM et messages libres

Statut : validée, en cours d'implémentation. Date : 30 octobre 2026.

## Le but

Le besoin de Marc est d'abord CRM. Chaque OS qu'il installe chez un client, et ceux de ses
partenaires (Alpes OS), doit partager le même suivi commercial que SIMATIS OS : entreprises,
contacts, affaires, tâches, rendez-vous, activités. Une modification faite d'un côté arrive de
l'autre, dans les deux sens, sans qu'une IA ait à interpréter un texte.

La brique 2 ajoute deux choses au-dessus de la brique 1, sans toucher au relais :

1. **Le profil CRM** : un format strict pour synchroniser les fiches du CRM entre deux OS.
2. **Les messages libres** : du texte Markdown échangé sans mission, comme le dossier `echanges/`
   de l'espace partagé, qu'ils remplacent.

Elle complète aussi les missions : SIMATIS OS reçoit désormais des missions, et Alpes OS en envoie.

## Décisions de départ (Christophe, 30/10/2026)

- **Le modèle SIMATIS OS fait foi.** Le format d'échange reprend ses objets et ses champs
  (`src/crm/schema.ts`, inspiré de HubSpot). Chaque CRM tiers et chaque OS partenaire s'y adapte.
- **Synchronisation dans les deux sens.**
- **Plusieurs CRM prévus, aucun nouveau codé** : la brique 2 décrit comment brancher un CRM
  (HubSpot est déjà là), elle n'en ajoute pas.
- **Ce que voit un partenaire se règle par entreprise cliente** : Alpes OS ne voit que ce qui
  concerne AlpesIA, et il en ira de même pour chaque client de Marc.
- **AlpesIA a déjà son instance client** dans SIMATIS OS : c'est elle qui porte la connexion.
- **Les missions vont dans les deux sens** dès cette brique : Alpes OS peut aussi confier une mission à Marc.
- **Le vrai essai** se fait sur le vrai relais, mené par Marc, une fois la brique 2 livrée : on
  développe SIMATIS OS pour lui, il met sa version à jour.

## Libre et structuré : deux usages

| | Message libre | Profil CRM |
|---|---|---|
| Contenu | Texte Markdown, liens | Fiches à champs fixes |
| Lu par | Une personne ou son agent | La base de l'autre OS, sans IA |
| Exemple | « Voici le compte rendu de l'atelier, qu'en penses-tu ? » | Affaire passée en négociation, 12 000 €, échéance au 15/12 |
| Ce qu'il en reste | Un sujet de l'Inbox, une note | La fiche à jour des deux côtés |

Un texte suffit pour discuter. Pour que deux CRM restent identiques, il faut des champs : une IA
qui devine une étape ou un montant dans un texte se trompe parfois, et l'erreur se propage.

## Qui partage quoi : l'instance du client

Dans SIMATIS OS, chaque client de Marc a son instance (type `mandat`), isolée des autres par la
base (RLS). **La connexion avec l'OS d'un client est portée par l'instance de ce client** :
la connexion avec Alpes OS vit dans l'instance AlpesIA. Le partage ne peut donc rien envoyer d'une
autre instance, par construction.

Ce choix remplace le défaut de la brique 1 (instance `propre`).

Réglages de la connexion, côté expéditeur (« Alpes OS voit ») :

- **Objets partagés** : entreprises, contacts, affaires, tâches, rendez-vous, activités. Tous cochés par défaut.
- **Champs exclus** : comme les champs exclus de la synchro HubSpot (téléphone, montant…).
- **Qualification d'une affaire** (qualification, potentiel, faisabilité) : Marc en est responsable
  et décide, connexion par connexion, de la partager avec le client. Case non cochée par défaut.
- Les rendez-vous qui ne sont pas des rendez-vous commerciaux (`statut` autre que `rdv`) ne partent jamais.

Côté Alpes OS, rien d'autre ne part que les fiches reçues de cette connexion et celles que
Christophe y crée : ses autres clients ne quittent jamais Alpes OS.

## Le profil CRM

### Les objets

Les noms sont ceux de SIMATIS OS. `*` = obligatoire.

| Objet | Champs | Liens |
|---|---|---|
| `entreprise` | `nom`*, `secteur`, `ville`, `taille`, `domaine` | |
| `contact` | `nom`*, `fonction`, `email`, `emails` (les autres adresses), `telephone`, `role` | `entreprises` |
| `affaire` | `titre`*, `etape`*, `montant` (euros, entier), `echeance`, `clos` (`gagne` \| `perdu`), `motif`, `proprietaire` (nom affiché), `origine`, `prochaine_etape`, `mode_facturation` (`spot` \| `recurrent`), `duree_engagement_mois`, `tacite_reconduction`, `probabilite_manuelle`, `derniere_activite`, `etapes_dates` ; si la qualification est partagée : `qualification` (`{ besoin, decideur, budget, timing, engagement }`, entiers), `potentiel`, `faisabilite` | `contacts`, `entreprises` |
| `tache` | `titre`*, `type`* (`appel`, `email`, `tache`, `reunion`, `echeance`, `dejeuner`), `echeance`, `avec_heure`, `duree_minutes`, `occupe`, `fait_at`, `notes` | `contact`, `entreprise`, `affaire` |
| `rendez_vous` | `titre`*, `debut`*, `fin`, `lieu`, `compte_rendu`, `compte_rendu_at` | `contacts`, `entreprises`, `affaires` |
| `activite` | `type`* (`note`, `appel`, `email`, `reunion`), `at`*, `titre`, `resume` | `contact`, `entreprise`, `affaire` |
| `pipeline` | `etapes` : liste de `{ id, libelle, ordre, clos, gagne, probabilite }` | |

- Un lien multiple est une liste de références, la première étant le lien principal (comme
  `principal` dans les tables de liens de SIMATIS OS).
- `pipeline` voyage une fois à la connexion puis à chaque changement : l'autre côté affiche et
  propose les mêmes étapes. Une `etape` d'affaire est l'`id` d'une de ces étapes.
- Ne voyagent jamais : l'`event_id` Google d'un rendez-vous et la liste brute de ses invités (on
  envoie les contacts liés), les identifiants HubSpot, `instance_id`, `source`, `source_id`.
- Chaque OS peut ajouter des champs à lui, préfixés `x_` (`x_alpes_projet`). L'autre côté les garde
  sans les interpréter.

### L'identité d'une fiche

Chaque fiche partagée a une **référence** stable : `<nœud d'origine>/<id local>`. L'OS qui la
reçoit la range avec `source = 'partenaire:<connexion>'` et `source_id = <référence>` (les colonnes
qui servent déjà à la copie HubSpot). Quand une modification revient, l'OS d'origine reconnaît son
propre nœud dans la référence et retrouve sa fiche.

### L'enveloppe

Le type d'enveloppe `donnee` de la brique 1 change de contenu : il porte désormais un lot de
changements du profil CRM (les quatre objets libres de la brique 1 disparaissent, ils n'ont pas
été mis en service). Le relais ne change pas.

```json
{ "profil": "crm/1",
  "changements": [
    { "objet": "affaire",
      "ref": "noeud-simatis/2f6c…",
      "action": "maj",
      "modifie_le": "2026-11-04T09:42:00Z",
      "champs": { "etape": "negociation", "montant": 12000 },
      "liens": { "contacts": ["noeud-simatis/9a1e…"] } }
  ],
  "instantane": { "id": "uuid", "page": 1, "pages": 3 } }
```

- `action` : `maj` (crée la fiche si elle n'existe pas) ou `supprime`.
- `champs` : seulement les champs qui ont changé. `null` vide un champ. Un champ absent ne change rien.
- `liens` : la liste complète du lien quand elle a changé.
- `instantane` : présent seulement pendant l'envoi initial (voir plus bas).
- Un lot reste sous 256 Ko ; au-delà, l'OS coupe en plusieurs enveloppes, dans l'ordre.

### La synchronisation

**À la connexion**, chaque côté envoie un instantané de ce qu'il partage (`pipeline` d'abord, puis
entreprises, contacts, affaires, et le reste). Ensuite, seulement les changements.

**Repérer un changement.** Chaque OS garde, par connexion et par fiche partagée, le dernier état
échangé (table `crm_partages` dans SIMATIS OS, fichier JSON dans Alpes OS). Toutes les minutes, avec
la relève, il compare ses fiches modifiées depuis le dernier passage à cet état et n'envoie que la
différence. Une passe complète par jour rattrape ce qui aurait échappé (liens retirés, fiches
effacées).

- Côté SIMATIS OS, cela suppose que `updated_at` bouge à chaque modification, quel que soit le
  chemin : un déclencheur Postgres sur les tables du CRM et leurs tables de liens le garantit.
- **Pas d'écho** : une modification reçue met aussi à jour le dernier état échangé ; elle ne repart
  donc pas.

**Deux modifications du même champ.** Si un champ a changé des deux côtés depuis le dernier
échange, la modification la plus récente (`modifie_le`) gagne des deux côtés. L'autre valeur
n'est pas perdue : un sujet de l'Inbox (SIMATIS OS) ou une note de la page Connexions (Alpes OS)
la montre. Deux champs différents modifiés en même temps ne sont pas un conflit.

**Suppression.** Une fiche effacée d'un côté envoie `supprime`. L'autre côté ne supprime jamais
seul (c'est un garde-fou fixe) : la fiche est détachée du partage et une question arrive
(« Affaire X supprimée chez Simatis : la supprimer ici aussi ? »). Même règle à la coupure d'une
connexion : rien n'est effacé, on propose de faire le ménage.

**Ordre et rattrapage.** Ceux de la brique 1 : la file d'envoi garde l'ordre par connexion, un OS
éteint reçoit tout au redémarrage, une seule fois.

### Le chemin vers le CRM du client

Une modification reçue d'un partenaire suit **le même chemin qu'une modification faite par Marc
dans l'OS**. Si l'instance est synchronisée avec le CRM du client dans les deux sens, elle y part,
sous le même double verrou (`REAL_WRITES` + interrupteur de l'instance). Le partenaire n'écrit
jamais directement dans le CRM du client.

## Brancher un autre CRM

Aucun nouveau CRM n'est codé en brique 2. Le profil fixe ce qu'un futur connecteur (Odoo,
Pipedrive, Salesforce…) doit faire pour que tout le reste marche sans changement :

- Implémenter l'interface `Connector` de SIMATIS OS (`sync`, `write`, `verify`), comme HubSpot.
- Copier vers les tables du CRM de SIMATIS OS avec `source = '<fournisseur>'` et l'identifiant du
  CRM dans `source_id`, sans jamais effacer.
- N'écrire que les champs présents dans la réponse du CRM (un champ absent ne change rien).
- Déclarer ses étapes dans les réglages de la connexion (même forme que les étapes HubSpot).
- Respecter les champs exclus.

Livrable : une page « Ajouter un CRM » dans la documentation de SIMATIS OS, qui reprend ces règles
et la correspondance HubSpot comme exemple.

## Les messages libres

Un message libre est une enveloppe `message` qui ne se rattache à aucune mission. Il reprend les
règles du dossier `echanges/` de l'espace partagé.

```json
{ "kind": "message",
  "parts": [{ "kind": "text", "text": "Texte en **Markdown**, liens compris." }],
  "metadata": { "type": "question | reponse | info",
                "sujet": "Une ligne",
                "en_reponse_a": "id du message d'origine, pour une réponse" } }
```

- Un message ne se modifie plus une fois parti ; on répond par un autre message.
- Un fichier ne voyage pas : le message porte un lien (espace partagé, Drive).
- **SIMATIS OS** : un message reçu devient un sujet de l'Inbox. Outil MCP
  `envoyer_message(partenaire, type, sujet, texte, en_reponse_a?)`. Il suit le niveau d'autonomie
  que Marc a réglé pour les envois aux partenaires (L0 à L3), comme les autres actions de SIMATIS OS.
- **Alpes OS** : un message reçu apparaît dans la fiche du partenaire (page Connexions) ; une
  question arrive aussi dans Aujourd'hui. Christophe répond depuis la fiche ou par l'assistant.
- Une fois en service, le dossier `echanges/` de l'espace partagé n'est plus utilisé. L'espace
  reste la bibliothèque de documents.

## Les missions dans les deux sens

La brique 1 ne faisait partir les missions que de SIMATIS OS vers Alpes OS. La brique 2 ouvre
l'autre sens, avec les mêmes règles (format A2A, quatre niveaux d'autonomie, garde-fous fixes).

- **SIMATIS OS reçoit** : selon le niveau réglé par Marc sur la connexion (déjà stocké en brique 1,
  colonne `niveau` de `partenaires`), la mission devient une proposition de l'Inbox (L0, L1), est
  préparée par l'agent puis validée par Marc (L2), ou est faite seule (L3). Accepter, refuser ou
  clore renvoie l'état à Alpes OS. Les garde-fous fixes s'appliquent par les outils, comme pour
  les autres actions de SIMATIS OS.
- **Alpes OS envoie** : « Confier une mission » dans la fiche du partenaire (titre, consigne,
  échéance), et un outil de l'assistant pour le faire en conversation. Les états reçus mettent à
  jour la mission dans la fiche ; une mission terminée ou refusée arrive aussi dans Aujourd'hui.

## Le kit

Nouveau module `crm.js`, utilisable par tout OS :

- les objets, champs, types et liens du profil `crm/1`, et leur validation ;
- `changement()`, `lot()` et `lireLot()` pour fabriquer et lire une enveloppe ;
- `difference(dernierEtat, ficheCourante)` : les champs et liens à envoyer ;
- `fusionner(dernierEtat, local, recu)` : ce qu'on applique, et les conflits à signaler ;
- `decouper(changements)` : des lots sous 256 Ko, dans l'ordre.

Le module des messages gagne `messageLibre()` et `lireMessageLibre()`. Le relais simulé du kit
sert aux tests des deux OS.

## Côté SIMATIS OS

- La connexion se crée depuis l'instance du client (écran Paramètres › Partenaires de l'instance).
- Table `crm_partages` (connexion, objet, id local, référence, dernier état échangé), isolée par instance.
- Déclencheur `updated_at` sur les tables du CRM et leurs tables de liens.
- Boucle : relève, application des changements reçus, repérage et envoi des changements locaux.
- Fiches reçues rangées avec `source = 'partenaire:<connexion>'`.
- Réglages « … voit » : objets et champs exclus (remplace les quatre cases de la brique 1).
- Inbox : conflits, suppressions à confirmer, messages libres.
- Outils MCP : `envoyer_message` ; `envoyer_donnee` disparaît (la synchro est automatique).
- Missions reçues : voir « Les missions dans les deux sens ».

## Côté Alpes OS

Alpes OS n'a pas de CRM : il garde une **copie** du suivi commercial partagé, au format du profil.

- Fichiers JSON par connexion dans `output/crm/`, écriture atomique, comme le reste.
- **Vue « Suivi commercial »** du partenaire : affaires par étape, et pour chaque affaire ses
  contacts, rendez-vous, tâches et activités. Maquette à faire avant le code.
- Ce que Christophe peut y faire, et qui repart chez Marc : changer l'étape, le montant,
  l'échéance ou la prochaine étape d'une affaire ; ajouter une note, un compte rendu de
  rendez-vous ou une tâche ; ajouter un contact.
- L'assistant d'Alpes OS lit cette copie (« où en est la prospection AlpesIA ? ») et peut préparer
  ces modifications, que Christophe valide.
- Second cerveau : seulement les faits marquants (affaire gagnée ou perdue, rendez-vous pris,
  compte rendu), par événement dans la file du curateur. Le reste vit dans la copie, pour ne pas
  noyer le curateur.
- Messages libres et missions envoyées : voir plus haut.

## Données personnelles

Les contacts sont des données personnelles qui passent d'une entreprise à une autre.

- On n'envoie que l'utile : champs exclus, objets décochés.
- Le relais ne garde rien après la relève (brique 1), dans une base en Europe.
- Une suppression se propage sous forme de question (voir plus haut) : une demande d'effacement
  faite chez l'un arrive chez l'autre.
- Avant l'installation chez un client de Marc : chiffrement de bout en bout (le relais ne lit plus
  les contenus) et une ligne sur ce partage dans le contrat client. Voir « Hors brique 2 ».

## Livraison

1. Merger la brique 1 (relais et kit déjà sur `main` ; Alpes OS `ChristopheHvd/alpes-os#29` ;
   SIMATIS OS `SIMATIS-Admin/SIMATIS-OS#184`).
2. Kit : profil CRM et messages libres, avec tests.
3. SIMATIS OS : tout ce qui précède, branche depuis `main`, PR, CI verte, merge. Marc met à jour son installation.
4. Alpes OS : maquette de la vue « Suivi commercial », puis le code.
5. Le vrai essai, mené par Marc sur le vrai relais : son instance AlpesIA ↔ l'Alpes OS de Christophe.

## Hors brique 2

- Nouveaux connecteurs CRM (Odoo…) : quand un client en aura besoin.
- Chiffrement de bout en bout : avant la première installation chez un client de Marc.
- Livraison immédiate (connexion permanente) au lieu de la relève par minute.

## Critères d'acceptation

1. Connexion depuis l'instance AlpesIA : Alpes OS reçoit tout le suivi commercial de cette
   instance, et rien d'une autre.
2. Marc change l'étape d'une affaire : Christophe la voit à jour en moins de deux minutes.
3. Christophe ajoute un compte rendu et change une étape : Marc les voit dans la fiche ; si
   l'instance écrit dans le CRM du client (double verrou ouvert), ils y arrivent aussi.
4. Le même champ modifié des deux côtés : la valeur la plus récente gagne partout, l'autre est signalée.
5. Une suppression d'un côté devient une question de l'autre ; rien n'est effacé seul.
6. Un champ exclu ou un objet décoché ne part jamais ; un champ interne non plus.
7. Un OS éteint rattrape tout au redémarrage, une seule fois, dans l'ordre ; une modification reçue
   ne repart pas.
8. Un message libre en Markdown passe dans les deux sens et se range au bon endroit.
9. Christophe confie une mission à Marc depuis Alpes OS : elle suit le niveau réglé par Marc, et
   son état revient dans la fiche du partenaire.
10. Tests verts des deux côtés, avec des données fictives uniquement.

## Réponses de Christophe pour Marc (30/10/2026)

1. AlpesIA a déjà son instance client dans SIMATIS OS : elle porte la connexion.
2. Qualification, potentiel, faisabilité : responsabilité de Marc, partageables avec le client si
   Marc le décide (réglage de la connexion).
3. Envoi d'un message par l'agent de Marc : selon le niveau d'autonomie réglé par Marc.
4. Missions reçues par SIMATIS OS : dans cette brique.
