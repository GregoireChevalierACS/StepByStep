# Types de problème de l'API

Toutes les erreurs de l'API sont servies au format _Problem Details_ ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), en `application/problem+json`. Le champ `type` identifie la nature du problème : c'est lui qu'un client teste, jamais le texte de `detail`, destiné à un humain et susceptible de changer.

La plupart des erreurs ont le type `about:blank` : le statut HTTP suffit à les traiter (400 requête mal formée, 422 valeur refusée par le domaine…). Les types ci-dessous sont ceux qui appellent une réaction précise du client.

## device-not-found

`https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md#device-not-found`

- **Statut** : 404
- **Titre** : Appareil inconnu
- **Cause** : l'identifiant d'appareil de l'URL n'existe pas sur ce serveur (base réinitialisée, appareil supprimé, identifiant obtenu auprès d'un autre serveur).
- **Réaction attendue** : le client oublie son identifiant, enregistre un nouvel appareil (`POST /v1/devices`) et renvoie ses relevés. C'est sans risque : l'envoi des relevés est idempotent.

Une 404 seule ne suffit pas à conclure : une route mal écrite ou une mauvaise adresse de serveur en renvoient une aussi, et le client créerait alors un appareil orphelin à chaque envoi.

```json
{
  "type": "https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md#device-not-found",
  "title": "Appareil inconnu",
  "status": 404,
  "detail": "Appareil inconnu : 00000000-0000-4000-8000-000000000000",
  "instance": "/v1/devices/00000000-0000-4000-8000-000000000000/readings"
}
```
