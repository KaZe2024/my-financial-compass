## Plan du jour

### 1. TRANSACTIONS
- **Colonnes du tableau** : Date · Type · Description · **Ligne budgétaire** (auto = racine de la catégorie, non éditable) · Catégorie · Tags · Portefeuille · Montant + devise · **Montant MGA** (= amount × exchange_rate) · **Notes**.
- **Filtres** (2 lignes) :
  - Ligne 1 : Type, Du, Au, Mot‑clé description
  - Ligne 2 : **Ligne budgétaire** (depth 0), Catégorie (depth 1), Tags (multi), Portefeuille, Devise, **Mot‑clé notes**, Montant MGA min, Montant MGA max
  - Le filtre montant s'applique sur **base_amount (MGA)**, pas sur `amount`.
- **Tags CRUD complet** : à côté de chaque tag dans le sélecteur, icônes Renommer / Supprimer (avec confirmation, cascade via FK).

### 2. PORTEFEUILLES — référentiel MGA
- Le solde de référence affiché passe en **MGA** (calculé à partir des `base_amount` des transactions + opening converti via `exchange_rate` du wallet ou 1 si MGA).
- Affichage carte : `Solde MGA` en gros, `Solde natif (devise)` en dessous si la devise ≠ MGA.
- Total consolidé = somme des soldes MGA. Le dashboard "Wealth" continue d'utiliser ces valeurs.
- (Le trigger SQL reste tel quel : on ne modifie pas la base, on calcule l'affichage côté front à partir des transactions.)

### 3. BUDGETS
- **Drag & drop** natif HTML5 :
  - Drop sur la moitié haute d'une ligne = insérer **avant** (même parent), moitié basse = insérer **après**, sur le label = devenir **enfant** (si depth autorisée).
  - Mise à jour atomique de `parent_id` + `sort_order` (renumérotation des frères).
  - Conserve les boutons ↑/↓ existants comme fallback.
- **Sous‑totaux paramétrables** : nouveau type de node `subtotal` (champ `kind: 'normal' | 'subtotal'`) — groupe visuel qui agrège ses frères situés au‑dessus jusqu'au précédent sous‑total (ou ses enfants si on lui en attache). Position librement déplaçable. Nom libre. Pas de montant planifié propre.
  - Migration : `ALTER TABLE budget_nodes ADD COLUMN kind text NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal','subtotal'))`.
  - Bouton "+ Sous‑total" dans l'arbre à côté de "+ Racine".

### 4. LISTES D'ACHAT — flux courses → transaction
- **Défauts verrouillés** (modifiables via un panneau "Paramètres listes d'achat" en haut, persistés dans `profiles` ou nouvelle table `shopping_defaults`) :
  - Devise = MGA (toujours)
  - Portefeuille par défaut
  - Catégorie budgétaire par défaut
  - Tags par défaut
- **Workflow par liste** :
  - Création : titre (obligatoire), date, magasin (optionnel), surcharge éventuelle des défauts (catégorie, portefeuille, tags).
  - Items en checklist : produit, prix unitaire, quantité, montant (= qté×PU). Case à cocher "acheté".
  - Bouton **"Enregistrer vers transactions"** : insère 1 transaction (`expense`) avec
    - description = titre de la liste
    - notes = liste des items cochés joints par " + " (ex: `Pain + Lait + Œufs ×6`)
    - amount = somme des items cochés, currency = MGA, base_amount = amount
    - wallet_id / budget_node_id / tags = défauts ou surcharges
  - La liste est marquée `closed` et liée à la transaction (champ existant `transaction_id`).
- Édition / suppression d'une liste avant clôture.

### Technique
- 1 migration SQL : `budget_nodes.kind` + colonnes `profile.shopping_default_wallet_id`, `shopping_default_node_id`. Tags : suppression cascade via FK existante sur `transaction_tags`.
- Pages modifiées : `transactions.tsx`, `wallets.tsx`, `budgets.tsx`, `shopping.tsx`. Composant `node-picker.tsx` (ajout option exclure `subtotal`). Composant `tag-selector` réutilisable extrait.
- Pas de changement de trigger SQL : la conversion MGA reste un calcul d'affichage.

```text
Estimation : ~6 fichiers modifiés, 1 migration, 0 breaking change.
```

OK pour partir là‑dessus ?