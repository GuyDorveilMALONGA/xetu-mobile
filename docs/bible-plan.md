# Bible Plan Xetu

Date : 2026-06-25  
Autorite de suivi : ce fichier remplace l'ordre eparpille des autres plans.  
Checklist vivante : `C:\Users\DELL\Desktop\xetu-mobile\docs\bible-taches.md`

## Positionnement corrige

Le coeur de Xetu n'est pas d'abord du streaming GPS continu.

Le coeur de Xetu, c'est :

```text
WhatsApp transforme en vraie app de transport.
```

Aujourd'hui, les gens se disent deja dans des groupes :

```text
"La 232 est passee ici."
"Je suis dans le bus."
"Le bus est vers tel endroit."
```

Xetu ne cree pas ce comportement. Xetu le structure :

- carte au lieu de messages perdus ;
- signalement propre au lieu de bruit de groupe ;
- notification ciblee au lieu de spam ;
- estimation sur trace au lieu de "je pense qu'elle arrive".

## Unite de base

L'unite de base est le signalement.

Deux formes :

```text
1. "J'ai vu la ligne 232 passer ici."
2. "Je suis dans la ligne 232."
```

Option supplementaire :

```text
"Je partage ma position pendant le trajet."
```

Mais cette option n'est pas le socle du premier produit. Le socle est :

```text
signaler -> poser sur trace -> propager en aval -> notifier.
```

Clarification apres lecture du code existant :

- le signalement existe deja dans `whatsapp-agent` ;
- les notifications abonnes existent deja ;
- le TTL existe deja ;
- `/api/buses` affiche deja les bus issus des signalements actifs ;
- le vrai manque Phase 1 est la distinction `vu` / `dedans`, puis la relance a la demande.

## Pourquoi un signalement suffit deja

Un bus Dem Dikk n'est pas un taxi.

Il suit un itineraire fixe. Xetu possede deja :

- les lignes ;
- les arrets ;
- les coordonnees ;
- les traces `geometry_aller` / `geometry_retour`.

Donc si une personne signale :

```text
La 232 est ici.
```

Alors Xetu peut :

- projeter ce point sur la trace de la 232 ;
- determiner le sens ;
- estimer quels arrets sont en aval ;
- prevenir les abonnes de cette ligne ou de ces arrets ;
- donner une estimation avec confiance.

Conclusion :

```text
Une observation isolee devient utile parce que la route est connue.
```

## Source de verite

Source metier :

```text
C:\Users\DELL\Desktop\whatsapp-agent\Dashboard\data\xetu_mvp.json
```

Lignes MVP :

```text
1, 4, 6, 7, 8, 9, 10, 13, 23, 232
```

Regles :

- ne pas afficher de lignes non cartographiees dans les flows carte/tracking ;
- ne pas utiliser Google Maps comme base persistante ;
- ne pas utiliser un routage voiture comme chemin primaire ;
- la trace Dem Dikk est l'itineraire bus primaire ;
- tout signalement doit etre rattache a une ligne et, si possible, a un point sur la trace.

## Architecture produit cible

```text
Utilisateur signale
  -> ligne + position
  -> backend
  -> projection sur trace Dem Dikk
  -> bus_event / bus_state
  -> estimation aval
  -> /api/buses
  -> notifications ciblees
  -> carte
```

Deux niveaux :

### Niveau 1 - Signalement ponctuel

```text
"J'ai vu la 232 ici"
```

Valeur :

- alerte immediate aux abonnes ;
- position estimee du bus ;
- ETA indicatif en aval ;
- faible consommation batterie ;
- tres proche du comportement WhatsApp existant.

### Niveau 2 - Presence dans le bus

```text
"Je suis dans la 232"
```

Valeur :

- signalement plus fort ;
- position plus fiable ;
- possibilite de relancer un ping manuel ;
- option de partage continu si l'utilisateur accepte.

### Niveau 3 - Streaming continu optionnel

```text
"Je partage ma position pendant le trajet"
```

Valeur :

- meilleure fraicheur ;
- confiance plus haute ;
- ETA plus precis.

Mais ce niveau vient apres. Il n'est pas necessaire pour le premier MVP utile.

## Ordre unique a suivre

### Phase 0 - Ranger la base visible

But : l'app ne doit pas mentir avant les signalements.

A faire :

- corriger les lignes affichees ;
- corriger bottom nav et safe area ;
- corriger theme light ;
- verifier que le pont GPS natif Expo est appelle par la PWA ;
- envoyer un signalement ponctuel vers le backend.

Resultat attendu :

```text
App -> GPS natif -> signalement -> backend -> carte
```

### Phase 1 - Signalement utile sur trace

But : ameliorer l'existant, pas le reinventer.

Ce qui existe deja cote `whatsapp-agent` :

- `record_signalement()` est le point d'entree autoritaire ;
- `/tracking/update` transforme une position GPS en signalement ;
- `notify_abonnes()` notifie WhatsApp + PWA ;
- `expires_at` fait disparaitre le bus apres TTL ;
- `/api/buses` affiche les signalements actifs avec age et confiance ;
- `skills/question.py` sait deja repondre "bus signale a X il y a N min".

A faire :

- distinguer le mode `vu` du mode `dedans` ;
- donner un TTL court au mode `vu` ;
- donner une fraicheur plus forte au mode `dedans` ;
- garder le bus affiche au point signale tant que le TTL est actif ;
- ajouter la relance a la demande pour les signaleurs `dedans` ;
- ameliorer les garde-fous autour de la trace.

Definition de termine :

```text
Je vois la 232 -> je signale -> le bus apparait au point signale -> les abonnes sont prevenus -> il disparait apres TTL.
```

## Phase 1bis - Relance a la demande

But : transformer un signal vieillissant en information vivante sans streaming permanent.

Declencheur :

```text
Quelqu'un ouvre la carte ou demande "ou est la 232 ?"
```

Regles :

- si le signal est frais, on affiche simplement ;
- si le signal vieillit, on dit la verite : "232 apercue a X il y a N min" ;
- si le dernier signal vient de quelqu'un qui a dit `je suis dedans`, on peut lui demander une position fraiche ;
- si le signal vient seulement d'un `vu`, on ne relance pas cette personne : elle n'est probablement plus avec le bus ;
- si le signal est expire, pas de marqueur, mais on invite a signaler.

Message cible pour le demandeur :

```text
La 232 a ete apercue a Sapeur Pompier Dieuppeul il y a 10 min.
La position peut avoir change. Je cherche une position plus recente.
```

Message cible pour le signaleur `dedans` :

```text
Tu es toujours dans la 232 ? Des personnes la cherchent.
Partage ta position pour les aider.
```

Garde-fous :

- cooldown par signaleur ;
- relance uniquement s'il y a une vraie demande ;
- pas de relance infinie ;
- pas de background GPS implicite ;
- la reponse rentre dans `record_signalement()`.

### Phase 2 - Propagation aval et ETA indicatif

But : transformer un signalement isole en information utile pour toute la ligne.

A faire :

- calculer la progression du bus sur la trace ;
- identifier les arrets en aval ;
- estimer le temps jusqu'a chaque arret ;
- expirer l'information apres un TTL ;
- afficher la confiance.

Exemple :

```text
232 signalee vers Sapeur Pompier Dieuppeul.
Elle pourrait arriver a Sandaga dans environ N minutes.
Confiance : moyenne.
```

### Phase 3 - Notifications ciblees

But : remplacer le bruit WhatsApp par une alerte utile.

Base existante :

- notification WhatsApp par ligne existe ;
- notification push PWA par ligne existe.

A faire :

- conserver l'abonnement ligne existant ;
- ajouter plus tard abonnement arret/aval ;
- notification "ligne signalee a X" ;
- notification "bus probablement en approche" ;
- eviter les doublons ;
- ne pas notifier apres expiration.

### Phase 4 - "Je suis dans le bus"

But : un signalement plus fort que "je l'ai vu".

A faire :

- bouton `Je suis dans le bus` ;
- ligne confirmee ;
- position envoyee ;
- confiance plus haute qu'un simple "vu" ;
- possibilite de ping manuel "toujours dedans" ;
- stop manuel quand l'utilisateur descend.

### Phase 5 - Streaming continu optionnel

But : ameliorer la fraicheur, pas creer la valeur de base.

A faire :

- consentement clair ;
- pings toutes les 10-15 secondes en foreground ;
- stop automatique si hors trace ;
- creation/mise a jour de `bus_state` ;
- confiance plus haute si plusieurs contributeurs.

Definition de termine :

```text
Je suis dans le bus -> GPS continu optionnel -> bus_state plus frais.
```

### Phase 6 - Couche spatiale Dakar

But : comprendre "Police Dieuppeul", "ESTG", "Renaissance", "Liberte 6", "Sandaga".

Fichiers de travail :

```text
C:\Users\DELL\Desktop\xetu-mobile\spatial_candidates.gemini.all.jsonl
C:\Users\DELL\Desktop\xetu-mobile\spatial_landmark_candidates.review.jsonl
```

A faire :

- nettoyer/dedupliquer les candidats ;
- lier reperes -> top 3 arrets proches ;
- valider les reperes prioritaires ;
- creer une couche canonique separee de `xetu_mvp.json`.

### Phase 7 - Resolver et chat IA

But : transformer une phrase locale en action transport.

Exemple :

```text
"Je suis devant la police Dieuppeul, je vais a Sandaga"
-> depart probable
-> arret proche
-> ligne/sens
-> bus signale ou ETA
```

Regle :

- l'IA parle et clarifie ;
- le resolver determine avec les donnees Xetu ;
- l'IA ne choisit pas un arret invente.

### Phase 8 - Backend sessions propres

But : durcir ce qui marche deja avec les signalements.

Endpoints cible :

```text
POST /tracking/session/start
POST /tracking/session/ping
POST /tracking/session/stop
```

Tables cible :

```text
tracking_sessions
tracking_pings
bus_state
bus_events
```

Regle backend :

- Supabase uniquement via `db/queries.py` ;
- topologie uniquement via `core/network.py` ;
- zero logique metier dans `main.py`.

### Phase 9 - Anti-abus, privacy, batterie

But : garder la confiance.

A faire :

- corriger la dette anti-fraude P1-5 cote backend avant confiance haute ;
- limiter retention des pings ;
- anonymiser device/session ;
- gerer batterie et data ;
- stop automatique si hors bus/hors trace.

### Phase 10 - Beta terrain

But : tester le comportement reel.

Perimetre prioritaire :

- ligne `232` ;
- zones : Liberte, Dieuppeul, Yoff, Sandaga ;
- ensuite ligne `8`, `6`, `7` selon usage.

Signal attendu :

- un signalement aide vraiment les autres ;
- les notifications sont utiles ;
- les faux bus expirent ;
- les utilisateurs comprennent la confiance.

## Ce qui est deja fait

- Documentation tracking/carte consolidee.
- Documentation couche spatiale creee.
- Plan d'execution risk-first cree.
- Plan backend contract-first cree dans `whatsapp-agent`.
- Candidats Gemini/arrets/reperes generes.
- Outil offline `scripts/mapmatch_trace.py` cree dans `whatsapp-agent`.
- Test synthetique ligne `232` passe.

## Prochaine vraie implementation

La prochaine boucle n'est pas le streaming continu.

La prochaine boucle est :

```text
ameliorer le signalement existant
-> mode vu/dedans
-> TTL adapte
-> relance a la demande
-> garde-fous
-> carte et notification existantes plus honnetes
```

Tout travail futur doit partir de cette bible et cocher `bible-taches.md`.
