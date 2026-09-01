# Billets Centre de Loisirs — Calypço

Application Web statique pour les réservations publiques, le contrôle des billets,
la restauration et l’administration du centre Calypço.

## Architecture

- `index.html` : accueil et réservations publiques.
- `agent.html` : espace billets et restauration.
- `admin.html` : administration, statistiques et invitations du personnel.
- `accept-invite.html` : acceptation d’une invitation Appwrite Team.
- `reset-password.html` : définition sécurisée du mot de passe.
- `js/appwrite-config.js` : identifiants publics du projet et noms des ressources.
- `js/appwrite-client.js` : client Appwrite partagé.
- `js/auth-service.js` : sessions Appwrite et rôles de l’équipe.

## Authentification

Les employés utilisent Appwrite Auth avec leur e-mail et leur mot de passe. Les
autorisations sont portées par l’équipe Appwrite `calypco_staff` et ses rôles :

- `admin` : administration et invitation du personnel ;
- `billets` : billets, réservations et vérification des étudiants ;
- `resto` : menu et ventes restauration.

Les mots de passe ne sont jamais stockés dans les tables métier. L’administrateur
invite un employé par e-mail ; l’employé accepte l’invitation puis choisit lui-même
son mot de passe.

## Développement

Le projet ne nécessite pas de compilation. Servez sa racine avec un serveur HTTP
statique et ouvrez `index.html`.

Avant un test local avec le vrai projet Appwrite, ajoutez `localhost` comme plateforme
Web autorisée dans la console Appwrite.

Vérification JavaScript :

```bash
for file in js/*.js; do node --check "$file"; done
```

## Design mobile et PWA

Les espaces professionnels utilisent une interface responsive adaptée au rôle de la
session : billets, restauration ou administration. La PWA « Calypço Équipe » est
décrite par `manifest.webmanifest` et pilotée par `service-worker.js`.

- `css/app-v2.css` : identité visuelle et composants métiers ;
- `js/pwa.js` : installation, état réseau et mises à jour ;
- `offline.html` : écran de sécurité hors connexion ;
- `assets/icons/` : icônes standard et maskable.

Les pages et ressources statiques peuvent être relues depuis le cache. Les appels
Appwrite, les validations de billets, les ventes et l’administration restent toujours
en ligne afin d’éviter les doublons et les écritures non contrôlées.

Pour tester l’installation, servir le projet par HTTPS ou sur `localhost`, puis
utiliser l’audit PWA du navigateur.

## Mise en production

Suivre intégralement [la procédure de migration Appwrite](docs/APPWRITE_MIGRATION.md).
Les permissions de production ne doivent être modifiées qu’au moment du basculement,
après création et test du premier administrateur.
