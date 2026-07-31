# Ohana Home Assistant add-ons

Dépôt personnel d’add-ons Home Assistant pour l’infrastructure Ohana.

## Installation

1. Publier ce dépôt sur `https://github.com/cedric-HAOS/Ohana-hassio-addons`.
2. Lancer le workflow **Build teleinfo2mqtt Ohana**.
3. Rendre public le package GHCR `teleinfo2mqtt-ohana` si le dépôt GitHub est public.
4. Dans Home Assistant, ouvrir **Paramètres → Add-ons → Boutique des add-ons**.
5. Ouvrir **Dépôts**, ajouter l’URL du dépôt GitHub, puis installer
   **teleinfo2mqtt Ohana**.

## teleinfo2mqtt Ohana

Ce fork conserve la publication MQTT vers Home Assistant et ajoute une sortie
HTTP directe et indépendante vers Ohana-Agent :

```text
Compteur Linky → teleinfo2mqtt
                 ├─ MQTT → HA-Green
                 └─ HTTP → Ohana-Agent sur INFRA-01
```

Une indisponibilité du broker MQTT ne coupe pas la sortie Ohana. Une
indisponibilité d’Agent ne coupe pas la publication MQTT.

Le fork n'annonce pas de dépendance Supervisor vers un broker MQTT local : le broker externe configuré peut être indisponible sans empêcher la sortie HTTP Ohana.


Le workflow publie les architectures `amd64`, `aarch64`, `armv7` et `armhf`. L’architecture `i386`, annoncée par l’ancien manifeste mais absente des images amont, n’est pas proposée par ce fork.
