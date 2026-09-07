# Migration Appwrite Auth

## Objectif

Remplacer la recherche publique de `login + mot_de_passe` dans la table `agents`
par des sessions Appwrite Auth et des permissions basées sur l’équipe
`calypco_staff`.

## 1. Sauvegarde

Avant le basculement :

1. exporter les tables ou activer une sauvegarde Appwrite ;
2. conserver la table `agents` jusqu’à validation de tous les nouveaux comptes ;
3. ne jamais exporter ou communiquer la colonne `mot_de_passe` hors d’un stockage
   sécurisé.

## 2. Premier administrateur

1. Dans **Auth > Users**, créer le premier utilisateur avec son e-mail personnel.
2. Dans **Auth > Teams**, créer l’équipe avec l’ID `calypco_staff`.
3. Ajouter le premier utilisateur comme membre confirmé avec les rôles `owner` et
   `admin`.
4. Tester sa connexion dans `admin.html`.

Ce compte est le seul compte créé manuellement. Les suivants sont invités depuis
le panneau d’administration.

## 3. Matrice de permissions cible

Les colonnes indiquent les opérations `create / read / update / delete`.

| Table | Any | admin | billets | resto |
|---|---|---|---|---|
| `agents` | aucune | aucune | aucune | aucune |
| `billets` | aucune | toutes | read, update | aucune |
| `billets_interne` | aucune | toutes | read, update | aucune |
| `etudiants` | aucune | toutes | read | aucune |
| `menu_resto` | aucune | toutes | aucune | read |
| `reservation` | create | toutes | read, update | aucune |
| `validations` | aucune | toutes | create, read | aucune |
| `ventes_resto` | aucune | toutes | aucune | create, read |

Utiliser les rôles Appwrite :

- `Role.team("calypco_staff", "admin")`
- `Role.team("calypco_staff", "billets")`
- `Role.team("calypco_staff", "resto")`

La sécurité par ligne peut rester désactivée puisque cette application utilise des
permissions par table.

## 4. Ordre du basculement

1. Déployer le nouveau frontend.
2. Tester la connexion du premier administrateur.
3. Inviter un agent de test et valider son parcours complet.
4. Appliquer la matrice de permissions.
5. Tester une réservation publique, un billet et une vente.
6. Retirer tous les droits `Any` non prévus dans la matrice.
7. Après migration du personnel, supprimer la colonne `mot_de_passe`, puis la table
   `agents` si aucune autre donnée utile n’y demeure.

## 5. Retour arrière

En cas d’échec avant la suppression de l’ancienne table, rétablir temporairement la
version Git précédente et les permissions sauvegardées. Ne jamais maintenir les
permissions publiques plus longtemps que nécessaire.

## 6. Carte étudiant et recherche (obligatoire)

Dans la table `etudiants`, conserver les colonnes existantes et ajouter :

| Colonne | Type Appwrite | Taille | Obligatoire | Valeur par défaut |
|---|---|---:|---|---|
| `date_naissance` | String | 10 | oui | aucune |
| `annee_scolaire` | String | 9 | oui | aucune |
| `photo_data` | String | 200000 | non | null |

Formats attendus : `date_naissance` en `AAAA-MM-JJ` et `annee_scolaire` en
`2026-2027`. La photo est réduite dans le navigateur avant enregistrement.

Créer également ces index :

1. index **unique** sur `numero_etudiant` ;
2. index **fulltext** sur `nom` pour la recherche ;
3. index **key** sur `date_naissance` ;
4. index **key** sur `annee_scolaire` et `actif` si Appwrite accepte cet index
   composé dans le projet.

Une ancienne carte sans `annee_scolaire` n’ouvre plus droit au tarif étudiant :
l’administrateur doit la renouveler pour la rentrée courante.

## 7. Gestion des membres de l’équipe

L’administrateur qui gère les agents doit être membre confirmé de
`calypco_staff` avec les rôles Appwrite `owner` et `admin`. Le rôle métier
`admin` seul permet d’ouvrir l’écran, mais Appwrite exige `owner` pour modifier
ou supprimer les adhésions de l’équipe.

Le bouton WhatsApp prépare seulement le message et le lien vers
`connexion.html`. Pour un nouvel agent, créer d’abord l’accès sécurisé avec son
adresse e-mail technique ; l’application ne conserve jamais le mot de passe.
