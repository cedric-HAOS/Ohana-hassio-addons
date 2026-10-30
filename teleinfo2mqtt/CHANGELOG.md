# Changelog

## 9.0.6-ohana.3

- Ajout d'un panneau « Linky » dans la barre latérale de Home Assistant
  (Ingress, aucun port exposé) : état du port série, de la sortie Ohana-Agent
  (INFRA-01) et de la sortie MQTT (HA-01), date et heure de la dernière
  transmission réussie, dernier échec et sa cause, valeurs de la dernière
  trame transmise.
- Contrôles du panneau : pause et reprise de chaque sortie (valables jusqu'au
  prochain redémarrage) et redémarrage de l'add-on par le Supervisor.
- Dates du panneau en Europe/Paris.
- Le message de reprise de la sortie Ohana indique la durée de la coupure.
- Option interne PANEL_PORT (8099 par défaut) pour le port du panneau.
## 9.0.6-ohana.2

- Correction des mocks MQTT afin que la suite Jest valide le fork avant la
  construction des images.
- Alignement des métadonnées du paquet, de l'add-on et de l'image OCI sur le
  dépôt `Ohana-hassio-addons`.

## 9.0.6-ohana.1

- Ajout de la sortie HTTP directe vers Ohana-Agent.
- Indépendance des sorties MQTT et Ohana, y compris lors de leur initialisation.
- Maintien de la lecture série si le broker MQTT ou Agent est indisponible.
- Limitation à une requête HTTP en vol afin d’éviter toute accumulation.
- Ajout des options OHANA_URL, OHANA_TOKEN, OHANA_SOURCE et OHANA_TIMEOUT_MS.
- Suppression de la dépendance Supervisor à un broker MQTT local : l’URL MQTT
  configurée peut désigner HA-Green.
- Image multiarchitecture maintenue dans GitHub Container Registry.
- Architectures publiées : `amd64`, `aarch64`, `armv7` et `armhf`; retrait de `i386`, absent de l’image amont.
