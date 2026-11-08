# Bases de données relationnelles

Une requête SELECT lit des lignes dans une ou plusieurs tables. La clause WHERE filtre les lignes avant le regroupement, tandis que HAVING filtre les groupes produits par GROUP BY.

Une jointure INNER JOIN ne garde que les lignes qui ont une correspondance dans les deux tables. Une jointure LEFT JOIN garde toutes les lignes de la table de gauche, avec des valeurs NULL quand il n'existe pas de correspondance à droite.

Un index accélère les recherches sur une colonne en évitant de parcourir toute la table. Il ralentit en contrepartie les écritures, car il doit être mis à jour à chaque insertion ou modification.

Une transaction regroupe plusieurs opérations qui réussissent ou échouent ensemble. Les propriétés ACID garantissent l'atomicité, la cohérence, l'isolation et la durabilité des données.

La normalisation découpe les données en plusieurs tables pour éviter les répétitions. La troisième forme normale demande que chaque colonne dépende uniquement de la clé primaire, et de rien d'autre.

Une clé étrangère relie une colonne à la clé primaire d'une autre table. Elle empêche d'insérer une ligne qui référence un enregistrement inexistant, et peut supprimer en cascade les lignes dépendantes.

L'injection SQL se produit quand une entrée utilisateur est collée telle quelle dans une requête. Les requêtes paramétrées règlent le problème en séparant le code SQL des valeurs.
