# teleinfo2mqtt Ohana

Fork de `teleinfo2mqtt` 9.0.6 adapté à l’infrastructure Ohana.

## Sorties indépendantes

- MQTT vers le broker configuré, pour Home Assistant.
- HTTP direct vers Ohana-Agent, pour superviser la chaîne Linky et RPI-Linky
  sans dépendre de HA-Green.

Le port série est la seule dépendance commune. Une erreur d’une sortie est
journalisée sans arrêter l’autre sortie ni la lecture des trames.
Le fork n’exige aucun broker MQTT local sur RPI-Linky : `MQTT_URL` peut
continuer à pointer vers Mosquitto sur HA-Green. Le processus reste actif si ce
broker est indisponible et poursuit l’envoi direct vers Ohana-Agent.

## Configuration Ohana

Configurer d’abord le plugin Téléinformation dans Vision, puis reporter le même
jeton dans l’add-on :

```yaml
OHANA_ENABLED: true
OHANA_URL: http://infra-01.ohana.lan:8770/v1/teleinformation/frames
OHANA_TOKEN: "jeton-dedie"
OHANA_SOURCE: rpi-linky
OHANA_TIMEOUT_MS: 3000
```

Le service Téléinformation déclaré dans l’architecture doit contenir :

```yaml
metadata:
  meter_id: "041964385922"
  source_id: rpi-linky
  maximum_age_seconds: 30
```

Le jeton est réservé à l’ingestion des trames. Il ne donne aucun accès à l’API
d’administration d’Ohana-Agent.

## Image

Le workflow GitHub Actions construit une image multiarchitecture et publie le
tag déclaré dans `config.yaml` sous :

```text
ghcr.io/cedric-haos/teleinfo2mqtt-ohana:<version>
```


Le workflow publie les architectures `amd64`, `aarch64`, `armv7` et `armhf`. L’architecture `i386`, annoncée par l’ancien manifeste mais absente des images amont, n’est pas proposée par ce fork.
