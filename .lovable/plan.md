Plan : Mode offline complet (PWA + saisie différée + synchro automatique)

Objectif : Permettre l'utilisation de Personal CFO sans connexion réseau sur PC et Android, avec toutes les données locales et une synchronisation automatique dès le retour en ligne. Règle de conflit : "dernier écrit gagne" (last write wins).

Prérequis important : le mode offline ne fonctionnera que sur l'application publiée (pas dans l'éditeur Lovable/preview). Il faut aussi que les tables disposent d'une colonne de modification fiable (`updated_at` ou `last_modified`) pour le sync incrémental ; on l'ajoutera là où elle manque.

````text
Phase 1 — PWA / installabilité
- Créer public/manifest.webmanifest avec nom, short_name, icons, theme_color, background_color, display: standalone, start_url: "/".
- Générer les icônes d'installation (192x192, 512x512).
- Ajouter les balises head dans src/routes/__root.tsx : manifest, theme-color, apple-touch-icon, favicons.
- Installer et configurer vite-plugin-pwa avec generateSW, registerType: "autoUpdate", sw.js généré.
- Ajouter un wrapper d'enregistrement du service worker qui ne s'enregistre jamais en dev/preview Lovable, avec kill-switch ?sw=off.
- Prévoir le fallback offline : page statique simple affichée si l'app shell n'est pas en cache.

Phase 2 — Stockage local (IndexedDB)
- Ajouter Dexie.js comme dépendance pour un IndexedDB structuré et versionné.
- Créer src/lib/offline/db.ts : base locale miroir des tables utilisateur (transactions, wallets, budget_nodes, counterparties, assets, debts, receivables, projects, financial_goals, monthly_snapshots, shopping_lists, shopping_list_items, products, product_prices, analytical_tags, subscriptions, income_sources, transaction_tags, asset_events, asset_valuations, etc.).
- Stockage des métadonnées de sync : table `sync_meta` (last_sync_at, device_id).
- Stockage de la file d'attente : table `pending_mutations` (id, table, op: insert/update/delete, payload, created_at, retry_count).

Phase 3 — Synchronisation descendante (pull)
- Créer une server function `syncPull({ lastSyncAt })` qui renvoie, pour chaque table concernée, les lignes modifiées depuis `lastSyncAt` (avec les suppressions logiques si elles existent, sinon full refresh).
- Implémenter `seedFromServer()` côté client : au premier lancement ou après une longue absence, télécharger toutes les données utilisateur et les écrire dans IndexedDB.
- Implémenter `incrementalPull()` : récupérer uniquement les modifications depuis `last_sync_at` et fusionner dans IndexedDB.
- Déclencher automatiquement au login, au retour online, et toutes les 5 minutes en online.
- Ajouter une colonne `updated_at` (ou utiliser celle existante) sur toutes les tables concernées ; les tables sans cette colonne seront migrées en base.

Phase 4 — Synchronisation montante (push) et saisie différée
- Créer un hook/provider `useOfflineSupabase` qui remplace les appels `supabase.from(...).insert/update/delete` pour les opérations utilisateur.
- En online : exécuter normalement via Supabase, puis mettre à jour IndexedDB en mirror.
- En offline : stocker la mutation dans `pending_mutations` et appliquer immédiatement dans IndexedDB pour que l'UI soit responsive.
- Créer un worker/processus `flushPendingMutations()` déclenché au retour online : lit la file par ordre FIFO, appelle Supabase, puis supprime l'entrée en cas de succès.
- Gestion des conflits : last write wins. Pour chaque mutation update/delete, lire la valeur serveur actuelle ; comparer `updated_at` serveur avec le `updated_at` connu au moment de l'opération offline. Si le serveur est plus récent, ignorer la mutation offline (elle a été faite sur un autre appareil après). Sinon, appliquer.
- Pour les insert offline : générer un UUID côté client (uuid v4) pour éviter les doublons.
- Gérer les erreurs : retry avec backoff, marquage des mutations en échec, notification utilisateur.

Phase 5 — Intégration TanStack Query
- Configurer les query options principales (wallets, transactions, counterparties, assets, etc.) en mode `networkMode: 'offlineFirst'` avec `gcTime: Infinity`.
- Créer un adapter `offlineQueryFn` qui lit d'abord IndexedDB, puis déclenche un fetch réseau en arrière-plan pour rafraîchir.
- Modifier src/lib/queries.ts pour utiliser cet adapter sur les listes principales.
- Après chaque mutation réussie (online ou offline), mettre à jour manuellement les clés Query pertinentes pour que l'UI reflète immédiatement l'état local.

Phase 6 — Détection réseau et UI
- Créer src/lib/offline/network-status.tsx : hook `useNetworkStatus` basé sur `navigator.onLine` + événements `online`/`offline` + heartbeat ping optionnel.
- Ajouter un indicateur sticky dans la topbar (AppShell) : icône "cloud-online" / "cloud-offline" avec compteur de mutations en attente.
- Toast/notification : "Mode offline — vos modifications seront synchronisées automatiquement" / "Synchronisation terminée (X modifications)".
- Ajouter un bouton "Forcer la synchronisation" dans Paramètres / Data.

Phase 7 — Migration base de données
- Ajouter les colonnes `updated_at` (ou renforcer leur mise à jour) sur toutes les tables concernées via migration Lovable Cloud.
- S'assurer que les triggers existants `touch_updated_at` sont bien attachés aux tables (ou les ajouter là où ils manquent).
- Vérifier les GRANT et RLS ; le sync se fait via server function authentifiée donc aucune nouvelle exposition publique n'est nécessaire.

Phase 8 — Tests et validation
- Publier l'application pour tester la PWA (install sur Android, mode avion).
- Vérifier que le dashboard, les transactions, les wallets et les formulaires fonctionnent en offline.
- Vérifier que les modifications offline se synchronisent proprement au retour online.
- Vérifier le cas multi-appareil : modification sur PC puis sur mobile offline → conflit résolu par last write wins.
- Tester la fonction "Forcer la synchronisation" et l'affichage des mutations en attente.

Limitations à accepter
- Les fichiers attachés (si Storage est utilisé) ne seront pas disponibles offline à moins d'ajouter un cache spécifique.
- Les appels AI (Assistant CFO) nécessitent un réseau.
- L'export PDF/Excel offline peut être limité si les librairies nécessitent des ressources réseau.
- La première synchronisation peut être lente si la base contient beaucoup de données ; on affichera une barre de progression.

Livrables
- public/manifest.webmanifest + icônes
- src/lib/offline/db.ts
- src/lib/offline/sync.ts (pull/push)
- src/lib/offline/network-status.tsx
- src/lib/offline/use-offline-mutation.ts
- src/lib/queries.ts (adapté)
- src/components/offline-indicator.tsx
- src/routes/_authenticated/settings.tsx (ajout section Offline / Sync)
- Migrations base pour updated_at / triggers
- vite.config.ts (config vite-plugin-pwa)
- src/routes/__root.tsx (head PWA)

Complexité : élevée. Recommandé de découper en plusieurs livraisons : (1) PWA installable + cache lecture, (2) saisie différée transactions, (3) extension à tous les modules, (4) polish multi-appareils.
````