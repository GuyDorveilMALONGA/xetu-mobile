# Privacy, Store Copy, Monitoring

Date : 2026-06-26

But : cadrer ce que Xetu promet publiquement et ce que l'app mesure en interne, sans surpromettre le tracking live.

## Privacy courte

Texte court utilisable dans l'app :

```text
Xetu utilise ta position uniquement quand tu la partages pour signaler un bus ou aider les autres passagers.
Le partage live est optionnel, visible, et peut etre arrete a tout moment.
Les autres utilisateurs voient une position de bus estimee, jamais ton numero ni ton identite.
```

Version permissions :

```text
Autoriser la position permet de signaler le bus autour de toi et d'ameliorer l'estimation pour les autres.
Tu peux utiliser Xetu sans partage live.
```

Regles produit :

- Pas de background GPS implicite pour le MVP.
- Le streaming continu reste foreground + consentement explicite.
- `/api/buses` et `/tracking/bus-events` ne doivent pas exposer `phone` ni `session_id`.
- Un signal `vu` expire vite.
- Un signal `dedans` peut declencher une relance, mais seulement avec cooldown.

## Store copy sans surpromesse

Description courte :

```text
Xetu aide les passagers a signaler les bus Dem Dikk, voir les derniers signalements sur une carte et recevoir des alertes utiles sur leurs lignes.
```

Description longue :

```text
Avec Xetu, la communaute partage les informations deja echangees dans les groupes WhatsApp, mais de facon plus claire : bus apercu, passager dans le bus, position recente, arrets proches et alertes ciblees.

Les positions affichees sont des signalements communautaires ou des partages volontaires. Elles peuvent etre approximatives et expirent rapidement quand elles ne sont plus fraiches.
```

Promesses interdites :

- "bus en temps reel garanti" ;
- "horaires officiels" ;
- "tracking permanent" ;
- "position exacte du bus" sans qualifier la source/confiance.

## Monitoring minimum

Evenements a compter :

- `report_created` : ligne, mode, source, has_gps, projection_status.
- `report_rejected` : raison, ligne si connue.
- `subscription_created` : ligne, has_stop.
- `notification_sent` : canal, kind, ligne.
- `notification_deduped` : canal, kind, ligne.
- `tracking_session_started` : ligne, direction_known.
- `tracking_ping_accepted` : ligne, projection_error_bucket.
- `tracking_ping_rejected` : reason.
- `resolver_used` : has_line, status, level, needs_confirmation.

Indicateurs a suivre :

- taux de signalements projetables sur trace ;
- part des abonnements avec arret ;
- nombre de notifications dedoublonnees ;
- nombre de relances envoyees vs confirmees ;
- taux d'erreurs off-trace / impossible_speed ;
- crash rate mobile/PWA ;
- latence des endpoints `/api/buses`, `/tracking/report`, `/tracking/session/ping`.

Decision MVP :

```text
Commencer par logs structures serveur + compteurs simples.
Ajouter un outil externe de crash/app monitoring seulement avant beta fermee.
```
