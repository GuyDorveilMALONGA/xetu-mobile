# Plan Xetu - couche spatiale, reperes Dakar et agent IA

Date : 2026-06-25  
Repo mobile : `C:\Users\DELL\Desktop\xetu-mobile`  
Source de verite metier : `C:\Users\DELL\Desktop\whatsapp-agent\Dashboard\data\xetu_mvp.json`

Ce document separe la couche "reperes Dakar" du plan tracking. Le tracking repond a "ou est le bus ?". La couche spatiale repond a "qu'est-ce que l'utilisateur veut dire quand il parle comme un Dakarois ?".

Exemples cibles :

- "Je suis a Liberte 6, je vais a Yoff."
- "Je suis devant la police Dieuppeul."
- "Je suis a l'ecole ESTG."
- "Je veux aller a Sandaga."
- "Je suis vers la Renaissance."
- "Je prends la 232 vers Senelec."

## Principe central

`xetu_mvp.json` reste la source de verite pour :

- lignes ;
- arrets ;
- coordonnees GPS des arrets ;
- traces `geometry_aller` / `geometry_retour` ;
- hubs/quartiers deja valides.

Gemini/Maps sert seulement de scout :

- proposer des noms de lieux ;
- proposer des alias oraux ;
- proposer des zones probables ;
- aider a identifier les reperes connus de Dakar.

Mais Gemini/Maps ne devient pas source canonique directement. Tout ce qui vient de Gemini reste :

```json
{
  "status": "needs_review",
  "confidence": "unverified"
}
```

## Fichiers de travail actuels

### Candidats arrets, hubs, quartiers et aliases

```text
C:\Users\DELL\Desktop\xetu-mobile\spatial_candidates.gemini.all.jsonl
```

Etat :

- `6 916` records ;
- `768` arrets sources couverts ;
- `4 868` suggestions Gemini ;
- tous les arrets MVP ont au moins une proposition Gemini.

Usage : enrichir les noms d'arrets, alias terrain, petites references autour de chaque arret.

### Candidats grands reperes Dakar

```text
C:\Users\DELL\Desktop\xetu-mobile\spatial_landmark_candidates.review.jsonl
```

Etat :

- `166` reperes uniques ;
- sources melangees : seed web/Xetu + Gemini par zones + patch cible ;
- tout est a revoir avant canonisation.

Exemples couverts :

- Monument de la Renaissance africaine ;
- Phare des Mamelles ;
- Mosquee de la Divinite ;
- Police de Dieuppeul ;
- Commissariat de Dieuppeul ;
- ESTG Dakar ;
- Station Shell Liberte 6 ;
- Rond-point Liberte 6 ;
- Marche Dieuppeul ;
- Derkle Marche.

## Modele mental

La couche spatiale doit devenir un resolver :

```text
texte utilisateur + GPS actuel + intention
-> candidats lieux/reperes
-> arrets proches
-> lignes possibles
-> clarification si ambigu
-> reponse actionnable
```

Exemple :

```text
Utilisateur : "je suis a Liberte 6, je vais a Yoff"

Resolver :
- Liberte 6 est une zone, pas un arret unique.
- GPS utilisateur confirme le secteur.
- Arrets proches : Mosquee Liberte 6 Extension, Route Liberte 6, etc.
- Destination Yoff correspond a plusieurs arrets.
- Ligne probable : 232, selon le point exact et le sens.

Reponse :
"Tu es vers Liberte 6. Pour aller a Yoff, la ligne la plus probable est 232.
Tu es plus proche de Mosquee Liberte 6 Extension ou Route Liberte 6 ?"
```

## Slices d'execution

### Slice 1 - Inventaire propre des donnees

But : savoir ce qu'on a deja, sans rien inventer.

A faire :

- lire `xetu_mvp.json` ;
- lister lignes, arrets, coordonnees, hubs, quartiers ;
- produire un rapport lisible : combien d'arrets ont deja aliases, hub, quartier, coordonnees ;
- identifier les trous evidents : lieux connus absents, quartiers trop larges, aliases pauvres.

Sortie attendue :

```text
spatial_inventory.report.json
```

Decision :

- rien n'est modifie dans `xetu_mvp.json`.

### Slice 2 - Nettoyage des candidats Gemini existants

But : transformer les fichiers Gemini bruts en liste exploitable.

A faire :

- dedupliquer les candidats ;
- normaliser accents/casse/ponctuation ;
- regrouper les doublons proches : `Renaissance`, `Statue Renaissance`, `Monument de la Renaissance` ;
- separer les types : `stop_alias`, `landmark_alias`, `zone`, `hub_alias`, `education_hub`, `market_hub`, etc. ;
- garder la provenance.

Sortie attendue :

```text
spatial_candidates.review.jsonl
spatial_candidates.review.report.json
```

Critere de validation :

- aucun candidat Gemini ne passe en `validated` automatiquement.

### Slice 3 - Liaison reperes -> arrets proches

But : relier "Police Dieuppeul" ou "ESTG" aux arrets Xetu les plus probables.

A faire :

- pour chaque repere, essayer de trouver une position ou une zone ;
- si le repere a une coordonnee fiable : calculer les arrets proches par distance GPS ;
- si le repere n'a pas de coordonnee : utiliser zone + texte + stops proches de la zone ;
- produire un top 3 des arrets proches ;
- ajouter un score et une raison.

Format cible :

```json
{
  "landmark": "Police de Dieuppeul",
  "status": "needs_review",
  "nearby_stops": [
    {
      "line": "232",
      "direction": "arrets",
      "stop_name": "Sapeur Pompier Dieuppeul",
      "distance_m": 180,
      "score": 0.82,
      "reason": "same zone + close GPS"
    }
  ]
}
```

Sortie attendue :

```text
spatial_landmark_stop_links.review.jsonl
```

Point important :

- cette slice est celle qui rend la couche utile pour l'agent.
- sans cette liaison, on a des noms, mais pas encore des actions transport.

### Slice 4 - Revue humaine / terrain

But : eviter que Gemini hallucine Dakar dans notre source.

A faire :

- afficher les candidats en tableau ;
- prioriser les reperes a fort impact : Renaissance, Sandaga, UCAD, Yoff, Liberte, Dieuppeul, Parcelles, Plateau ;
- marquer chaque lien comme `validated`, `rejected` ou `needs_more_info` ;
- conserver les raisons.

Regle :

- un repere peut etre valide meme si certains aliases sont rejetes.
- un alias peut etre valide sur une zone mais pas sur une autre.

Sortie attendue :

```text
spatial_landmark_stop_links.validated.jsonl
```

### Slice 5 - Canonisation backend

But : integrer seulement ce qui est valide dans la vraie couche backend.

A faire :

- choisir la forme canonique :
  - soit enrichir `xetu_mvp.json` avec aliases/hubs ;
  - soit creer un fichier separe `xetu_spatial_layer.json`.
- ne pas melanger donnees verifiees et suggestions.
- garder les champs `source`, `validated_at`, `validated_by`, `confidence`.

Option recommandee :

```text
xetu_mvp.json              = lignes, arrets, traces
xetu_spatial_layer.json    = reperes, aliases, zones, liens vers arrets
```

Pourquoi :

- le MVP JSON reste propre ;
- les reperes peuvent evoluer rapidement ;
- on peut rejeter/ajouter des aliases sans toucher aux traces de lignes.

### Slice 6 - Resolver IA local

But : permettre a l'agent de comprendre une phrase utilisateur.

Entrees :

- texte utilisateur ;
- GPS utilisateur si disponible ;
- intention : depart, destination, ligne, suivi, question ;
- contexte de ligne si l'utilisateur dit "je prends la 232".

Sorties :

```json
{
  "resolved_from": {
    "kind": "landmark",
    "name": "Police de Dieuppeul",
    "nearby_stops": [...]
  },
  "resolved_to": {
    "kind": "zone",
    "name": "Yoff",
    "nearby_stops": [...]
  },
  "candidate_lines": ["232"],
  "needs_clarification": true,
  "question": "Tu es cote Route Liberte 6 ou cote Mosquee Liberte 6 Extension ?"
}
```

Regle produit :

- si le GPS tranche l'ambiguite, ne pas poser de question inutile.
- si plusieurs arrets proches sont plausibles, poser une question courte.

### Slice 7 - Integration chat / notification

But : transformer le resolver en valeur utilisateur.

Cas d'usage :

- "Je suis ou ?" -> arrets proches + reperes autour.
- "Je vais a Sandaga" -> lignes possibles + arret de depart.
- "Le bus 232 est ou ?" -> ligne + sens + prochain passage estime.
- "Je suis dans le bus" -> demarrer tracking si consentement.
- "Descends-moi a Yoff" -> notifier avant l'arret cible.

Reponse cible :

```text
Tu es vers Police de Dieuppeul. Pour aller a Sandaga, marche vers l'arret
Sapeur Pompier Dieuppeul. Ligne probable : 232. Je peux te prevenir avant
l'arret Sandaga.
```

### Slice 8 - Observabilite et correction terrain

But : apprendre des erreurs sans casser la confiance.

A faire :

- logger les requetes non resolues ;
- logger les clarifications posees ;
- logger les choix utilisateur ;
- creer une file de corrections : alias a ajouter, repere faux, zone ambigue.

Exemples :

```text
"ESTG" non resolu -> ajouter comme education_hub si confirme.
"Police Dieuppeul" resolu trop loin -> corriger lien stop.
"Liberte 6" trop vague -> garder clarification.
```

## Roadmap recommandee

### Phase A - Donnees de travail

1. Garder `spatial_candidates.gemini.all.jsonl`.
2. Garder `spatial_landmark_candidates.review.jsonl`.
3. Produire `spatial_landmark_stop_links.review.jsonl`.
4. Faire une revue manuelle des 50 reperes les plus importants.

### Phase B - Resolver sans IA generative

1. Recherche texte locale fuzzy.
2. Filtre GPS rayon 300 m / 600 m / 1 km.
3. Filtre ligne si l'utilisateur cite une ligne.
4. Clarification si plusieurs arrets.

Objectif :

- obtenir des reponses fiables sans demander a Gemini en temps reel.

### Phase C - IA generative controlee

1. L'agent reformule et dialogue.
2. Le resolver reste deterministe.
3. Gemini/LLM ne choisit pas seul l'arret final.
4. L'IA explique le choix et pose les questions.

### Phase D - Tracking + ETA

1. Une fois depart/destination resolus, connecter au `bus_state`.
2. Utiliser position bus live + trace Dem Dikk.
3. Calculer ETA et confiance.
4. Envoyer notification avant descente.

## Ce qu'il ne faut pas faire

- Ne pas mettre directement Gemini dans `xetu_mvp.json`.
- Ne pas utiliser Google Maps comme base persistante brute.
- Ne pas inventer de coordonnees.
- Ne pas repondre avec certitude si le lieu est ambigu.
- Ne pas demander une precision si le GPS suffit a trancher.
- Ne pas melanger tracking bus et resolution des lieux : ce sont deux couches differentes.

## Definition de termine pour cette couche

- Un utilisateur peut parler en langage naturel local.
- Xetu peut trouver les arrets proches de son GPS.
- Xetu peut relier les reperes connus aux arrets.
- Xetu sait dire "je ne suis pas sur" et poser une bonne question.
- Les suggestions Gemini restent separees tant qu'elles ne sont pas validees.
- Les donnees validees ont une provenance claire.
