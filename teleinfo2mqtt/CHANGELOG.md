# Changelog

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
