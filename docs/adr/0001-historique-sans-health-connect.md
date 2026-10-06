# ADR 0001 : historique des pas construit par l'app, sans Health Connect

- **Date :** 2026-10-06
- **Statut :** acceptée

## Contexte

Le plan initial s'appuyait sur Health Connect pour l'historique des pas, rempli par Samsung Health.

Sur le S22 cible (`SM-S901U1`, Android 16, One UI 8) :

- Health Connect est présent (intégré au système) ;
- **Samsung Health n'est pas installé, et on ne souhaite pas en dépendre** ;
- sur un Samsung, Health Connect n'enregistre pas les pas lui-même. Sans Samsung Health, il ne contient donc aucun pas.

## Décision

L'app construit elle-même son historique :

1. Un module natif Expo minimal (Kotlin) lit la valeur cumulée de `TYPE_STEP_COUNTER` à la demande.
2. Une tâche de fond prend un **relevé** périodique (au mieux toutes les 15 min), plus un relevé à l'extinction et au démarrage du téléphone.
3. Le **domaine** transforme la suite des relevés en pas par jour. Il gère la remise à zéro du compteur au redémarrage et le passage de minuit.
4. Les relevés et les pas par jour sont stockés en SQLite, en local uniquement.

Health Connect et `react-native-health-connect` sont retirés de la stack.

## Conséquences

- ✅ Aucune dépendance à une app tierce, et les données restent sur l'appareil.
- ✅ Plus de logique métier pure à tester en TDD : relevés, remise à zéro, découpage par jour.
- ❌ L'historique commence à l'installation de l'app.
- ❌ Un module natif Kotlin est nécessaire, réduit au minimum (Humble Object).
- ❌ Il y a un risque de trous si One UI met l'app en veille profonde. L'écran d'exclusion de l'optimisation batterie devient critique.
- ❌ Les pas faits entre le dernier relevé et un arrêt brutal (batterie vide, crash) sont perdus.
- 🔁 On pourra plus tard **écrire** nos pas dans Health Connect, pour les partager, sans revenir sur cette décision.
