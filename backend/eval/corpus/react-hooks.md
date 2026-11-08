# Les hooks de React

useState déclare une variable d'état locale à un composant. Appeler la fonction de mise à jour déclenche un nouveau rendu avec la nouvelle valeur. L'état n'est jamais modifié directement : on en fournit une nouvelle valeur.

useEffect exécute un effet de bord après le rendu du composant. Il sert à synchroniser le composant avec un système extérieur, par exemple une requête réseau, un abonnement ou le titre de la page. Sans tableau de dépendances, l'effet s'exécute après chaque rendu. Avec un tableau vide, il ne s'exécute qu'une fois, au montage.

La fonction de nettoyage renvoyée par useEffect est appelée avant que l'effet suivant ne s'exécute et au démontage du composant. On y annule les abonnements et les minuteries pour éviter les fuites de mémoire.

useMemo mémorise le résultat d'un calcul coûteux entre deux rendus. La valeur n'est recalculée que si ses dépendances changent. useCallback fait la même chose pour une fonction, afin de garder la même référence entre deux rendus.

Utilisez useMemo et useCallback seulement après avoir mesuré un problème de performance : l'optimisation prématurée complique le code sans bénéfice visible.

useRef conserve une valeur modifiable qui survit aux rendus sans en déclencher un nouveau. On l'utilise pour accéder à un élément du DOM, par exemple pour donner le focus à un champ de saisie.

Les hooks doivent être appelés au niveau supérieur d'un composant ou d'un autre hook, jamais dans une condition ni dans une boucle, car React retrouve l'état de chaque hook grâce à l'ordre des appels.
