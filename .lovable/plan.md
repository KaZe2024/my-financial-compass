# Plan de consolidation OPTIS — Vague 5

Objectif : corriger les failles de fiabilité, de sécurité et de friction identifiées après les vagues 1-4, sans repartir sur de nouveaux gros modules.

## 1. Fiabilité de la synchronisation offline

- Corriger le matching des mutations dans `src/lib/offline/sync.ts` : `flushPendingMutations` doit supprimer les mutations appliquées d'après leurs IDs retournés par le serveur, et non pas par tranche d'index (`slice(0, result.applied)`). Risque actuel : perte silencieuse de données si une mutation du milieu échoue.
- Ajouter une trace d'accusé de réception par mutation (id + timestamp) pour pouvoir identifier les mutations coincées.

## 2. Sécurité offline

- Appeler `resetOfflineData()` lors de la déconnexion utilisateur (`src/hooks/use-auth.ts`) pour qu'un appareil partagé ne conserve pas les données IndexedDB du précédent compte.
- Scoper les lignes de `syncedDataDb` par `user_id` : ajouter le champ `userId` dans `SyncedRow`, filtrer toutes les lectures/écritures par `auth.uid()`, et forcer un reset lors d'un changement d'utilisateur.

## 3. Assistant IA en offline

- Choix : soit rendre l'IA utilisable hors ligne (mise en file des messages + sync différée), soit marquer clairement le module IA comme "online only" dans le menu et l'écran.
- Privilégier l'option "online only" si le cout des appels IA est un enjeu : afficher un badge `Connexion requise` et bloquer la saisie quand le navigateur est offline.

## 4. Recherche globale / palette de commandes

- Ajouter une barre de recherche en haut de l'app-shell ou un raccourci `Ctrl+K` (Cmd+K) qui ouvre une palette de commandes.
- Couvrir : navigation vers les modules, recherche de transactions, tiers, actifs, dettes, créances, objectifs, projets.
- Amélioration directe : remplacer le long menu latéral de 32 items par un accès rapide clavier.

## 5. Actions groupées (bulk actions)

- Étendre les actions multi-sélection aux modules actuellement en ligne par ligne :
  - Dettes / Créances : marquer "payé / reçu", archiver, changer le tiers.
  - Abonnements : activer / suspendre / changer catégorie en masse.
  - Actifs : archiver / changer type / taguer en masse.
  - Objectifs : marquer en pause / reprendre / archiver en masse.
  - Provisions : clôturer / reporter en masse.

## 6. États de chargement cohérents

- Standardiser les squelettes (`Skeleton`) sur les ~27 routes authentifiées qui n'en ont pas encore.
- Cible : plus d'écran blanc lors du premier chargement, notamment sur mobile.

## 7. Réconciliation bancaire (workflow léger)

- Ajouter une page / onglet de réconciliation dans le module Transactions.
- Permettre d'importer un relevé bancaire (CSV), de matcher automatiquement les lignes avec les transactions existantes (date + montant + tiers), et de marquer les transactions comme "réconciliées".

## 8. Documents et pièces jointes avec vrai stockage

- Utiliser Supabase Storage pour les fichiers associés aux documents (`documents` et `attachments`).
- Garder les tables métier comme métadonnées (nom, type, taille, chemin) et stocker les blobs côté Storage.
- Fonctionnalité : upload, preview, suppression.

## Livrables attendus

- Corrections sans régression des modules existants.
- Tests visuels sur les modules modifiés (offline, auth, recherche, bulk).
- Aucune nouvelle table inutile si l'option IA retenue est "online only".

## Questions à trancher

1. IA : offline différé ou "online only" ? (recommandation : online only pour maîtriser les crédits IA)
2. Réconciliation bancaire : format CSV prioritaire à supporter ?
3. Documents : taille max de fichier et types MIME acceptés ?
