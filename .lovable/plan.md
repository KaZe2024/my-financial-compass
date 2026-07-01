# Chantier Personal CFO — 6 corrections structurelles

Respect strict des principes non négociables : transactions = source unique, réutilisation de l'existant, feuille budgétaire obligatoire, projets = enveloppes, objectifs = cibles calculées, migrations additives uniquement.

## Reconnaissance préalable (obligatoire avant tout code)

Lecture ciblée de :
- `budget_nodes`, `NodePicker`, `buildTree` (déjà en place → réutiliser `allowBranches={false}` + exclusion des nœuds à enfants)
- Formulaire transaction (`transactions.tsx`) + tous les endroits qui insèrent une transaction (assets, debts, receivables, projects, shopping)
- `dashboard.tsx`, `snapshots.tsx` (lecture des objectifs / projets)
- `goals.tsx`, `projects.tsx`, `products.tsx`
- Tables existantes : `financial_goals` (colonnes actuelles), `projects` (envelope_balance, total_spent, linked_transaction_id), `audit_log` (déjà présent — à réutiliser, pas recréer), `subscriptions`, `income_sources` (pour "à traiter aujourd'hui")

## 1. Feuille budgétaire obligatoire

- `NodePicker` : ajouter prop `leafOnly` qui filtre `flat` sur `childCount === 0 && kind !== "subtotal"` et force `allowBranches={false}`.
- Formulaire transaction : passer `leafOnly` pour les types `income` et `expense` (transfer/investment/enveloppe_* gardent la logique actuelle). Validation submit : bloquer si nœud non-feuille sélectionné.
- Filtre "feuille budgétaire" dans la liste transactions : nouveau `NodePicker leafOnly` dans la barre de filtres, applique `transactions.budget_node_id === selected`.
- Vérifier assets/debts/receivables/shopping qui créent des transactions : forcer feuille pour les auto-transactions (ou nœud dédié "Achats d'actifs" etc. si déjà présent).

## 2. Objectifs auto-calculés

Migration additive :
```sql
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS goal_type text
  CHECK (goal_type IN ('savings_balance','net_worth','debt_reduction','spending_cap','savings_rate','category_spend'));
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS watch_node_id uuid REFERENCES budget_nodes(id);
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS period_scope text
  CHECK (period_scope IN ('ytd','ltm','mtd','qtd','all_time','custom'));
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE financial_goals ADD COLUMN IF NOT EXISTS period_end date;
```
`current_amount` **conservée** (non exposée) et rafraîchie en arrière-plan par le client à chaque lecture (upsert silencieux) pour rester cohérente avec le calcul.

Nouveau module `src/lib/goal-progress.ts` : `computeGoalProgress(goal, txs, wallets, debts, assets)` retourne `{current, target, pct}`. Un mapping par `goal_type` :
- `savings_balance` → somme `wallets.current_balance` (wallets d'épargne = filtrés)
- `net_worth` → assets − debts
- `debt_reduction` → total dettes (inversé)
- `spending_cap` / `category_spend` → somme transactions expense sur `watch_node_id` (+ descendants) dans période
- `savings_rate` → (income − expense) / income sur période

Formulaire `GoalDialog` : retirer champ "Déjà épargné", ajouter selects `goal_type` + `period_scope` + `NodePicker` conditionnel. Card affiche progression calculée.

Dashboard : remplacer lecture de `current_amount` par `computeGoalProgress`. Idem partout où le champ est lu (grep `current_amount` sur financial_goals).

## 3. Projets = enveloppes

Migration additive :
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS resulted_asset_id uuid REFERENCES assets(id);
```

Formulaire projet : retirer "Déjà épargné" (`current_amount` reste en base, calculée = `envelope_balance` déjà maintenu par trigger `apply_tx_to_projects`).

Actions rapides sur chaque carte projet :
- **Alimenter** → dialog qui crée une transaction `enveloppe_projet` (montant + wallet source + feuille budgétaire "Épargne projets" — la feuille peut être suggérée mais l'utilisateur confirme).
- **Emprunter** → si `envelope_balance < montant demandé` : crée transaction `enveloppe_emprunt` (fonds dispo temporaires) **et** insère une ligne dans `debts` liée au projet (nouveau champ `debts.project_id` via migration additive) pour traçabilité.
- **Finaliser** → dialog : montant, wallet, option "créer un actif lié" (nom, catégorie, valeur). Crée transaction `investment` (déjà supportée par trigger) et, si coché, insert `assets` + met `projects.resulted_asset_id` + `closed_at` + `status='completed'`.

Migration additive complémentaire :
```sql
ALTER TABLE debts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
```

Historique projet : nouveau composant `ProjectHistoryDialog` qui lit `transactions WHERE project_id = X ORDER BY occurred_on DESC` en lecture seule.

Dashboard / snapshots : cohérence via `envelope_balance` (déjà exposé).

## 4. Prix produits

- `products.tsx` : retirer bouton "Créer produit". Garder table avec actions Éditer (nom/unité/notes) + Archiver via `RowActions`.
- Historique prix : déjà en lecture seule (alimenté par trigger `record_price_from_item`) — vérifier qu'aucun bouton "ajouter prix" n'existe, sinon retirer.

## 5. Audit log

`audit_log` déjà présent en base — réutiliser. 

Créer helper `src/lib/audit.ts` :
```ts
export async function logAudit(entity: string, entity_id: string, action: 'create'|'update'|'delete'|'archive', diff?: any)
```
Appeler dans les mutations existantes de : transactions, assets, debts, receivables, projects, financial_goals, budget_nodes. Wrapper léger dans `RowActions` pour archive/delete.

Nouvelle page `src/routes/_authenticated/audit.tsx` : table paginée avec filtre par `entity_type`, `action`, plage de date. Lien depuis `settings.tsx` ("Journal d'audit").

## 6. "À traiter aujourd'hui" sur dashboard

Nouvelle section entre KPIs et graphes :
- Lit `subscriptions WHERE next_billing_date <= today AND active`
- Lit `income_sources WHERE next_expected_date <= today AND active` (si champ existe, sinon dériver de `frequency` + `last_received`)
- Chaque ligne = bouton "Générer" qui insère la transaction correspondante (expense pour sub, income pour source), rattache à la feuille budgétaire mémorisée sur la source, puis met à jour `next_billing_date` / `next_expected_date` selon la fréquence (helper `addPeriod(date, frequency)`).

## Ordre d'exécution

1. Migration additive unique (colonnes goals + projects + debts).
2. `NodePicker` prop `leafOnly` + branchement formulaire tx + filtre.
3. `goal-progress.ts` + refonte `goals.tsx` + patch dashboard/snapshots.
4. Refonte `projects.tsx` (actions + historique) + patch dashboard.
5. `products.tsx` cleanup.
6. `audit.ts` helper + page audit + branchements mutations + lien settings.
7. Dashboard "à traiter aujourd'hui".
8. Revue finale : grep `current_amount`, tests navigation, mobile, cohérence visuelle.

## Risques / non-régression

- `current_amount` et `envelope_balance` restent alimentés (triggers en place) → aucun écran ne casse.
- Pas de rename/drop de colonne. Enum `transaction.type` déjà étendu précédemment.
- Formulaires existants gardent la même structure visuelle (Dialog + Label + Input).
- Chaque mutation touchée conserve son toast + invalidateQueries actuels.
