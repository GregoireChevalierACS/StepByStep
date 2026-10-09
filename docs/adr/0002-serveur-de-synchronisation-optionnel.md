# ADR 0002 : serveur de synchronisation optionnel (NestJS + PostgreSQL)

- **Date :** 2026-10-09
- **Statut :** acceptée (décisions complémentaires du 2026-10-09 : points 6 à 12)
- **Complète :** [ADR 0001](0001-historique-sans-health-connect.md) (l'historique reste construit et stocké sur l'appareil)

## Contexte

L'ADR 0001 garde toutes les données sur le téléphone. Trois besoins n'ont alors pas de réponse :

- **sauvegarde** : un téléphone perdu ou réinitialisé efface tout l'historique ;
- **multi-appareil** : impossible de retrouver son historique sur un nouveau téléphone ;
- **social** : impossible de se comparer à des amis (défis, classements).

Les relevés sont pris hors ligne et peuvent arriver au serveur en retard, en double (renvoi après une coupure réseau) ou dans le désordre.

## Décision

1. Ajouter un serveur `apps/api` en **NestJS**, avec **PostgreSQL** et des migrations **TypeORM**.
2. La synchronisation est **désactivée par défaut**. L'utilisateur l'active explicitement et peut supprimer ses données serveur.
3. Le téléphone envoie les **relevés bruts** (`StepCounterReading`), pas les pas par jour déjà calculés. Le serveur recalcule les pas par jour avec le **même** `@stepbystep/domain`, qui ne dépend de rien côté serveur.
4. L'ingestion est **idempotente** : contrainte unique `(device_id, boot_count, taken_at)` + `ON CONFLICT DO NOTHING`.
5. Le stockage local reste la source de vérité de l'app : elle fonctionne entièrement sans réseau.
6. **Fuseau horaire historisé par périodes.** Le jour local d'un relevé dépend du fuseau du téléphone, pas de celui du serveur. Pour ne pas le répéter sur chaque relevé, le téléphone n'envoie une nouvelle période (identifiant IANA + instant de début) **que lorsque le fuseau change** (événement Android `ACTION_TIMEZONE_CHANGED`). Le domaine porte la notion (`TimeZoneHistory`) ; le serveur la stocke dans `device_time_zones` et interprète chaque relevé avec le fuseau en vigueur à son instant.
7. **Recalcul des jours touchés.** Un relevé arrivé en retard s'insère entre deux relevés existants et change les deux paires qui l'entourent. Le domaine fournit `dailyStepsFromReadings` (série de relevés → pas par jour, indépendant de l'ordre et des doublons) ; le serveur recalcule les jours couverts par le relevé et ses voisins, dans une transaction.
8. **Historique de l'objectif.** Un changement d'objectif ne réécrit pas le passé : table `daily_goals (account_id, goal, effective_from)` et `GoalHistory` dans le domaine, utilisé par `computeStreak`.
9. **Plusieurs appareils pour un compte** (`devices.account_id`). La règle d'agrégation des pas d'un même jour sur plusieurs appareils reste à décider avant l'authentification (phase 8b).
10. **Domaine sans annotations d'ORM.** Les entités TypeORM sont des modèles de persistance séparés, traduits par des mappers testés. La règle ESLint du domaine interdit aussi `@nestjs/*`, `typeorm` et `pg`.
11. **Jest** pour les tests serveur (outil par défaut de NestJS). Le domaine reste testé avec Vitest.
12. **API versionnée dès le départ** (`/v1`). Un changement incompatible crée `/v2` ; `/v1` reste servi tant que des apps l'utilisent.

## Alternatives écartées

- **Envoyer seulement les pas par jour :** moins de données personnelles envoyées. Mais un relevé arrivé en retard ne pourrait plus corriger un jour déjà envoyé, et deux appareils écraseraient mutuellement leurs totaux.
- **Backend as a Service (Firebase, Supabase) :** plus rapide, mais la logique métier (remise à zéro, découpage par jour) serait dupliquée ou contournée, alors que le domaine partagé la fournit déjà.
- **Kafka ou un bus de messages :** inutile à cette échelle. Un outbox PostgreSQL suffit pour publier les événements de domaine (`GoalReached`).

## Conséquences

- ✅ Le domaine est réutilisé tel quel côté serveur : c'est une preuve concrète de l'architecture hexagonale.
- ✅ La sauvegarde, le multi-appareil et les défis deviennent possibles.
- ✅ La tolérance aux doublons et au désordre se teste de bout en bout contre un vrai PostgreSQL.
- ❌ Les relevés horodatés sont des données plus fines que des totaux journaliers : le consentement, la suppression des données et la sécurité du transport deviennent obligatoires.
- ❌ Un service de plus à héberger, superviser et faire évoluer (migrations, versions de l'API).
- ❌ Le domaine doit rester rétrocompatible : un téléphone non mis à jour envoie encore l'ancien format de relevé. Le versionnement `/v1` encadre ce risque.
- ❌ Trois notions de domaine deviennent nécessaires avant le serveur : `dailyStepsFromReadings`, `TimeZoneHistory` et `GoalHistory` (étapes 8 à 10 de la phase 1).
- ⚠️ Cas limite accepté : un changement de fuseau au milieu d'un intervalle entre deux relevés est approximé (chaque relevé est interprété avec le fuseau en vigueur à son instant).
