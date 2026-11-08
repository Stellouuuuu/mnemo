# Réseaux et HTTP

HTTP est le protocole de la communication entre un navigateur et un serveur web. Une requête contient une méthode, une adresse, des en-têtes et parfois un corps. La réponse contient un code de statut, des en-têtes et un corps.

La méthode GET lit une ressource sans la modifier, alors que POST envoie des données pour créer une ressource. PUT remplace entièrement une ressource et DELETE la supprime. Une méthode est idempotente quand la répéter donne le même résultat : c'est le cas de GET, PUT et DELETE, pas de POST.

Les codes de statut 2xx indiquent un succès, 3xx une redirection, 4xx une erreur du client et 5xx une erreur du serveur. Le code 404 signifie que la ressource est introuvable, le code 401 que l'authentification est requise.

Le DNS traduit un nom de domaine en adresse IP. Le navigateur interroge d'abord son cache, puis un résolveur, qui remonte jusqu'aux serveurs faisant autorité pour le domaine.

TLS chiffre la communication entre le navigateur et le serveur, et prouve l'identité du serveur grâce à un certificat signé par une autorité reconnue. C'est ce qui fait la différence entre HTTP et HTTPS.

Un cookie est une petite donnée que le serveur demande au navigateur de conserver et de renvoyer à chaque requête. L'attribut HttpOnly interdit à JavaScript de le lire, ce qui limite les vols de session par injection de script.

CORS est un mécanisme du navigateur qui décide si une page d'un site peut lire la réponse d'un autre site. Le serveur autorise des origines précises grâce à l'en-tête Access-Control-Allow-Origin.
