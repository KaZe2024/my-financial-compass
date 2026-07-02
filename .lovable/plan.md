
# Sprint : Corrections structurelles + nouveaux modules

Gros chantier — je propose de le découper en **deux vagues** pour garder la qualité. Confirme si tu veux tout d'un coup ou en deux passes.

---

## VAGUE A — Corrections structurelles (9 points)

### A1. Produits (prix)
- Ajouter `RowActions` (Archiver / Supprimer) sur chaque ligne dans `products.tsx`. Edit déjà présent.

### A2. Snapshots — CRUD + période choisie
- Bouton "Clôturer" → ouvre un dialog `PeriodPicker` (mois/trim/sem/an) au lieu de forcer le mois courant.
- Ajouter `RowActions` (Modifier montants figés, Supprimer) sur la liste des snapshots existants.

### A3. Transactions
- Retirer le filtre "Feuille budgétaire" dans la liste.
- Dans le formulaire : `NodePicker` **sans** `leafOnly` (autoriser catégorie intermédiaire). Supprimer `assertLeafBudget`.

### A4. Actifs — Amortissements comme charges mensuelles
- Nouveau flow "Générer amortissements" par actif :
  - Calcul mensuel linéaire = `purchase_value / useful_life_months`.
  - Génère une transaction `expense` par mois depuis `purchase_date` jusqu'à `min(today, purchase_date + life)`, catégorie budgétaire **"Amortissements"** (créée auto si absente, kind intermédiaire).
  - Dialog de **validation** listant les N transactions à créer avant insertion.
  - Idempotence : marquer `asset_events` avec `event_type='depreciation'` + `period_month`, ne pas re-générer si déjà présent.
- Ajouter 2 boutons ligne actif :
  - **Réévaluer +** : `asset_event` type `revaluation`, met à jour `current_value`, pas de transaction.
  - **Vendre** : dialog (prix, portefeuille, date), crée transaction `asset_sale`, marque `status='sold'`.
- Le bouton "Appliquer dépréciation" actuel (one-shot) est remplacé par le générateur mensuel.

### A5. Dettes & Créances — CRUD depuis Transactions
- Nouvelle migration : étendre l'enum `transactions.type` avec :
  - `debt_incur` (contracter une dette : +wallet)
  - `debt_repay` (rembourser : -wallet)
  - `receivable_grant` (prêter : -wallet)
  - `receivable_collect` (encaisser : +wallet)
- Trigger `apply_tx_to_wallets` mis à jour : `debt_incur` et `receivable_collect` = crédit ; `debt_repay` et `receivable_grant` = débit. Aucun lien budget.
- Nouveau trigger `apply_tx_to_debts` : crée/maj `debts` sur `debt_incur`, décrémente `current_balance` sur `debt_repay`. Idem `receivables`.
- Dans `transactions.tsx` : 4 nouveaux types dans le sélecteur, champs conditionnels (créancier/débiteur, échéance).
- `debts.tsx` et `receivables.tsx` : lecture seule + panneau "Transactions liées" au clic sur une ligne (déjà partiellement fait, retirer les boutons Create/Edit).
- Dashboard : exclure ces 4 types du calcul dépenses/revenus.

### A6. Budgets — période et montant unique
- Vérifier `period.ts` : `getPeriodRange(kind, ref)` doit retourner l'année/trimestre/semestre **contenant** `ref`, pas dériver à partir du mois seul. Corriger si besoin.
- **Montant unique par ligne** : refonte du modèle `budget_node_amounts`.
  - Actuellement : une ligne par (node, period) → additionne mensuel/annuel.
  - Nouveau : stocker toujours en **mensuel canonique** (`amount_monthly`). Quand on saisit "annuel 12M", on écrit `amount_monthly = 12M/12`. Quand on affiche annuel, on lit `amount_monthly * nb_mois_periode`.
  - Migration : convertir l'existant (garder max des lignes par node/mois), supprimer la dimension `period_kind` du unique key, ne garder que (node_id, period_month).
  - UI budgets : un seul input par ligne, affichage adapté à la période sélectionnée mais édition toujours reflète le même stockage.

### A7. Projets
- **Barre de progression** : `envelope_balance / target_amount` (déjà en DB via trigger). Vérifier que la query invalide bien après `Alimenter` — probable manque de `qc.invalidateQueries(["projects"])`.
- **Suivi dépenses multi-tranches** : nouveau bouton **"Dépenser"** sur un projet ouvert.
  - Crée une transaction `investment` liée au projet (trigger déjà en place : incrémente `total_spent`).
  - Décrémente enveloppe via `enveloppe_projet` inverse ? Non : les dépenses sortent du wallet, pas de l'enveloppe. L'enveloppe reste l'engagement provisionné ; `total_spent` suit ce qui est effectivement dépensé.
- **Finaliser** devient optionnel : projet peut rester ouvert avec multiples dépenses ; finaliser = clôturer (immo créée si applicable, sinon juste `status='completed'`).

### A8. Objectifs
- **`spending_cap`** : accepter tableau `watch_node_ids` (multi-select catégories intermédiaires uniquement). Migration : ajouter colonne `watch_node_ids uuid[]`. `computeGoalProgress` somme les descendants.
- **`savings_balance`** renommé UI en **"Solde trésorerie disponible"** : somme des `wallets.current_balance` où `type in ('checking','savings','cash','hidden_cash','mobile_money',...)` — tout sauf `credit`. Déjà proche, à ajuster.
- **`savings_rate`** : au lieu de `(income-expense)/income`, montant épargné = solde des wallets `type in ('savings','hidden_cash')` ; taux = ce solde / revenus période.

### A9. Comptes de tiers — période "Depuis toujours"
- Ajouter option `all` dans `PeriodPicker` (label "Depuis toujours"), retourne `{start: null, end: null}`. Adapter les filtres SQL correspondants.

### A10. Exports (Data)
- Dans `data.tsx`, remplacer les colonnes `*_id` par les libellés joints :
  - `wallet_id` → nom du portefeuille
  - `node_id` → chemin catégorie (`Alimentation › Courses`)
  - `counterparty_id` → nom du tiers
  - `asset_id`, `debt_id`, `project_id` → nom respectif
- Import : accepter les libellés, résoudre en `id` via lookup (tolérant à la casse). Erreur claire si non trouvé.

---

## VAGUE B — Nouveaux modules

### B1. Abonnements (`/subscriptions`)
- Page listant `subscriptions` (table déjà présente).
- Colonnes : nom, coût, fréquence, prochaine échéance, statut actif.
- Bouton **Confirmer** par ligne échue → génère transaction expense + `advanceDate(next_billing_date, billing_cycle)`.
- Bouton Stop/Reprendre (`is_active`).
- Récapitulatif : coût mensuel équivalent + coût annuel équivalent.
- CRUD complet (créer, éditer, archiver).

### B2. Provisions (`/provisions`)
- Table `provisions` déjà présente (12 colonnes).
- Page CRUD : montant prévu, échéance, sens (dépense/revenu), catégorie budgétaire.
- Bouton **Régler** → crée transaction correspondante + marque `settled_at`.

### B3. Calendrier financier (`/calendar`)
- Vue mensuelle en grille (7 colonnes).
- Agrège **sans duplication** :
  - `subscriptions.next_billing_date`
  - `income_sources.next_expected_date`
  - `debts` échéances
  - `receivables` échéances
  - `provisions.due_date`
  - `projects.target_date`, `financial_goals.target_date`
- Footer mois : total entrées prévues / sorties prévues / solde net.
- Clic jour → détail des événements.

### B4. Alertes & Recommandations (`/alerts`)
- Module de **calculs dérivés** (aucune table nouvelle) :
  - **Alertes** : budget dépassé (spent > planned sur période courante), trésorerie < seuil (solde disponible < moyenne dépenses 30j), dette élevée (ratio dette/actifs > 0.5), échéance <7j, créance en retard (>due_date), projet retard (target_date passée, status open), objectif hors trajectoire (progress < elapsed_ratio).
  - **Recommandations** : trésorerie excédentaire (dispo > 3×dépenses moy → suggérer placement), objectif atteignable plus vite (avance > 20%), dépense anormale sur feuille (>2σ vs 6 derniers mois), abonnement inutile (0 transaction liée depuis 90j).
- Fichier `src/lib/alerts.ts` avec `computeAlerts(data): Alert[]` et `computeRecommendations(data): Reco[]`.
- Page dédiée + **section résumé** sur dashboard (top 5 alertes + top 3 recos).

### B5. Dashboard "À traiter aujourd'hui"
- Déjà partiellement en place selon le résumé précédent, mais si absent : section listant subscriptions + income_sources échus avec bouton **Générer** en un clic.
- Vérifier présence et compléter le cas échéant.

---

## Ordre d'exécution
1. Migration BDD (enum tx, budget_amounts refonte, watch_node_ids, provisions déjà OK)
2. Vague A (A1 → A10)
3. Vague B (B1 → B5)
4. Vérification finale : nav complète, dashboard intact, pages accessibles, aucune régression.

---

## Points nécessitant validation
- **A6 refonte `budget_node_amounts`** : migration destructive-partiellement (conversion des lignes). OK ou tu préfères garder les anciennes lignes en backup ?
- **A4 amortissements rétroactifs** : je génère silencieusement N transactions passées après validation utilisateur. Confirmes-tu que c'est ce que tu veux (ça peut créer 24+ transactions d'un coup) ?
- **A5 enum tx** : les dettes/créances existantes seront conservées mais ne pourront plus être créées depuis leurs pages. Tu veux migrer les transactions historiques (asset_purchase liées à debt) vers `debt_incur` ? Ou laisser tel quel ?

Je peux commencer par Vague A si tu confirmes ces 3 points, puis Vague B ensuite.
