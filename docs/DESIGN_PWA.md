# Design et PWA Calypço

## Principes

Le site public et les postes métiers partagent la même identité, mais pas la même
densité visuelle :

- le site public reste expressif et orienté découverte ;
- le poste agent privilégie la vitesse, les grandes cibles tactiles et le retour
  immédiat ;
- l’administration privilégie la lecture des chiffres, la comparaison et la revue
  des anomalies.

## Routage par rôle

| Rôle Appwrite | Interface agent |
|---|---|
| `billets` | contrôle des billets uniquement |
| `resto` | caisse restauration uniquement |
| `billets` + `resto` | sélecteur entre les deux postes |
| `admin` | accès au tableau de bord et, depuis le poste agent, aux deux métiers |

Le masquage des écrans améliore l’ergonomie. La sécurité reste assurée par les rôles
et permissions Appwrite.

## PWA

La PWA professionnelle démarre sur `agent.html`. Le manifeste propose également un
raccourci vers l’administration. Le service worker :

1. précharge uniquement la coque statique ;
2. privilégie le réseau afin de recevoir rapidement les nouvelles versions ;
3. utilise le cache seulement comme repli pour l’interface ;
4. ne met jamais en cache Appwrite ou une API distante ;
5. affiche une page de sécurité lorsqu’une opération est ouverte hors connexion.

## Alertes initiales

Le tableau de bord réalise des contrôles de cohérence sur la période sélectionnée :

- billet journalisé plusieurs fois ;
- validation ou vente sans agent ;
- montant ou quantité invalide ;
- réutilisation fréquente d’un numéro étudiant ;
- numéro de vente partagé entre plusieurs agents ou réutilisé longtemps après sa
  création.

Ces résultats sont des **anomalies à vérifier**, jamais des accusations. La prochaine
étape de sécurité consiste à déplacer les écritures métier dans des fonctions Appwrite,
puis à ajouter rapprochement de caisse, modes de paiement et journal des corrections.
