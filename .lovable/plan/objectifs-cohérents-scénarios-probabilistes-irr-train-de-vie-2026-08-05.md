# Objectifs cohérents, scénarios probabilistes, IRR, train de vie avancé, performance

## 1. Statuts des objectifs — incohérence confirmée

Vérifications faites en base et dans le code :

- Les 4 objectifs existants ont tous `status = active` et `current_amount = 0.00`, alors que la progression réelle est calculée à l'écran.
- La page Objectifs n'écrit jamais le statut : le formulaire (`goals.tsx`) n'envoie pas `status`, il reste donc à sa valeur par défaut à vie.
- La page Objectifs filtre sur `archived`, mais le Dashboard filtre sur `status = active`. Deux sources de vérité différentes pour « objectif actif ».
- Le bloc de synchronisation de `current_amount` part sans attendre le résultat ni rafraîchir le cache : c'est pour ça que la base reste à 0.

Ce qui sera fait :

- **Statut dérivé, plus jamais saisi à la main** : un objectif est `achieved` quand la progression atteint la cible (ou passe sous le plafond pour les objectifs inversés), `active` sinon, `cancelled` quand il est archivé. La règle vit dans une fonction pure à côté du calcul de progression existant.
- **Un seul filtre partout** : le Dashboard et la page Objectifs utilisent la même notion d'objectif actif (non archivé et non atteint), pour que les deux écrans ne se contredisent plus.
- **Synchronisation fiable** : `current_amount` et `status` sont écrits en une passe, en attendant le résultat, avec rafraîchissement du cache — plus de valeurs à 0 en base.
- **Affichage** : un badge de statut sur chaque carte (Actif / Atteint / En pause / Annulé) et un compteur « X atteints sur Y » en tête de page. Possibilité de mettre manuellement un objectif « En pause » (le seul statut qui reste manuel, il ne peut pas être déduit).

## 2. Scénarios probabilistes (Monte Carlo)

Nouveau fichier de calcul dédié, à côté de la prévision experte existante — celle-ci n'est pas modifiée, elle sert de trajectoire centrale.

- Simulation de plusieurs milliers de trajectoires sur la fenêtre de prévision, avec tirages aléatoires sur : revenus (volatilité mesurée sur l'historique réel), dépenses (idem), retards d'encaissement des créances et de règlement des dettes.
- Sortie : bandes **p10 / p50 / p90** par jour, probabilité de rupture de trésorerie, date de rupture au pire cas raisonnable (p10), trésorerie médiane à 30 / 90 / 365 jours.
- Affichage : bande de confiance en aire sur le graphique de prévision (Simulateur et Dashboard), avec une phrase d'explication en clair (« 9 chances sur 10 de rester au-dessus de X »).
- Les paramètres de volatilité sont déduits des transactions réelles, avec des curseurs pour les ajuster. Aucune écriture en base.

## 3. Rendement et optimisation patrimoniale

- **IRR par actif** : taux interne de retour annualisé calculé sur les flux réels liés à l'actif (achat, amortissements, réévaluations, revente), par recherche de racine numérique. Nouvelle colonne dans le tableau des Actifs, avec le détail dans l'historique.
- **IRR par type d'actif et global** : agrégation des flux de tous les actifs d'un type pour un rendement de « portefeuille ».
- **Actif vs liquidité vs objectif** : panneau de comparaison qui met en regard le rendement des actifs, le rendement implicite de la trésorerie dormante et le rythme requis par les objectifs, pour dire où placer l'euro suivant.
- **Vendre maintenant vs garder** : pour un actif non vendu, comparaison de deux scénarios sur un horizon paramétrable — vendre à la valeur actuelle et libérer la trésorerie, ou garder en subissant les amortissements restants. Affiche l'écart de patrimoine net et le point de bascule.

## 4. Analyse du train de vie avancée

Extension de l'analyse existante du coût du train de vie :

- **Dérive sur 3 / 6 / 12 mois** avec sélecteur de fenêtre, et qualification de tendance par catégorie (accélération, hausse, stable, baisse) plutôt qu'un simple pourcentage.
- **Postes anormaux** : détection par écart à la médiane historique de la catégorie (méthode robuste, insensible aux mois exceptionnels), avec la liste des transactions responsables.
- **Coût réel mensualisé** des abonnements et engagements : tous les cycles ramenés au mois, cumul annuel, part dans les dépenses, et repérage des abonnements sans transaction récente.

## 5. Virtualisation des grandes listes

- Ajout du rendu virtualisé sur les trois tableaux volumineux : Transactions, grille de Budgets, liste de Planification — seules les lignes visibles sont rendues, l'entête et les sous-totaux collants restent en place.
- Chargement progressif (pagination infinie) sur Transactions pour éviter de tout monter d'un coup, tout en gardant les totaux calculés sur l'intégralité des données.
- Les filtres, la sélection multiple et l'édition en lot continuent de fonctionner à l'identique.

## 6. Cache et synchronisation optimisée

Corrections vérifiées dans le moteur de synchronisation actuel :

- La récupération par table n'est pas paginée : au-delà de la limite de l'API, des lignes sont silencieusement absentes du cache local. À corriger avec une récupération par pages.
- Les suppressions ne se propagent pas d'un appareil à l'autre : la détection repose sur une colonne de suppression douce que la plupart des tables n'ont pas.
- Le vidage de la file d'attente suppose que les N premières mutations ont réussi ; en cas d'échec intercalé, une mutation réussie peut être rejouée ou une mutation échouée oubliée.

Ce qui sera fait :

- **Récupération delta paginée** par table, en ne demandant que les lignes modifiées depuis la dernière synchronisation (déjà le principe, mais rendu fiable et complet).
- **Propagation des suppressions** via un journal de suppressions, pour que supprimer sur un appareil supprime bien partout.
- **File d'attente fiable** : chaque mutation reçoit un résultat individuel (réussie / échouée avec sa raison), les réussies seules sont retirées, les échecs sont réessayés avec un plafond et deviennent visibles dans l'indicateur hors ligne.
- **Résolution de conflits** : quand deux appareils modifient la même ligne, comparaison des horodatages champ par champ pour fusionner ce qui ne s'oppose pas, et conservation du plus récent sur les champs en conflit, avec trace dans le journal d'audit.
- **Cache des agrégats lourds** dans le stockage local, avec invalidation par table modifiée : le Dashboard, le Coach et le Briefing ne recalculent plus tout à chaque visite.

## Détails techniques

- Nouveaux fichiers de logique pure : `src/lib/montecarlo.ts` (trajectoires et percentiles), `src/lib/irr.ts` (flux et taux interne de retour), `src/lib/aggregate-cache.ts` (cache des agrégats). `analytics.ts`, `finance.ts` et `simulator.ts` ne sont étendus que par ajout de fonctions.
- Statut des objectifs : nouvelle fonction dans `src/lib/goal-progress.ts` (`deriveGoalStatus`), consommée par `goals.tsx` et `dashboard.tsx`. Aucun changement de schéma nécessaire, la colonne et l'énumération existent déjà.
- Virtualisation : ajout de `@tanstack/react-virtual`, appliqué aux corps de tableaux sans toucher aux calculs ni aux filtres.
- Synchronisation : refonte interne de `src/lib/offline/sync.ts` (pagination, résultats par mutation, fusion) et de `src/lib/offline/db.ts` (journal de suppressions, métadonnées de conflit). Une migration ajoute une table de journal des suppressions avec RLS et GRANT, plus un déclencheur d'enregistrement.
- Monte Carlo tourne côté navigateur sur les données déjà chargées, avec un nombre d'itérations plafonné pour rester fluide et fonctionner hors ligne.

## Ordre de livraison

1. Statuts des objectifs (correction de cohérence, indépendante).
2. Fiabilité de la synchronisation et cache des agrégats (protège toutes les données existantes).
3. Virtualisation et chargement progressif (confort immédiat).
4. Train de vie avancé, puis IRR et arbitrages patrimoniaux.
5. Monte Carlo sur la prévision.
