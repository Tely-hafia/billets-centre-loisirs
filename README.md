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

## Mise en production

Suivre intégralement [la procédure de migration Appwrite](docs/APPWRITE_MIGRATION.md).
Les permissions de production ne doivent être modifiées qu’au moment du basculement,
après création et test du premier administrateur.
