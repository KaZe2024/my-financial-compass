# OPTIS — Audit produit et feuille de route « conseiller optimisateur de vie »

## Où en est l'application aujourd'hui

OPTIS couvre déjà, de façon solide, la **collecte** et la **restitution** :

- Finance : transactions, portefeuilles, budgets (arborescence + saisie par mois), actifs/amortissements, dettes, créances, provisions, tiers, taux de change, snapshots mensuels.
- Vie quotidienne : planification (habitudes récurrentes, Eisenhower, duplication de journée), projets, projets planifiés, objectifs, listes d'achats, prix produits, Stock Food, documents, brainstorming.
- Transverse : dashboard analytique (santé financière, prévision experte, évolution du patrimoine avec commentaires), assistant CFO IA + insights, MCP pour agents, mode hors ligne universel, thèmes.

Le socle analytique est centralisé (`src/lib/finance.ts`, `src/lib/analytics.ts`, `src/lib/goal-progress.ts`), ce qui rend les améliorations ci-dessous additives.

## Le vrai manque : passer de « tableau de bord » à « conseiller »

Un conseiller optimisateur de vie répond à trois questions qu'OPTIS ne traite pas encore de bout en bout :

1. **Qu'est-ce qui compte pour moi ?** — pas de couche « valeurs / priorités de vie » reliant temps, argent et objectifs.
2. **Qu'est-ce que je dois faire aujourd'hui ?** — il n'y a pas d'endroit unique qui hiérarchise les actions issues des finances, des habitudes, des projets et des alertes.
3. **Est-ce que ça marche ?** — les commentaires sont descriptifs, jamais mesurés dans le temps (aucun suivi « conseil donné → action → résultat »).

## Liste d'améliorations (toutes additives, sans casser l'existant)

### Vague 1 — Le cœur « conseiller » (fort impact, risque faible)

1. **Briefing quotidien** (nouvelle route `/today`) : une page qui agrège, en lecture seule, ce qui existe déjà — habitudes du jour, tâches en retard, échéances (dettes, abonnements, provisions), alertes de trésorerie, objectifs à risque. Aucune écriture, aucun calcul nouveau : uniquement de la composition.
2. **Moteur de recommandations unifié** (`src/lib/advisor.ts`) : une fonction pure qui prend le snapshot déjà chargé par le dashboard et renvoie une liste d'actions typées (impact estimé, effort, échéance, module concerné). Les cartes existantes (santé, patrimoine, alertes) continuent de fonctionner ; elles pourront afficher ces actions en plus.
3. **Score de vie global** : le score de santé financière existe déjà ; ajouter à côté un score « exécution » (habitudes tenues, tâches faites, projets en avance/retard) et un score « alignement » (temps passé vs priorités déclarées). Affichés en complément, jamais en remplacement.
4. **Boucle de suivi des conseils** : chaque recommandation peut être acceptée → elle crée un élément de planification, ou reportée/refusée. Une table légère garde l'historique pour mesurer le taux d'application et éviter de répéter un conseil rejeté.

### Vague 2 — Rendre l'analyse actionnable

5. **Simulateur « et si ? »** : curseurs sur revenus, dépenses par catégorie, remboursement de dette, achat d'actif — recalculés avec la prévision experte déjà en place, sans rien écrire en base.
6. **Coût réel du train de vie par catégorie** : classement des postes par poids, tendance sur 3/6/12 mois, et détection des dérives (poste qui accélère plus vite que les revenus).
7. **Rendement des actifs** : à partir des amortissements, réévaluations et ventes déjà saisies, exposer un rendement annualisé par actif et par type, pour arbitrer garder/vendre.
8. **Alertes prédictives** : rupture de trésorerie projetée, abonnement non utilisé, prix produit anormalement haut par rapport à l'historique, échéance approchant sans provision suffisante.

### Vague 3 — La dimension « vie » (pas seulement l'argent)

9. **Priorités de vie** : 3 à 7 domaines déclarés (santé, famille, revenu, apprentissage…), rattachables aux projets, habitudes et objectifs existants via un champ optionnel — donc sans migration destructive.
10. **Analyse du temps** : à partir des durées déjà saisies en planification, répartition du temps par domaine et écart avec les priorités déclarées.
11. **Revue hebdomadaire guidée** : un parcours en 5 étapes (semaine passée, dérives, gagné/perdu, priorités de la semaine, engagements) qui produit une note archivée dans les documents.
12. **Traces d'habitudes** : séries en cours, taux de tenue, meilleur créneau horaire — les données de planification suffisent.

### Vague 4 — Intelligence et confort

13. **Assistant CFO enrichi** : le snapshot IA reçoit les scores, les recommandations et les priorités de vie, avec des invites prêtes à l'emploi (« optimise mon mois », « où je perds de l'argent », « que faire cette semaine »).
14. **Rapport mensuel** : synthèse exportable (PDF/impression) construite sur les snapshots existants.
15. **Confort de saisie** : transactions récurrentes en un geste, modèles de journée, saisie rapide au clavier depuis n'importe quelle page.
16. **Performance et fiabilité** : mise en cache des agrégats lourds du dashboard, revue des index, et vérification que chaque nouveau module reste utilisable hors ligne.

## Garde-fous techniques

- Nouvelle logique isolée dans de nouveaux fichiers (`src/lib/advisor.ts`, `src/lib/life-score.ts`) ; `finance.ts` et `analytics.ts` ne sont étendus que par ajout de fonctions, jamais par modification des signatures utilisées ailleurs.
- Toute nouvelle table est créée avec RLS et GRANT dès la migration, et enregistrée pour la synchronisation hors ligne.
- Toute nouvelle colonne sur une table existante est optionnelle (nullable, avec valeur par défaut) pour ne rien invalider.
- Les nouvelles pages sont des routes distinctes sous `_authenticated` ; les pages actuelles ne sont modifiées que pour ajouter des blocs, pas pour en retirer.
- Chaque vague est livrable et vérifiable séparément.

## Ordre recommandé

Vague 1 d'abord (elle transforme le positionnement produit à elle seule), puis 2, puis 3, puis 4.
