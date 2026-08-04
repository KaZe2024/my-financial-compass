# Débloquer OPTIS en mode hors ligne sur Android

## Diagnostic vérifié

- Le service worker actuellement publié est bien installé et ses ressources JavaScript/CSS sont pré-cachées avec les bons chemins.
- Le blocage vient de la navigation : la règle générée pour `navigateFallback: "/offline.html"` est enregistrée avant la stratégie `NetworkFirst` et capture toutes les pages (`/`, `/dashboard`, etc.). Hors connexion, elle renvoie donc systématiquement l’écran « Mode hors ligne », même si le tableau de bord a déjà été visité.
- La route d’accueil `/` utilise aussi le client d’authentification réseau direct, contrairement à la zone authentifiée qui dispose déjà du repli de session hors ligne. Cela peut empêcher l’ouverture depuis l’icône Android lorsque son `start_url` est `/`.

## Correctifs

1. **Corriger la stratégie du service worker**
   - Retirer le fallback de navigation qui intercepte tout avant le cache des pages.
   - Garder une seule règle `NetworkFirst` pour les navigations : réseau en priorité, page visitée en cache en cas de coupure, puis `offline.html` seulement si cette URL n’a jamais été ouverte.
   - Continuer à exclure les routes API, OAuth et MCP du cache.

2. **Garantir un démarrage Android hors ligne**
   - Pré-cacher une véritable enveloppe applicative issue de `/dashboard` ou `/` afin que l’application puisse démarrer après une première ouverture en ligne, sans dépendre d’une navigation précédemment mise en cache par hasard.
   - Aligner la route `/` sur l’authentification offline-first pour réutiliser la session locale au lieu d’attendre le réseau.
   - Ajuster le démarrage PWA vers la route applicative fiable si nécessaire, sans modifier les données métier.

3. **Mettre à jour les installations existantes**
   - Conserver la mise à jour automatique du service worker et supprimer les anciens caches de navigation devenus incompatibles.
   - Faire en sorte que le nouvel écran hors ligne ne boucle plus sur lui-même avec « Réessayer » ou « Ouvrir le tableau de bord ».

4. **Valider avant publication**
   - Vérifier le service worker généré : une seule stratégie de navigation, cache des pages et fallback terminal correctement ordonnés.
   - Tester dans un navigateur propre : ouverture en ligne, chargement du dashboard, passage hors ligne, rechargement direct de `/dashboard` et lancement depuis `/`.
   - Après publication, vérifier la version réellement servie sur `vault-vista-verse.lovable.app`.

## Après publication sur votre Android

1. Ouvrir OPTIS une fois avec Internet et attendre l’affichage complet du tableau de bord.
2. Fermer puis rouvrir l’application encore une fois en ligne pour laisser la nouvelle version remplacer l’ancien service worker.
3. Activer le mode avion et relancer OPTIS. Si Chrome conserve exceptionnellement l’ancien worker, supprimer une seule fois les données du site OPTIS puis refaire les deux ouvertures en ligne.