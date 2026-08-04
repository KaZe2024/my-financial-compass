# Pourquoi l'app ne s'ouvre pas hors connexion sur Android

## Diagnostic (vérifié sur le site publié)

1. Le service worker publié (`/sw.js`) existe bien, mais sa liste de fichiers à mettre en cache est fausse : il demande `client/assets/...` alors que le site sert `/assets/...` (vérifié : `client/assets/styles-…css` renvoie 404, `/assets/styles-…css` renvoie 200). Quand une seule URL du pré-cache échoue, l'installation entière du service worker échoue → **rien n'est mis en cache, donc rien ne s'ouvre hors ligne**.
2. Aucune page HTML n'est mise en cache d'avance, et le repli de navigation pointe sur `/` qui n'est pas pré-caché. Même sans le bug n°1, une navigation hors ligne n'aurait pas de page à afficher.

Le cache local des données (Dexie) et la file d'attente des saisies fonctionnent déjà — c'est uniquement l'enveloppe de l'application (HTML + JS) qui manque hors réseau.

## Correctifs prévus

1. **Corriger les chemins du pré-cache** dans la configuration PWA (`vite.config.ts`) : réécrire le préfixe `client/` → `/` pour que toutes les ressources pré-cachées correspondent aux URLs réellement servies.
2. **Ajouter une enveloppe hors ligne** : une page statique `public/offline.html` (branding OPTIS, message « mode hors ligne », bouton Réessayer) pré-cachée, utilisée comme repli de navigation à la place de `/`.
3. **Garder les pages visitées disponibles** : la stratégie `NetworkFirst` sur les navigations est conservée, donc après une première visite en ligne, `/dashboard` et les autres pages s'ouvrent hors connexion ; les URLs jamais visitées affichent l'enveloppe hors ligne.
4. **Exclure du cache** les appels réseau vers le backend et `/api/public`, `/~oauth`, `/mcp` pour éviter des réponses obsolètes.
5. **Vérification** : après publication, contrôler que `/sw.js` ne référence plus de chemins 404 et tester le chargement Chrome Android en mode avion.

## Détails techniques

- `workbox.modifyURLPrefix: { "client/": "/" }` (ou `manifestTransforms` équivalent) pour recadrer le manifeste de pré-cache.
- `includeAssets: ["offline.html", "icon-192.png", "icon-512.png"]`, `navigateFallback: "/offline.html"`, denylist inchangée + `/mcp`.
- `registerType: "autoUpdate"` et le garde-fou de `src/lib/offline/register-sw.ts` (pas d'enregistrement en preview/iframe/dev) restent inchangés.

## À savoir

- Le mode hors ligne ne fonctionne que sur l'URL publiée (`vault-vista-verse.lovable.app`), pas dans l'aperçu Lovable.
- Il faudra ouvrir l'app une fois **en ligne** après la publication pour que le service worker s'installe et remplisse le cache ; ensuite l'ouverture sans réseau fonctionnera.
