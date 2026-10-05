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
| **Capteur** | Android expose `TYPE_STEP_COUNTER`, un capteur matériel qui compte les pas depuis le dernier redémarrage, même quand l'app est fermée, avec une consommation de batterie quasi nulle. |
| **Permission** | `ACTIVITY_RECOGNITION` doit être demandée à l'exécution. |
| **Historique** | **Health Connect** est intégré à Android 14 et plus. Samsung Health peut y synchroniser ses pas, ce qui donne l'historique gratuitement. |
| **Piège Expo** | `expo-sensors` (Pedometer) **ne fournit pas l'historique sur Android** : il ne compte qu'en temps réel, quand l'app est ouverte. Il faut donc Health Connect et/ou un module natif. |
| **Piège Samsung** | One UI met en veille agressive les apps en arrière-plan (« Applications en veille profonde »). Il faut un écran qui guide l'utilisateur pour exclure l'app. |
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
| Données santé | `react-native-health-connect` + son config plugin | Historique des pas |
| Qualité | ESLint (typescript-eslint strict), Prettier, Husky, lint-staged, commitlint | Garde-fous automatiques avant chaque commit |
| Règles d'architecture | `dependency-cruiser` ou `eslint-plugin-boundaries` | **Empêche** le domaine d'importer l'infrastructure |
| CI/CD | GitHub Actions + EAS Build | Lint, tests et mutation testing à chaque push ; APK installable sans câble |

---

## 2. Architecture

Architecture **hexagonale (Ports & Adapters)** :

```
StepByStep/
├── packages/
│   └── domain/                 # TS pur, 0 dépendance, testé avec Vitest
│       ├── model/              # Entités et Value Objects
│       ├── services/           # Strategies (distance, calories, détection)
│       ├── ports/              # Interfaces (StepSource, StepRepository, Clock…)
│       └── usecases/           # Cas d'usage applicatifs
├── apps/
│   └── mobile/                 # Expo
│       ├── src/infrastructure/ # Adapters : HealthConnect, Pedometer, SQLite
│       ├── src/presentation/   # Écrans + hooks ViewModel
│       ├── src/composition/    # Composition root (injection de dépendances)
│       └── e2e/                # Flows Maestro
├── docs/
│   └── adr/                    # Architecture Decision Records
└── .github/workflows/          # CI
```

**Règle d'or :** les dépendances pointent vers le domaine, jamais l'inverse. Le domaine ne connaît ni React, ni Expo, ni Android.

---

## 3. Design patterns

Chaque pattern ci-dessous répond à un vrai besoin de l'app. Un pattern ajouté sans raison est un anti-pattern.

| Pattern | Où l'utiliser |
|---|---|
| **Value Object** | `StepCount` (entier ≥ 0, immuable), `LocalDate`, `Distance`, `DailyGoal` : la validation est faite une seule fois, à la construction |
| **Entity / Aggregate** | `DailyActivity` (date, pas, objectif) |
| **Port / Adapter** | Port `StepSource` → `HealthConnectStepSource`, `PedometerStepSource`, `FakeStepSource` |
| **Repository** | `StepRepository` → `SqliteStepRepository`, `InMemoryStepRepository` (pour les tests) |
| **Strategy** | `StrideLengthStrategy` (selon la taille ou une valeur fixe), `CalorieEstimator`, `StepDetectionAlgorithm` |
| **Observer** | Flux de pas en temps réel (`subscribe` / `unsubscribe`) |
| **Decorator** | `CachedStepSource` et `LoggingStepSource` enveloppent une source sans la modifier |
| **Composite** | `MergedStepSource` combine Health Connect et le capteur live, en dédoublonnant |
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
- **Contract tests :** une fonction `describeStepRepositoryContract(factory)` est exécutée contre l'`InMemory` **et** le `Sqlite`. Le Fake est ainsi garanti de se comporter comme le vrai.
- **Golden master :** pour l'algorithme de détection (phase 6), on enregistre de vraies marches avec le S22 en CSV (export via le partage Android ou Bluetooth), puis on vérifie que l'algorithme trouve ±5 % du nombre de pas comptés à la main.
- **Property-based testing :** par exemple « la somme des pas horaires = total journalier », « le streak n'est jamais négatif ».

---

## 5. Phases

### Phase 0 : fondations (2–3 jours)

1. Configurer le **débogage sans fil** sur le S22 et vérifier la connexion avec `adb devices` (voir l'[annexe](#8-annexe--déploiement-sans-câble-usb)).
2. Cloner le dépôt, créer le monorepo pnpm, configurer TS strict, ESLint, Prettier, Husky et commitlint.
3. **Spike jetable** (hors TDD, assumé) : un écran qui affiche le capteur live et lit Health Connect sur le S22. Il sert à valider la faisabilité, puis on le **supprime**.
4. **Walking skeleton :** app Expo dev build installée sur le S22 sans câble + un test Vitest + un flow Maestro + workflow GitHub Actions au vert.

✅ *Terminé quand* un push sur `main` déclenche lint et tests au vert, et que l'APK s'installe sur le S22 sans câble.

### Phase 1 : cœur du domaine en TDD pur (1 semaine)

Ordre suggéré des tests, du plus simple au plus riche :

1. `StepCount` : refuse les négatifs et les non-entiers, se cumule avec `add()`.
2. `DailyGoal` et calcul de la progression en %, plafonnée ou non.
3. `DailyActivity` : objectif atteint ou non.
4. Strategies `Distance` / `Calories`.
5. `ComputeStreak` avec une `Clock` fake : cas limites de minuit, jours manquants, changement d'heure.
6. Specifications de badges.

✅ *Terminé quand* la couverture du domaine est ≈ 100 % et le score de mutation Stryker > 80 %.

### Phase 2 : cas d'usage (3–4 jours)

`GetTodaySteps`, `GetWeeklyHistory`, `SetDailyGoal`, `SyncStepsFromSource`, tous testés avec des Fakes (`FakeStepSource`, `InMemoryStepRepository`, `FixedClock`).

### Phase 3 : adapters d'infrastructure (1 semaine)

1. `SqliteStepRepository` + migrations Drizzle, avec les contract tests.
2. `HealthConnectStepSource` : la lecture des données agrégées par jour et par heure passe par un mapper testé unitairement. Le SDK lui-même n'est pas testé.
3. `PedometerStepSource` (temps réel) en Observer.
4. `MergedStepSource` (Composite) avec dédoublonnage testé.
5. Machine d'états des permissions (State) + écran d'explication.

### Phase 4 : présentation (1 semaine)

- Écrans **Aujourd'hui** (anneau de progression), **Historique** (graphique sur 7 et 30 jours) et **Réglages** (objectif, taille, exclusion de l'optimisation batterie Samsung).
- ViewModels testés en premier (`renderHook`), puis les écrans avec RNTL.
- Accessibilité : labels, contrastes, taille de police dynamique.

### Phase 5 : arrière-plan et notifications (3–4 jours)

- `expo-background-task` pour une synchronisation périodique avec Health Connect.
- Notification « Objectif atteint 🎉 », déclenchée par l'événement de domaine `GoalReached`.
- Test manuel sur le S22 : app tuée, téléphone redémarré, mode veille profonde.

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

**Durée totale estimée :** 5 à 7 semaines à temps partiel, hors phase 6.

---

## 6. Premier test

```ts
// packages/domain/model/StepCount.test.ts
import { describe, it, expect } from 'vitest';
import { StepCount } from './StepCount';

describe('StepCount', () => {
  it('refuse un nombre de pas négatif', () => {
    const result = StepCount.create(-1);
    expect(result.isErr()).toBe(true);
  });

  it('additionne deux comptes de pas', () => {
    const a = StepCount.create(1200)._unsafeUnwrap();
    const b = StepCount.create(300)._unsafeUnwrap();
    expect(a.add(b).value).toBe(1500);
  });
});
```

Ce test est rouge tant que `StepCount` n'existe pas : c'est le point de départ.

---

## 7. Bonnes pratiques

- **Format de commit** `yyyy-mm-dd # N : (type) message` (N = numéro du commit du jour, type = `feat`, `fix`, `test`, `refactor`, `chore`, `docs`…), vérifié par commitlint. Exemple : `2026-10-05 # 1 : (chore) Mise en place du monorepo`. Petits commits atomiques, un par cycle TDD vert.
- **Branches courtes + PR sur GitHub**, même en solo : la CI valide avant le merge sur `main`. Protéger `main` (CI obligatoire).
- **Pas de `any`** et pas de `as` sans commentaire justificatif ; *branded types* pour les identifiants et les dates.
- **Nommage métier** (*ubiquitous language*) : `DailyActivity`, `Streak`, `Goal`, pas `Data` ou `Manager`.
- **Dates :** tout le domaine en `LocalDate` (sans heure). Les conversions de fuseau se font aux frontières, dans les adapters.
- **Vie privée :** les données de santé restent locales, sans analytics.
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
