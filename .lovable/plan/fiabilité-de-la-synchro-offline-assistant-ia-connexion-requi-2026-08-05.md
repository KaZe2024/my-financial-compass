# Fiabilité de la synchro offline + Assistant IA "connexion requise"

Périmètre limité à deux sujets : la traçabilité des mutations hors ligne et le statut en ligne du module Assistant CFO IA.

## 1. Fiabilité de la synchronisation offline

État vérifié : le matching par IDs est **déjà en place** dans `src/lib/offline/sync.ts` — `pushSync` renvoie `appliedIds` / `failedIds`, et `flushPendingMutations` supprime exactement les mutations confirmées (plus de `slice(0, result.applied)`). Rien à corriger de ce côté.

Ce qu'il reste à faire : la **trace d'accusé de réception**, aujourd'hui absente. Une mutation réussie disparaît sans laisser d'historique, et une mutation coincée n'est identifiable que par son compteur de tentatives.

- Ajouter une table locale `syncAcks` dans `src/lib/offline/db.ts` : `mutationId`, `table`, `op`, `rowId`, `status` (`applied` | `failed`), `ackedAt` (timestamp), `error`, `attempts`. Version de schéma Dexie incrémentée (migration additive, aucune perte de cache existant).
- Dans `flushPendingMutations`, écrire un accusé pour chaque id renvoyé par le serveur (appliqué comme échoué), avec l'horodatage exact de la confirmation.
- Purge automatique : conserver les 500 derniers accusés (ou 14 jours) pour éviter que le journal grossisse indéfiniment.
- Exposer un diagnostic : dans les paramètres (ou le panneau hors ligne existant), une section "Journal de synchronisation" listant les dernières mutations avec leur statut, l'heure d'accusé, le nombre de tentatives et le message d'erreur, plus un compteur de mutations en attente et un bouton "Réessayer maintenant".
- Détection des mutations coincées : marquer visuellement toute mutation en file avec `retryCount >= 3` ou plus vieille que 24 h, afin de pouvoir la supprimer ou la relancer manuellement.

## 2. Assistant IA — module "connexion requise"

Choix retenu : **online only**, pour maîtriser le coût des appels IA (pas de file d'attente de messages, pas de dépenses différées non maîtrisées).

- Retirer `chat_conversations` et `chat_messages` de la liste des tables synchronisées afin que le module ne promette plus un fonctionnement hors ligne qu'il n'a pas (l'IA passe par des server functions, jamais par le cache local).
- Menu latéral (`src/components/app-shell.tsx`) : afficher un badge "Hors ligne" / icône désactivée sur l'entrée **Assistant CFO** quand le navigateur est hors ligne, via le hook existant `useNetworkStatus`.
- Écran `/ai` : quand hors ligne, afficher un bandeau clair "Connexion requise — l'assistant IA n'est pas disponible hors ligne", désactiver la zone de saisie et le bouton d'envoi, et masquer les actions qui déclencheraient un appel réseau.
- Reprise automatique : dès le retour de la connexion, réactiver la saisie sans rechargement de page.
- Même traitement pour les autres actions IA lancées ailleurs (génération du plan Coach, rapports IA) : bouton désactivé avec info-bulle "Connexion requise" plutôt qu'une erreur réseau brute.

## Détails techniques

- `src/lib/offline/db.ts` : nouvelle table `syncAcks` + helpers `recordSyncAck`, `listSyncAcks`, `pruneSyncAcks`.
- `src/lib/offline/sync.ts` : `flushPendingMutations` écrit les accusés, puis purge.
- `src/lib/offline/network-status.tsx` : réutilisation de `useNetworkStatus` / `useDebouncedOnline` (déjà présents), aucun nouveau hook.
- Aucune migration base de données nécessaire : tout le journal reste local (IndexedDB).

## Ce qui n'est pas touché

Les autres axes évoqués (recherche globale, actions groupées, réconciliation, stockage de fichiers, squelettes de chargement, purge du cache à la déconnexion) restent hors périmètre de ce plan.
