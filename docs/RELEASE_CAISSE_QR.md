# Livraison caisse, QR et administration

## Fonctionnalités livrées

- Une seule page de connexion explicite. Chrome peut proposer les identifiants, mais l'application n'ouvre pas automatiquement un poste : l'utilisateur doit appuyer sur **Se connecter**.
- Après identification, un administrateur choisit son poste : administration, gérant, contrôle d'accès ou restauration.
- Le gérant et la restauration ouvrent leur caisse en déclarant les espèces reçues au départ. Il n'existe plus de fausse caisse locale en cas de refus Appwrite.
- Les ventes se font uniquement en espèces. Le prix vient du billet ou du menu enregistré dans Appwrite.
- La caisse billets fonctionne comme un panier : affichage du billet et de son prix, ajout de plusieurs billets, montant reçu, monnaie et validation.
- Le reçu contient tous les billets réellement enregistrés et un QR groupé. La génération et la lecture du QR se font dans le navigateur, sans transmettre les billets à un service QR externe.
- Le contrôleur peut saisir un numéro ou scanner le reçu. Un billet inconnu, non vendu, déjà confirmé, remboursé ou destiné aux jeux internes est refusé.
- L'agent clôture sa caisse en saisissant les espèces remises. Un commentaire n'est obligatoire qu'en cas d'écart.
- L'administration conserve un tableau de bord synthétique par période, un journal quotidien par agent, les alertes, les statistiques détaillées billets/restauration et l'historique des réservations avec dates et pagination.
- Les stocks de billets d'entrée et de jeux internes se consultent par type. Seuls les billets inutilisés sans vente correspondante peuvent être modifiés ou supprimés, et seulement lorsqu'aucune caisse n'est ouverte.
- Les listes importantes utilisent la pagination Appwrite. Les requêtes identiques rapprochées sont regroupées et gardées brièvement en mémoire, jamais dans le stockage persistant du téléphone.

## Configuration Appwrite indispensable

Le site statique ne peut pas modifier les autorisations du projet Appwrite. Avant une utilisation réelle, vérifier les droits de l'équipe `calypco_staff` sur les tables existantes, notamment `sessions_caisse`, `validations`, `billets`, `billets_interne`, `ventes_resto`, `menu_resto`, `reservations` et `mouvements_caisse`.

Les rôles doivent disposer uniquement des opérations nécessaires à leur poste. Une erreur 401/403 reste affichée comme un refus : aucune ouverture de caisse ou vente locale n'est simulée.

## Limites connues avant exploitation financière

- GitHub Pages exécute une application statique. Les identifiants déterministes réduisent les doubles clics, mais une vente composée de plusieurs écritures Appwrite n'est pas une transaction atomique. Une coupure réseau peut donc produire une réussite partielle, signalée clairement dans l'interface. Une Appwrite Function serveur sera nécessaire pour garantir une atomicité financière complète.
- Le partage WhatsApp fourni sert à envoyer manuellement le lien de connexion à un compte déjà activé. Créer un compte ou définir un mot de passe uniquement par numéro WhatsApp demanderait un service serveur et un mécanisme de jeton sécurisé.
- Les photos Google Drive n'ont pas été copiées : aucun accès aux fichiers originaux n'était disponible dans l'environnement de livraison. Pour préserver qualité et consommation Internet, joindre les originaux ou un ZIP permettra de produire des WebP locaux et responsifs. La galerie actuelle reste fonctionnelle avec ses visuels existants.
