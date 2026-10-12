# Démo de bout en bout : S22 → API → PostgreSQL

Toutes les commandes se tapent dans un terminal **PowerShell** sur le PC. Les blocs qui définissent `$tel` ou `$id` doivent être lancés dans la même fenêtre que ceux qui les utilisent.

## 1. Préparer (avant l'entretien, ~5 min)

**Terminal 1 : base et API** (dans le dossier du dépôt, sur `main`)

```powershell
cd C:\Users\FlowUP\Desktop\step\StepByStep
pnpm install
pnpm db:up                                              # PostgreSQL (Docker Desktop doit tourner)
Copy-Item apps\api\.env.example apps\api\.env           # une seule fois
pnpm db:migrate                                         # compile l'API et applique les migrations
pnpm build
pnpm --filter @stepbystep/api start                     # laisser tourner
```

**Terminal 2 : téléphone et Metro**

```powershell
$tel = '192.168.1.91:<port>'          # écran « Débogage sans fil » du S22 (le port change à chaque activation)
adb connect $tel
adb -s $tel reverse tcp:3000 tcp:3000 # localhost:3000 du téléphone → API du PC
adb -s $tel reverse tcp:8081 tcp:8081 # localhost:8081 du téléphone → Metro
cd C:\Users\FlowUP\Desktop\step\StepByStep
pnpm --filter @stepbystep/mobile start   # Metro, laisser tourner
```

Ouvrir l'app StepByStep sur le téléphone. Si elle ne trouve pas Metro :

```powershell
adb -s $tel shell am start -a android.intent.action.VIEW -d "exp+stepbystep://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.stepbystep.app
```

`-s $tel` est obligatoire : ADB voit le téléphone plusieurs fois (connexion par IP et entrées découvertes sur le réseau).

Vérification : bouton **« Tester la connexion à l'API »** → `HTTP 200`, base `up`.

## 2. Déroulé de la démo (~3 min)

1. **« Envoyer un relevé »** : l'app lit le capteur matériel (module Kotlin), le domaine valide le relevé, l'API l'enregistre.
2. **Marcher** une vingtaine de pas avec le téléphone.
3. **« Envoyer un relevé »** à nouveau : le grand chiffre affiche les pas du jour, recalculés par le serveur avec le même domaine que le téléphone.
4. **Montrer la base** (terminal 3, ci-dessous) : les relevés bruts et le total du jour.
5. **Rejouer le dernier relevé depuis le PC** : `accepted: 0, duplicates: 1` → idempotence.

## 3. Vérifier en base

```powershell
$tel = '192.168.1.91:<port>'
$id = (adb -s $tel shell run-as com.stepbystep.app cat files/sync-state.json | ConvertFrom-Json).deviceId
"Appareil : $id"
docker exec stepbystep-postgres-1 psql -U stepbystep -d stepbystep -c "select steps_since_boot, boot_count, taken_at from step_counter_readings where device_id = '$id' order by taken_at;" -c "select day, steps, updated_at from daily_steps where device_id = '$id';"
```

- `run-as` lit le fichier privé de l'app (possible car c'est une version debug) : c'est l'identifiant d'appareil que l'app a reçu de `POST /v1/devices` et qu'elle garde entre deux lancements.
- Les pas du jour = différence entre le premier et le dernier compteur de la journée (ex. 117 633 − 117 555 = 78).

## 4. Rejouer un relevé : prouver le passage par l'API et l'idempotence

Reprendre `steps_since_boot` et `taken_at` du **dernier** relevé affiché au point 3 (instant en UTC, avec `Z`) :

```powershell
$body = '{"readings":[{"stepsSinceBoot":117633,"bootCount":5,"takenAt":"2026-10-12T13:27:02.163Z"}]}'
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/v1/devices/$id/readings" -ContentType 'application/json' -Body $body
```

Réponse attendue : `accepted: 0`, `duplicates: 1`, `days: []`.

### Pourquoi `accepted: 0` et `duplicates: 1`

- **Un relevé est identifié par `(appareil, instant, numéro de démarrage)`** : c'est la clé primaire de `step_counter_readings`. Le relevé rejoué a exactement la même identité que celui envoyé par le téléphone.
- **L'API insère en `ON CONFLICT DO NOTHING … RETURNING`** : PostgreSQL ignore la ligne en conflit et ne renvoie que les lignes réellement ajoutées. Ici aucune → `accepted: 0`, et `duplicates` = relevés reçus − relevés ajoutés = `1`.
- **`days: []`** : rien de nouveau n'a été ajouté, donc aucun jour n'est recalculé (le total en base reste le même).
- **Pourquoi c'est voulu (Idempotent Receiver, ADR 0002)** : sur mobile, le réseau coupe. Le téléphone peut envoyer un lot, ne jamais recevoir la réponse, puis le renvoyer. Sans idempotence, ses pas seraient comptés deux fois. Ici, renvoyer un lot autant de fois qu'on veut ne change rien.
- **La preuve vient de la base, pas de l'app** : l'app n'écrit jamais directement dans PostgreSQL. Si l'API reconnaît ce relevé comme doublon, c'est qu'elle l'a elle-même enregistré lors de l'envoi depuis le téléphone.
- Contre-exemple, à expliquer sans le lancer : avec un seul chiffre de `takenAt` changé, ce serait un nouvel instant, donc un nouveau relevé (`accepted: 1`). Il serait enregistré pour de vrai et fausserait le total du jour de la démo.

## 5. Questions probables

| Question                                      | Réponse courte                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pourquoi un module natif Kotlin ?             | `expo-sensors` ne donne sur Android que les pas depuis l'abonnement. Il faut le cumul de `TYPE_STEP_COUNTER` et `BOOT_COUNT` pour détecter les redémarrages. |
| Que fait le Kotlin ?                          | Le strict minimum (Humble Object) : lire le capteur et le numéro de démarrage. Toute la logique est dans le domaine TypeScript, testé à 100 %.               |
| Pourquoi pas les pas d'avant l'installation ? | Le capteur ne donne qu'un cumul depuis le redémarrage, sans repère à minuit : l'historique commence au premier relevé (ADR 0001).                            |
| Comment le téléphone joint l'API du PC ?      | `adb reverse` : le `localhost:3000` du téléphone passe par ADB Wi-Fi jusqu'au PC, sans IP codée en dur ni pare-feu.                                          |
| Pourquoi le fuseau n'est envoyé qu'une fois ? | Le jour local d'un relevé dépend du fuseau. Il est historisé par périodes, envoyé au premier envoi ou quand il change, jamais répété (ADR 0002).             |
| Même domaine des deux côtés ?                 | Oui : `@stepbystep/domain` valide le relevé dans l'app et recalcule les pas par jour dans l'API.                                                             |
| Deux envois simultanés du même appareil ?     | Verrou `SELECT … FOR UPDATE` sur l'appareil : les lots sont traités l'un après l'autre, dans une transaction.                                                |
