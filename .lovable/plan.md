# OPTIS — Axes d'amélioration suivants (après les 4 vagues)

Les 4 vagues du conseiller optimisateur de vie sont en place : briefing quotidien, recommandations, score de vie, suivi des conseils, simulateur, priorités de vie, revue hebdomadaire, coach IA, rapports et notifications. L'application est complète sur le périmètre "tableau de bord + conseiller individuel".

Voici les axes d'amélioration suivants, classés par impact et risque, sans remettre en cause ce qui fonctionne.

## Vague 5 — Connectivité et automatisation (fort impact, risque moyen)

1. **Import bancaire intelligent**
   - Support CSV / OFX / QIF (la plupart des banques exportent au moins CSV).
   - Mapping de colonnes personnalisable par fichier.
   - Détection automatique des doublons par date + montant + libellé avant insertion.
   - Apprendre la catégorie / tiers / budget_node depuis l'historique existant.

2. **Règles de catégorisation automatique**
   - Table `transaction_rules` : patterns (libellé, montant, compte, contrepartie) → catégorie, tags, projet, type.
   - Appliquées à l'import et à la saisie manuelle.
   - Score de confiance affiché pour chaque suggestion.

3. **Transactions récurrentes et modèles**
   - Modèles de transaction enregistrés (ex: "Facture électricité", "Salaire").
   - Génération automatique des occurrences à venir via `transaction_templates`.
   - Possibilité d'éditer / reporter une occurrence sans toucher au modèle.

4. **Notifications push / rappels programmés**
   - Utiliser les web-push pour échéances, habitudes non faites, budgets dépassés.
   - Local notifications quand l'app est ouverte hors ligne.

## Vague 6 — Qualité des données et confiance (fort impact, risque faible)

5. **Rapprochement bancaire**
   - Comparer le solde d'un portefeuille avec un solde importé/relevé.
   - Table `reconciliation_snapshots` : date, solde attendu, solde relevé, écart.
   - Liste des transactions non rapprochées avec filtre rapide.

6. **Détection d'anomalies et doublons**
   - Algorithme de détection des doublons dans les transactions (même montant ± 1 jour).
   - Transactions suspectes : montant anormalement élevé, libellé vide, devise sans taux.
   - Page de validation en lot.

7. **Audit renforcé et traçabilité**
   - Étendre `audit_log` à toutes les tables (y compris planification, documents, brainstorming).
   - Afficher l'historique complet d'une entité (qui a fait quoi, quand, depuis quel appareil).
   - Possibilité de restaurer une version précédente (soft delete / snapshot).

8. **Sauvegarde automatique chiffrée**
   - Export complet automatique (cloud storage) périodique.
   - Chiffrement côté client avant envoi.
   - Restauration depuis une sauvegarde datée.

## Vague 7 — Analyse et décision avancée (impact moyen, risque moyen)

9. **Scénarios probabilistes**
   - Ajouter Monte Carlo sur la prévision de trésorerie : intervalles de confiance (p10/p50/p90).
   - Variables aléatoires sur revenus, dépenses, retards de paiement.

10. **Rendement et optimisation patrimoniale**
    - Calcul de IRR (Taux Interne de Retour) par actif et par portefeuille.
    - Comparaison actif vs liquidité vs objectif.
    - Simulation "vendre maintenant vs garder".

11. **Analyse du train de vie avancée**
    - Dérive par catégorie sur 3 / 6 / 12 mois avec détection de tendance.
    - Postes de dépense anormaux par rapport à la médiane historique.
    - Affichage du "coût réel" mensualisé des abonnements et engagements.

12. **Tableaux de bord personnalisables**
    - L'utilisateur peut choisir les cartes affichées sur le dashboard.
    - Sauvegarde de plusieurs "vues" (finance, vie, projets).
    - Widgets réordonnables par drag & drop.

## Vague 8 — Multi-utilisateur et collaboration (impact moyen, risque élevé)

13. **Compte conjoint / familial**
    - Invitations par email entre comptes.
    - Permissions : lecture, saisie, admin.
    - Données partagées (portefeuilles communs, budgets communs) vs données privées.
    - Nécessite une refonte des RLS et des politiques de propriété.

14. **API publique documentée**
    - Clés d'API par utilisateur avec scopes.
    - Endpoints `/api/public/v1/*` pour lectures et écritures contrôlées.
    - Documentation OpenAPI / Swagger intégrée.

## Vague 9 — Expérience mobile et confort (impact moyen, risque faible)

15. **Application mobile native (PWA améliorée)**
    - Écran d'accueil avec widgets (solde, tâches du jour, habitudes).
    - Mode saisie rapide depuis le mobile : photo de facture, géolocalisation.
    - Navigation gestuelle.

16. **Saisie rapide universelle**
    - Barre de commande globale (Cmd+K / Ctrl+K) pour créer une transaction, une tâche, un projet.
    - Saisie en langage naturel : "dépense 50€ courses demain".
    - Suggestions contextuelles selon l'heure et le jour.

17. **Accessibilité et internationalisation**
    - Audit a11y (contrastes, navigation clavier, lecteurs d'écran).
    - i18n : anglais, espagnol, allemand au minimum.
    - Formats de date et de devise locaux.

## Vague 10 — Performance et robustesse (impact élevé, risque faible)

18. **Virtualisation des grandes listes**
    - Transactions, budgets, planning : virtualisation React pour maintenir 60 fps à 10 000+ lignes.
    - Pagination infinie là où c'est pertinent.

19. **Cache et synchronisation optimisée**
    - Cache des agrégats lourds dans IndexedDB avec invalidation par table.
    - Sync delta (seulement les lignes modifiées depuis last_sync).
    - Gestion des conflits de fusion (merge) quand plusieurs appareils éditent la même ligne.

20. **Tests automatisés et monitoring**
    - Tests unitaires sur `finance.ts`, `analytics.ts`, `advisor.ts`, `life-score.ts`.
    - Tests E2E sur les parcours critiques : saisie transaction, clôture mensuelle, coach.
    - Dashboard de qualité (couverture, erreurs, temps de sync).

## Ordre recommandé

Vague 5 (import + règles + automatisation) puis Vague 6 (qualité des données) car elles augmentent la valeur de toutes les données déjà saisies. Vague 9 (confort mobile) peut être menée en parallèle. Vague 10 devient prioritaire dès que les volumes de données atteignent quelques milliers de lignes. Vague 8 (multi-utilisateur) reste en dernier car elle touche aux fondations sécuritaires.
