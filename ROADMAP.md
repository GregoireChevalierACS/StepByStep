# StepByStep : plan de route

Application Android de comptage de pas pour **Samsung Galaxy S22**, écrite en **TypeScript** et développée en **Test Driven Development**.

- Dépôt : https://github.com/GregoireChevalierACS/StepByStep
- Contributeur : un seul (l'auteur du dépôt)

---

## Sommaire

0. [Contraintes techniques](#0-contraintes-techniques)
1. [Stack](#1-stack)
2. [Architecture](#2-architecture)
3. [Design patterns](#3-design-patterns)
4. [Stratégie de tests](#4-stratégie-de-tests)
5. [Phases](#5-phases)
6. [Premier test](#6-premier-test)
7. [Bonnes pratiques](#7-bonnes-pratiques)
8. [Annexe : déploiement sans câble USB](#8-annexe--déploiement-sans-câble-usb)

---

## 0. Contraintes techniques

| Sujet | Ce qu'il faut savoir |
|---|---|
| **Appareil cible** | S22 `SM-S901U1`, **Android 16** (SDK 36), One UI 8. Capteurs matériels Samsung `step_counter` et `step_detector` présents. |
| **Capteur** | Android expose `TYPE_STEP_COUNTER`, un capteur matériel qui compte les pas depuis le dernier redémarrage, même quand l'app est fermée, avec une consommation de batterie quasi nulle. |
| **Permission** | `ACTIVITY_RECOGNITION` doit être demandée à l'exécution. |
| **Historique** | **Ni Samsung Health ni Health Connect** (voir [ADR 0001](docs/adr/0001-historique-sans-health-connect.md)) : l'app construit elle-même son historique en **relevant périodiquement** la valeur cumulée de `TYPE_STEP_COUNTER` et en la stockant en SQLite. L'historique commence donc à l'installation de l'app. |
| **Redémarrage** | Le compteur matériel **repart à 0 à chaque redémarrage**. Le domaine doit détecter cette remise à zéro dans la suite des relevés. Les pas faits entre le dernier relevé et l'extinction sont perdus, sauf si on prend un relevé à l'extinction (`ACTION_SHUTDOWN`) ou au démarrage (`BOOT_COMPLETED`). |
| **Piège Expo** | `expo-sensors` (Pedometer) **ne fournit pas l'historique sur Android** : il ne compte qu'en temps réel, quand l'app est ouverte. Il faut donc un **petit module natif Expo (Kotlin)** qui lit `TYPE_STEP_COUNTER` à la demande, appelé depuis une tâche de fond. |
| **Piège Samsung** | One UI met en veille agressive les apps en arrière-plan (« Applications en veille profonde »). Il faut un écran qui guide l'utilisateur pour exclure l'app. **C'est critique** : sans relevés en arrière-plan, l'historique a des trous. |
| **Pas de câble USB data** | Tout le développement sur appareil passe par le **débogage sans fil (ADB Wi-Fi)** et par des **APK téléchargés via un lien ou un QR code**. Voir l'[annexe](#8-annexe--déploiement-sans-câble-usb). |

**Conséquence :** on utilise Expo avec un *development build* (EAS ou build local), pas Expo Go, car les modules natifs ne fonctionnent pas dans Expo Go.

---

## 1. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript `strict` + `noUncheckedIndexedAccess` | Typage maximal |
| Mobile | React Native + Expo (dev build) + Expo Router | Stack TS standard, config plugins pour le natif |
| Monorepo | pnpm workspaces | Isole un domaine **pur TS**, sans dépendance à React Native |
| Tests unitaires | Vitest (domaine) / Jest + `jest-expo` (app) | Vitest est très rapide pour boucler en TDD |
| Tests de composants | React Native Testing Library | Teste le comportement, pas l'implémentation |
| Tests E2E | **Maestro** (connecté au S22 par ADB Wi-Fi) | Simple et lisible (YAML) |
| Mutation testing | **Stryker** | Vérifie que les tests détectent vraiment les régressions |
| Property-based testing | `fast-check` | Invariants métier |
| Persistance | `expo-sqlite` + Drizzle ORM | Typé, migrations versionnées |
| Capteur de pas | Module natif Expo (Kotlin, Expo Modules API) pour `TYPE_STEP_COUNTER` + `expo-sensors` pour le temps réel | Historique construit par l'app, sans dépendance à Samsung Health ni à Health Connect |
| Qualité | ESLint (typescript-eslint strict), Prettier, Husky, lint-staged, commitlint | Garde-fous automatiques avant chaque commit |
| Règles d'architecture | ESLint `no-restricted-imports` sur le domaine (React, Expo, Drizzle, NestJS, TypeORM, `pg`), puis `dependency-cruiser` ou `eslint-plugin-boundaries` | **Empêche** le domaine d'importer l'infrastructure, mobile comme serveur |
| CI/CD | GitHub Actions + EAS Build | Lint, tests et mutation testing à chaque push ; APK installable sans câble |
| Serveur de synchronisation (optionnel) | NestJS + PostgreSQL + TypeORM (migrations), SQL brut pour les requêtes analytiques | Sauvegarde, multi-appareil et défis entre amis ; réutilise le domaine tel quel (voir [ADR 0002](docs/adr/0002-serveur-de-synchronisation-optionnel.md)) |
| Tests serveur | **Jest** (outil par défaut de NestJS, transformation TS par `@swc/jest`, y compris des sources de `@stepbystep/domain`) + `supertest` + Testcontainers (PostgreSQL réel) | Contract tests des repositories et E2E de l'API contre une vraie base. Le domaine reste testé avec Vitest |

---

## 2. Architecture

Architecture **hexagonale (Ports & Adapters)** :

```
StepByStep/
├── packages/
│   └── domain/src/             # TS pur, 0 dépendance, testé avec Vitest
│       ├── shared/             # Briques transverses du domaine (Result…)
│       ├── model/              # Entités et Value Objects
│       ├── services/           # Strategies (distance, calories, détection)
│       ├── ports/              # Interfaces (StepSource, StepRepository, Clock…)
│       └── usecases/           # Cas d'usage applicatifs
├── apps/
│   ├── mobile/                 # Expo
│   │   ├── modules/step-counter/ # Module natif Expo (Kotlin) : lecture de TYPE_STEP_COUNTER
│   │   ├── src/infrastructure/ # Adapters : StepCounter natif, Pedometer, SQLite
│   │   ├── src/presentation/   # Écrans + hooks ViewModel
│   │   ├── src/composition/    # Composition root (injection de dépendances)
│   │   └── e2e/                # Flows Maestro
│   └── api/                    # NestJS (phase 8, optionnel)
│       ├── src/modules/<contexte>/application/    # Cas d'usage serveur, appellent le domaine
│       ├── src/modules/<contexte>/infrastructure/ # Contrôleurs, DTO, repositories PostgreSQL
│       ├── src/migrations/     # Migrations TypeORM versionnées
│       └── test/               # E2E supertest + Testcontainers
├── docs/
│   └── adr/                    # Architecture Decision Records
└── .github/workflows/          # CI
```

**Règle d'or :** les dépendances pointent vers le domaine, jamais l'inverse. Le domaine ne connaît ni React, ni Expo, ni Android, ni NestJS. C'est ce qui permet au **même** `@stepbystep/domain` de tourner sur le téléphone et sur le serveur : seuls les adapters changent.

---

## 3. Design patterns

Chaque pattern ci-dessous répond à un vrai besoin de l'app. Un pattern ajouté sans raison est un anti-pattern.

| Pattern | Où l'utiliser |
|---|---|
| **Value Object** | `StepCount` (entier ≥ 0, immuable), `LocalDate`, `Distance`, `DailyGoal` : la validation est faite une seule fois, à la construction |
| **Entity / Aggregate** | `DailyActivity` (date, pas, objectif) |
| **Port / Adapter** | Port `StepCounterReader` → `NativeStepCounterReader`, `FakeStepCounterReader` ; port `StepSource` → `PedometerStepSource`, `FakeStepSource` |
| **Repository** | `StepRepository` → `SqliteStepRepository`, `InMemoryStepRepository` (pour les tests) |
| **Strategy** | `StrideLengthStrategy` (selon la taille ou une valeur fixe), `CalorieEstimator`, `StepDetectionAlgorithm` |
| **Observer** | Flux de pas en temps réel (`subscribe` / `unsubscribe`) |
| **Decorator** | `CachedStepSource` et `LoggingStepSource` enveloppent une source sans la modifier |
| **Composite** | `MergedStepSource` combine l'historique enregistré (SQLite) et le capteur live, en dédoublonnant |
| **Pipes & Filters** | Pipeline de traitement du signal de l'accéléromètre (filtre passe-bas → détection de pics → anti-rebond) |
| **State** | Machine d'états des permissions : `unknown → requested → granted / denied / permanentlyDenied` |
| **Specification** | Règles de badges (« 7 jours consécutifs > 10 000 pas ») composables avec `and` / `or` |
| **Command / Use Case** | `GetTodaySteps`, `GetWeeklyHistory`, `SetDailyGoal`, `ComputeStreak` |
| **Result / Either** | `Result<T, DomainError>` plutôt que des exceptions pour les erreurs métier |
| **Domain Events** | `GoalReached`, consommé par le module de notifications |
| **Dependency Injection** | Composition root manuelle + React Context, sans framework d'injection (inutile ici) |
| **MVVM** | Hooks `useTodayViewModel()` : l'écran reste « bête » et le ViewModel se teste seul |
| **Humble Object** | Le code natif et les capteurs, impossibles à tester unitairement, sont réduits au strict minimum |
| **Test Data Builder / Object Mother** | `aDailyActivity().withSteps(8000).onDate('2026-10-04').build()` |
| **Clock injectable** | Port `Clock` : indispensable pour tester minuit, les séries de jours, les fuseaux horaires |
| **Idempotent Receiver** | Serveur : un relevé renvoyé plusieurs fois (réseau instable) n'est enregistré qu'une fois (clé unique + `ON CONFLICT DO NOTHING`) |
| **Transactional Outbox** | Serveur : `GoalReached` est écrit dans la même transaction que les pas, puis publié par un job (notification push) |

**À éviter :** Singleton global, Service Locator, héritage profond, fichier `utils` fourre-tout.

---

## 4. Stratégie de tests

```
            ▲  E2E Maestro (S22 réel)          ← peu nombreux, parcours critiques
           ▲▲▲ Composants (RNTL)               ← écrans + ViewModels
         ▲▲▲▲▲ Contract tests des adapters     ← même suite pour le Fake et le réel
     ▲▲▲▲▲▲▲▲▲ Unitaires domaine (Vitest)      ← la majorité, < 1 s
```

- **Cycle TDD strict :** 🔴 test rouge → 🟢 code minimal → 🔵 refactor, avec un commit à chaque étape verte.
- **Contract tests :** une fonction `describeStepRepositoryContract(factory)` est exécutée contre l'`InMemory` **et** le `Sqlite`. Le Fake est ainsi garanti de se comporter comme le vrai. Côté serveur, la même suite tourne contre le repository PostgreSQL (Testcontainers).
- **Golden master :** pour l'algorithme de détection (phase 6), on enregistre de vraies marches avec le S22 en CSV (export via le partage Android ou Bluetooth), puis on vérifie que l'algorithme trouve ±5 % du nombre de pas comptés à la main.
- **Property-based testing :** par exemple « la somme des pas horaires = total journalier », « le streak n'est jamais négatif ».

---

## 5. Phases

### Phase 0 : fondations (2–3 jours)

1. Configurer le **débogage sans fil** sur le S22 et vérifier la connexion avec `adb devices` (voir l'[annexe](#8-annexe--déploiement-sans-câble-usb)).
2. Cloner le dépôt, créer le monorepo pnpm, configurer TS strict, ESLint, Prettier, Husky et commitlint.
3. **Spike jetable** (hors TDD, assumé) : un écran qui affiche le capteur live, et une tâche de fond qui lit `TYPE_STEP_COUNTER` via un module natif minimal, app fermée, sur le S22. Il sert à valider la faisabilité, puis on le **supprime**.
4. **Walking skeleton :** app Expo dev build installée sur le S22 sans câble + un test Vitest + un flow Maestro + workflow GitHub Actions au vert.

✅ *Terminé quand* un push sur `main` déclenche lint et tests au vert, et que l'APK s'installe sur le S22 sans câble.

### Phase 1 : cœur du domaine en TDD pur (1 semaine)

Ordre suggéré des tests, du plus simple au plus riche :

1. `StepCount` : refuse les négatifs et les non-entiers, se cumule avec `add()`.
2. `StepCounterReading` (valeur cumulée du capteur + numéro de démarrage `BOOT_COUNT` + horodatage epoch) et calcul des pas entre deux relevés : **détection de la remise à zéro au redémarrage** (autre démarrage ou valeur qui baisse). `distributeStepsByDay` répartit ces pas sur les jours locaux traversés **au prorata du temps**, avec un arrondi qui conserve le total. Le jour local vient d'un port `LocalCalendar` : le fuseau et le changement d'heure sont gérés par l'adapter.
3. `DailyGoal` et calcul de la progression en %, plafonnée ou non.
4. `DailyActivity` : objectif atteint ou non.
5. Strategy `StrideLengthStrategy` et `Distance`. *Calories (`CalorieEstimator`) : reportées, hors périmètre pour l'instant.*
6. `computeStreak(activities, today)` : jours manquants, objectif raté, journée en cours qui ne casse pas la série. Le calcul de « aujourd'hui » (`Clock` + `LocalCalendar`, donc minuit et changement d'heure) se fait dans le cas d'usage de la phase 2.
7. Specifications de badges : pattern `Specification` générique (`and` / `or` / `not`), règles de base `streakOfAtLeast` et `bestDayOfAtLeast` sur un `ActivityHistory`, catalogue `BADGES` défini par composition et `unlockedBadges(history)`.
8. `dailyStepsFromReadings(readings, calendar)` : d'une **série** de relevés à des pas par jour. Trie par instant, ignore les doublons (même `bootCount` + `takenAt` ; s'ils se contredisent, la plus grande valeur du compteur l'emporte, pour un résultat déterministe), enchaîne `distributeStepsByDay` sur chaque paire consécutive et cumule par jour. Propriété `fast-check` : le résultat ne dépend ni de l'ordre d'arrivée ni des doublons. C'est ce qui permet de **recalculer** les jours touchés quand un relevé arrive en retard (côté serveur comme côté mobile).
9. `TimeZoneHistory` : historique des fuseaux de l'appareil, sous forme de **périodes** (identifiant IANA, ex. `Europe/Paris`, + instant de début). Un nouvel élément n'est ajouté **que quand le fuseau change** : rien n'est répété sur chaque relevé. Le domaine choisit la période en vigueur à un instant ; les règles du fuseau (heure d'été…) restent dans l'adapter `LocalCalendar`.
10. `GoalHistory` : historique de l'objectif quotidien (objectif + date d'effet). `goalOn(date)` donne l'objectif d'un jour passé, pour que changer d'objectif ne réécrive pas les séries déjà faites.

✅ *Terminé quand* la couverture du domaine est ≈ 100 % et le score de mutation Stryker > 80 %.

### Phase 2 : cas d'usage (3–4 jours)

`RecordStepCounterReading` (prend un relevé du capteur et met à jour les pas du jour), `GetTodaySteps`, `GetWeeklyHistory`, `SetDailyGoal`, tous testés avec des Fakes (`FakeStepCounterReader`, `FakeStepSource`, `InMemoryStepRepository`, `FixedClock`).

### Phase 3 : adapters d'infrastructure (1 semaine)

1. `SqliteStepRepository` + migrations Drizzle, avec les contract tests.
2. `NativeStepCounterReader` : module natif Expo en Kotlin, réduit au strict minimum (Humble Object). Il s'abonne à `TYPE_STEP_COUNTER`, renvoie la première valeur reçue et se désabonne. Seul le mapper côté TS est testé unitairement ; le Kotlin est validé sur le S22.
3. `PedometerStepSource` (temps réel) en Observer.
4. `MergedStepSource` (Composite) : historique SQLite + capteur live, avec dédoublonnage testé.
5. Machine d'états des permissions (State) + écran d'explication.

### Phase 4 : présentation (1 semaine)

- Écrans **Aujourd'hui** (anneau de progression), **Historique** (graphique sur 7 et 30 jours) et **Réglages** (objectif, taille, exclusion de l'optimisation batterie Samsung).
- ViewModels testés en premier (`renderHook`), puis les écrans avec RNTL.
- Accessibilité : labels, contrastes, taille de police dynamique.

### Phase 5 : arrière-plan et notifications (3–4 jours)

- `expo-background-task` pour un **relevé périodique** du `TYPE_STEP_COUNTER` (intervalle minimal imposé par Android : 15 min) via `RecordStepCounterReading`.
- Relevés supplémentaires à l'extinction (`ACTION_SHUTDOWN`) et au démarrage (`BOOT_COMPLETED`) pour limiter les pas perdus au redémarrage.
- Écoute de `ACTION_TIMEZONE_CHANGED` : une nouvelle période est ajoutée à la `TimeZoneHistory` locale (SQLite), pour que l'historique reste juste après un voyage.
- Notification « Objectif atteint 🎉 », déclenchée par l'événement de domaine `GoalReached`.
- Test manuel sur le S22 : app tuée, téléphone redémarré, mode veille profonde. On vérifie que l'historique n'a pas de trou.

### Phase 6 (bonus) : algorithme de détection maison

Il s'agit de détecter les pas à partir de l'accéléromètre brut, en TS pur :

- Pipeline Pipes & Filters : norme du vecteur → filtre passe-bas → seuil adaptatif → détection de pics → anti-rebond (≥ 250 ms entre deux pas).
- Strategy pour comparer plusieurs algorithmes face au capteur matériel du S22.
- Jeux de données synthétiques d'abord, puis enregistrements réels (golden master).

### Phase 7 : industrialisation (continue)

- Stryker dans la CI (seuil bloquant sur `packages/domain`).
- Flows Maestro sur le S22 (via ADB Wi-Fi) avant chaque release.
- EAS Build : APK téléchargeable par lien ou QR code, puis éventuellement le Play Store (canal de test interne).
- ADR dans `docs/adr/` pour tracer les choix d'architecture.

### Phase 8 (optionnel) : serveur de synchronisation NestJS + PostgreSQL

Un serveur **facultatif**, activé par l'utilisateur, pour sauvegarder l'historique, le retrouver sur un autre appareil et lancer des défis entre amis (voir [ADR 0002](docs/adr/0002-serveur-de-synchronisation-optionnel.md)). Il ne dépend que du domaine (phase 1) : on peut le développer avant les phases 3 à 5, en l'alimentant avec des relevés simulés.

**8a : MVP de synchronisation**

*Prérequis :* étapes 8 à 10 de la phase 1 (`dailyStepsFromReadings`, `TimeZoneHistory`, `GoalHistory`).

1. `apps/api` : NestJS en TS strict, PostgreSQL via `docker compose`, configuration validée au démarrage. Tests avec **Jest**.
2. Ajouter `@nestjs/*`, `typeorm` et `pg` aux imports interdits dans le domaine (règle ESLint existante).
3. Modèle et **migrations TypeORM**, avec des **entités de persistance séparées du domaine** : les classes du domaine ne reçoivent aucun décorateur, des mappers testés font la traduction dans les deux sens.
   - `accounts` et `devices` (**plusieurs appareils pour un compte**, `devices.account_id`). En 8a, un compte est créé avec son premier appareil, sans authentification.
   - `step_counter_readings` : en ajout seul, contrainte unique `(device_id, boot_count, taken_at)`.
   - `device_time_zones` : périodes de fuseau `(device_id, time_zone, valid_from)`, unique sur `(device_id, valid_from)`.
   - `daily_goals` : historique de l'objectif `(account_id, goal, effective_from)`.
   - `daily_steps` : projection recalculée, par appareil et par jour.
4. **API versionnée dès le départ** : toutes les routes sous `/v1`. Un changement incompatible crée `/v2`, et `/v1` reste servi tant que des apps l'utilisent.
5. `POST /v1/devices/:id/readings` : envoi par lots des relevés **et des changements de fuseau survenus depuis le dernier envoi**. Le fuseau n'est envoyé que lorsqu'il change (le téléphone l'enregistre sur l'événement Android `ACTION_TIMEZONE_CHANGED`). **Idempotent** (`ON CONFLICT DO NOTHING`) et tolérant au retard et au désordre : les jours touchés, y compris ceux des relevés voisins, sont recalculés avec `dailyStepsFromReadings` dans une transaction, chaque relevé étant interprété avec le fuseau en vigueur à son instant.
6. `PUT /v1/accounts/:id/goal` (ajoute une entrée à l'historique), `GET /v1/devices/:id/daily-steps?from&to` et `GET /v1/accounts/:id/streak` (`computeStreak` + `GoalHistory` ; « aujourd'hui » selon le fuseau courant de l'appareil).
7. Validation des DTO (`class-validator`), traduction des `Result` du domaine en erreurs HTTP (`400`, `409`, `422`), documentation OpenAPI (`@nestjs/swagger`).
8. Tests : cas d'usage avec des Fakes, **contract tests** du repository (`InMemory` et PostgreSQL via Testcontainers), E2E `supertest` avec le scénario « relevés en double, dans le désordre, redémarrage au milieu, changement de fuseau ».
9. CI : tests serveur dans GitHub Actions (Docker disponible sur `ubuntu-latest`).

**8b : extensions, par ordre de priorité**

1. **Authentification** (JWT) : un compte rattache plusieurs appareils. *À décider avant :* la règle d'agrégation des pas d'un compte qui a plusieurs appareils le même jour (additionner compterait deux fois les pas d'un utilisateur qui porte deux téléphones ; maximum par jour ou appareil principal ?).
2. **Requêtes SQL brutes :** série de jours en SQL (*gaps and islands*), avec un test `fast-check` qui vérifie que le SQL et `computeStreak` donnent toujours le même résultat ; index justifiés par `EXPLAIN ANALYZE`.
3. **Défis entre amis :** groupes, défi hebdomadaire, classement avec `RANK() OVER (PARTITION BY …)`.
4. **Clôture des défis** par un job planifié (`@nestjs/schedule`), protégé par un verrou (`pg_advisory_lock`, ou Redis si plusieurs services) contre une double exécution.
5. `GoalReached` → notification push (Firebase Cloud Messaging) via un **outbox transactionnel**.
6. Classement en direct par WebSocket (gateway NestJS).
7. Bilan mensuel en PDF stocké sur S3.
8. Côté mobile : cas d'usage `SyncReadings` + adapter HTTP, avec renvoi des lots en attente quand le réseau revient.

✅ *8a terminée quand* l'E2E « doublons + désordre + redémarrage + changement de fuseau » passe en CI contre un vrai PostgreSQL, et que la documentation OpenAPI `/v1` est consultable.

**Durée totale estimée :** 5 à 7 semaines à temps partiel, hors phases 6 et 8.

---

## 6. Premier test

```ts
// packages/domain/src/model/StepCount.test.ts (extrait)
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { StepCount } from './StepCount';

describe('StepCount', () => {
  it('refuse un nombre de pas négatif', () => {
    const result = StepCount.create(-1);

    expect(result).toEqual({ ok: false, error: { kind: 'NegativeStepCount', value: -1 } });
  });

  it('additionne deux comptes de pas sans modifier les originaux', () => {
    const morning = unwrap(StepCount.create(1200));
    const evening = unwrap(StepCount.create(300));

    expect(morning.add(evening).value).toBe(1500);
  });
});
```

Ce test était rouge tant que `StepCount` n'existait pas : c'était le point de départ.

`Result<T, E>` est **maison** (`packages/domain/src/shared/Result.ts`) : une union discriminée `{ ok: true, value } | { ok: false, error }`, sans dépendance externe, que TypeScript affine avec un simple `if (!result.ok)`. Dans les tests, `unwrap()` (`src/testing/`) lit la valeur d'un `Result` en succès.

---

## 7. Bonnes pratiques

- **Format de commit** `yyyy-mm-dd # N : (type) message` (N = numéro du commit du jour, type = `feat`, `fix`, `test`, `refactor`, `chore`, `docs`…), vérifié par commitlint. Exemple : `2026-10-05 # 1 : (chore) Mise en place du monorepo`. Petits commits atomiques, un par cycle TDD vert.
- **Branches courtes + PR sur GitHub**, même en solo : la CI valide avant le merge sur `main`. Protéger `main` (CI obligatoire).
- **Pas de `any`** et pas de `as` sans commentaire justificatif ; *branded types* pour les identifiants et les dates.
- **Nommage métier** (*ubiquitous language*) : `DailyActivity`, `Streak`, `Goal`, pas `Data` ou `Manager`.
- **Dates :** tout le domaine en `LocalDate` (sans heure). Les conversions de fuseau se font aux frontières, dans les adapters. Le fuseau de l'appareil est historisé par périodes (`TimeZoneHistory`), jamais répété sur chaque relevé.
- **Persistance :** le domaine ne porte aucune annotation d'ORM (ni Drizzle, ni TypeORM). Les modèles de persistance sont séparés et traduits par des mappers testés.
- **Vie privée :** les données de santé restent locales, sans analytics. La synchronisation serveur (phase 8) est **désactivée par défaut** et n'est activée que sur demande explicite de l'utilisateur.
- **Secrets :** jamais dans le dépôt (token EAS dans les *GitHub Secrets*).

---

## 8. Annexe : déploiement sans câble USB

Le PC et le S22 doivent être sur **le même réseau Wi-Fi**.

### Activer le débogage sans fil (une seule fois)

1. Sur le S22 : `Paramètres > À propos du téléphone > Informations sur le logiciel`, puis taper 7 fois sur **Numéro de version**.
2. `Paramètres > Options de développement`, puis activer **Débogage sans fil**.
3. Toucher **Débogage sans fil > Associer l'appareil avec un code d'association**. Le téléphone affiche une IP, un port et un code à 6 chiffres.
4. Sur le PC (Android SDK Platform Tools installés) :

   ```bash
   adb pair <IP>:<PORT_ASSOCIATION>   # saisir le code à 6 chiffres
   adb connect <IP>:<PORT_CONNEXION>  # port affiché sur l'écran « Débogage sans fil »
   adb devices                        # le S22 doit apparaître
   ```

> L'association est mémorisée, mais le **port de connexion change** à chaque réactivation du débogage sans fil. Il faut alors refaire `adb connect` avec le nouveau port.
> Si la connexion échoue, autoriser `adb.exe` dans le pare-feu Windows.

Une fois connecté, tout fonctionne comme en USB : `npx expo run:android`, les logs (`adb logcat`) et Maestro.

### Installer un APK sans ADB

- **EAS Build** (`eas build --profile development --platform android`) produit un lien et un QR code : on scanne avec le S22, on télécharge et on installe l'APK.
- Il faut autoriser l'installation d'applications inconnues pour le navigateur utilisé.
- Le transfert Bluetooth d'un APK fonctionne aussi, mais il est plus lent et ne permet ni le rechargement à chaud ni le débogage.

### Serveur de développement (Metro)

- Le dev build se connecte à Metro via le réseau local (`npx expo start --dev-client`).
- Si le réseau isole les appareils (Wi-Fi public ou d'entreprise), utiliser `npx expo start --dev-client --tunnel`.
