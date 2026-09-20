# Loyola Finance

PWA de gestion financière universitaire, avec frontend statique, API Express et PostgreSQL.

## Déploiement Vercel + PostgreSQL

### 1. Variables d'environnement

Configurer les variables suivantes dans l'environnement de production :

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=minimal
```

`GEMINI_API_KEY` est facultative si le chatbot n'est pas utilisé.

### 2. Initialiser une base PostgreSQL neuve

Avec `DATABASE_URL` configurée localement ou dans un environnement sécurisé :

```bash
npm ci
npm run db:init
npm run db:admin
```

`db:init` crée le schéma, active `pg_trgm`, applique les migrations et ajoute uniquement les référentiels académiques.
`db:admin` crée le compte administrateur avec `ADMIN_USERNAME` et `ADMIN_PASSWORD`.

### 3. Déployer sur Vercel

Importer le dépôt GitHub `Marcel07-Mpy/loyola` comme nouveau projet Vercel. Le point d'entrée est `server.js`; la PWA compilée est servie depuis `public/`.

### 4. Vérifications

Après déploiement :

- `/api/health` doit répondre avec `status: OK`.
- La page `/` doit afficher la PWA.
- La connexion admin doit fonctionner après exécution de `npm run db:admin`.
- Le manifest `/manifest.webmanifest` et le service worker `/sw.js` doivent être accessibles.

## Sécurité

- Ne jamais committer de fichier `.env`.
- Utiliser un `JWT_SECRET` long et aléatoire.
- Utiliser un mot de passe administrateur fort.
- Les secrets de production doivent rester dans Vercel/Neon.
