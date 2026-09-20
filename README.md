# Loyola Finance

PWA de gestion financière universitaire, avec frontend statique, API Express et PostgreSQL.

## Déploiement Vercel + Neon

### 1. Importer le projet

Importer le dépôt GitHub `Marcel07-Mpy/loyola` dans Vercel. Le point d'entrée est `server.js` et la PWA compilée est servie depuis `public/`.

### 2. Connecter PostgreSQL

Connecter une base PostgreSQL Neon au projet Vercel et exposer sa chaîne de connexion sous `DATABASE_URL`.

Utiliser de préférence la connexion **pooled** de Neon pour l'exécution serverless.

### 3. Variables d'environnement

Configurer au minimum :

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
```

Le chatbot est optionnel :

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=minimal
```

### 4. Initialisation automatique

Au premier appel vers `/api/*`, l'application :

1. détecte si la base PostgreSQL est vide ;
2. prend un verrou PostgreSQL pour éviter deux initialisations concurrentes ;
3. crée le schéma et les index nécessaires ;
4. active `pg_trgm` ;
5. insère uniquement les référentiels académiques ;
6. crée le compte admin avec `ADMIN_USERNAME` / `ADMIN_PASSWORD` s'il n'existe pas.

Aucun faux étudiant et aucun faux paiement ne sont créés.

Pour une initialisation manuelle, les commandes restent disponibles :

```bash
npm ci
npm run db:init
npm run db:admin
```

### 5. Vérifications

Après déploiement :

- `/api/health` doit répondre avec `status: OK` ;
- `/` doit afficher la PWA ;
- la connexion admin doit fonctionner ;
- `/manifest.webmanifest` et `/sw.js` doivent être accessibles.

## Sécurité

- Ne jamais committer de fichier `.env`.
- Utiliser un `JWT_SECRET` long et aléatoire.
- Utiliser un mot de passe administrateur fort.
- Conserver les secrets uniquement dans Vercel/Neon.
- Une fois l'admin créé, `ADMIN_PASSWORD` peut être retirée de l'environnement puis le projet redéployé si l'on ne souhaite plus conserver ce secret de bootstrap.
