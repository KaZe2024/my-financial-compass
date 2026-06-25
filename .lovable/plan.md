Cette refonte touche presque tous les modules. Je découpe en 9 chantiers cohérents pour pouvoir livrer sans tout casser, avec 1 grosse migration SQL en tête.

---

## 0. Migration SQL (une seule)

- `transactions.type` : étendre l'enum/CHECK pour ajouter `enveloppe_projet` (mouvement de fonds vers/depuis un projet) et garder `investment` (dépense projet). Ajouter colonnes :
  - `counterparty_id uuid` (FK `counterparties.id`) + `counterparty_label text` (saisie libre auto-créée)
  - `project_id uuid` (FK `projects.id`)
  - `source_kind text` (`manual` | `asset` | `debt` | `receivable` | `shopping_list` | `project_envelope`) + `source_id uuid` (id de l'entité source)
- `counterparties` : ajouter `group_name text`, `service_name text` (Prestation), `notes text`, `archived bool default false`. Backfill depuis transactions existantes.
- `assets`, `debts`, `receivables`, `projects`, `financial_goals` : ajouter `archived bool default false` si absent + colonne `linked_transaction_id uuid` pour la transaction d'origine.
- `budget_nodes` : rien à changer côté schéma (kind existe). On utilisera seulement de l'UI pour collapse/styling.
- `projects` : ajouter `envelope_balance numeric` (calculé via trigger sur transactions de type `enveloppe_projet` signé +/−) et `total_spent numeric` (somme des `investment` rattachées).
- Trigger `apply_tx_to_projects` : à chaque insert/update/delete d'une transaction liée à un projet, recalcule `envelope_balance` et `total_spent`.
- Grants + RLS standards.

---

## 1. Dashboard — sélecteur de période

Composant `<PeriodPicker>` réutilisable avec : YTD · Mensuel · Annuel · LTM · Plage personnalisée (du / au). Toutes les agrégations du dashboard (cash-flow, score santé, net worth growth, etc.) prennent la période active. Persisté en `localStorage`.

## 2. Snapshots — même sélecteur étendu

`<PeriodPicker>` avec en plus : Trimestre · Semestre. Le tableau et les graphes du module Snapshots filtrent sur la plage choisie.

## 3. Transactions : Tiers + colonnes + filtres

- Nouvelle colonne **Tiers** (combobox auto-complétée, crée le tiers s'il n'existe pas).
- Ajout : **Projet** (visible si type = `investment` ou `enveloppe_projet`).
- **Tableau visible** : Date · Type · Description · Tiers · Catégorie · Tags · Portefeuille · Montant MGA · Notes. (On retire Montant natif + Ligne budgétaire — toujours stockés et filtrables.)
- **Filtres ré-ordonnés et regroupés sur 2-3 lignes** : Date du · Date au · Montant MGA min · Montant MGA max · Tiers · Type · Portefeuille · Devise · Mot-clé description · Mot-clé notes · Ligne budgétaire · Catégorie · Projet · Tags.
- Dialog Add/Edit : champ Tiers (auto-complétion via `counterparties`) + champ Projet conditionnel.

## 4. Toutes les sources alimentent / sont alimentées par Transactions

Règle unique : créer un actif, une dette, une créance, un objectif/projet **doit** générer (ou être lié à) une ligne de transaction.

- **Assets** : à la création, créer une transaction `asset_purchase` (type existant `expense` ou nouveau `asset_buy`) avec `source_kind='asset'`, `source_id=asset.id`. La carte asset affiche le lien "Voir transaction".
- **Debts** (emprunt reçu) : créer transaction `income` avec `source_kind='debt'`. Remboursements = transactions liées.
- **Receivables** (prêt accordé) : créer transaction `expense` `source_kind='receivable'` (sortie de cash), encaissements = transactions liées.
- **Projects** : voir §8.
- **Shopping lists** : déjà OK.

Boutons **Modifier · Archiver · Supprimer** ajoutés sur chaque carte/ligne de : Debts, Receivables, Projects, Goals, Assets. La suppression d'une entité propose : "Supprimer aussi les transactions liées ?".

## 5. Module Tiers / Comptes de Tiers

Nouvelle page `/_authenticated/counterparties`.

- Liste des tiers (depuis `counterparties`) avec colonnes : Nom · Groupe · Prestation · Solde net période · # mouvements · Notes.
- Filtres : mot dans nom, mot dans notes, groupe, prestation, période (Mensuel / Trimestre / Semestre / Annuel / YTD).
- Détail tiers : tableau des mouvements (transactions liées) + graphique entrées/sorties par période choisie + édition Groupe / Prestation / Notes / Archiver.
- Création de tiers possible directement ou via auto-création depuis Transactions.

## 6. Module Suivi Taux de change

Nouvelle page `/_authenticated/fx`.

- Source : `transactions.exchange_rate` + `transactions.currency` + `occurred_on`. On agrège (moyenne pondérée ou dernière obs.) par devise et par jour.
- UI : sélecteur devise, plage de dates (preset YTD/LTM/Mensuel/Annuel/Plage), graphique en ligne, table des observations, min/max/moy/dernier, variation %.
- Bonus : possibilité d'ajouter une observation manuelle (table `exchange_rates` existe déjà).

## 7. Budgets — UX arborescence

- Lignes **Groupe (depth 0)** : fond plus marqué (bg-muted/60, texte semi-bold, bordure latérale colorée) pour les distinguer.
- **Sous-totaux repliables** : chevron permettant de masquer le bloc agrégé en dessous du subtotal (état persisté localStorage par node id).

## 8. Refonte Projets vs Objectifs

Séparation nette :

- **Objectifs (`financial_goals`)** : épargne pure, suivi de cible — pas de mouvement automatique (statu quo).
- **Projets (`projects`)** : 3 niveaux d'activité :
  1. **Épargne & mouvements de fonds** → nouveau type transaction `enveloppe_projet`. Dans le formulaire transaction, si type = `enveloppe_projet`, le champ "Vers" devient "Projet" (select projets actifs). Signe : + alimente l'enveloppe (sortie du wallet, entrée projet) ou − retire (entrée wallet, sortie projet). Met à jour `projects.envelope_balance` via trigger.
  2. **Dépenses du projet** → type `investment` rattaché à un `project_id`. Met à jour `projects.total_spent`.
  3. **Emprunt à l'enveloppe** → cas particulier de (1) avec signe négatif et flag `is_loan_from_envelope=true` ; affiché en jaune dans la carte projet ("X emprunté à l'enveloppe, à rembourser"). Solde projet recalculé pareil.

Carte projet enrichie : Solde enveloppe · Dépenses totales · Cible · % avancement · Emprunt en cours · boutons Modifier · Archiver · Supprimer.

## 9. Import / Export universel

- **Export Excel** par module (Transactions, Wallets, Budgets, Tiers, Assets, Debts, Receivables, Projects, Goals, Snapshots) + **Export Tout** (1 fichier multi-feuilles). Lib : `xlsx`.
- **Export PDF** : reporting dashboard + snapshot mensuel (lib `jspdf` + `jspdf-autotable`).
- **Export PNG/JPEG** : capture d'une section dashboard via `html-to-image`.
- **Import Excel** : bouton "Télécharger le modèle" (génère un .xlsx vierge avec les bons en-têtes par feuille) + bouton "Importer". Parse, valide (Zod), affiche un récap "X lignes valides, Y erreurs", insère en transaction batch. Gère la création auto des tiers/wallets/catégories manquants (option à cocher).
- Page dédiée `/_authenticated/data` avec onglets Export / Import / Modèles.

---

## Technique

- 1 migration SQL (chantier 0).
- Nouveaux fichiers : `src/components/period-picker.tsx`, `src/components/counterparty-picker.tsx`, `src/lib/io/excel.ts`, `src/lib/io/pdf.ts`, `src/lib/io/png.ts`, `src/lib/io/import.ts`, `src/routes/_authenticated/counterparties.tsx`, `src/routes/_authenticated/fx.tsx`, `src/routes/_authenticated/data.tsx`.
- Fichiers modifiés : `transactions.tsx`, `dashboard.tsx`, `snapshots.tsx`, `budgets.tsx`, `projects.tsx`, `goals.tsx`, `assets.tsx`, `debts.tsx`, `receivables.tsx`, `app-shell.tsx` (nav), `integrations/supabase/types.ts` (auto), `lib/queries.ts`.
- Dépendances à installer : `xlsx`, `jspdf`, `jspdf-autotable`, `html-to-image`, `date-fns` (probablement déjà là).

```text
Volume estimé : ~15-18 fichiers, 1 migration, 0 breaking change majeur (ajouts + colonnes nullable).
```

## Ordre de livraison proposé

1. Migration SQL + types regen.
2. Chantier 3 (Transactions: Tiers + colonnes + filtres) + 4 (sources ↔ transactions + CRUD partout).
3. Chantier 1 + 2 (PeriodPicker Dashboard + Snapshots).
4. Chantier 8 (Projets/Objectifs).
5. Chantier 5 (Tiers) + 6 (FX).
6. Chantier 7 (Budgets UX).
7. Chantier 9 (Import/Export).

Confirme-moi qu'on part là-dessus (ou dis-moi par quel chantier commencer en priorité) et je lance la migration.