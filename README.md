# 🃏 Barbu

Jeu de cartes multijoueur en temps réel, jouable dans le navigateur.  
Développé avec Node.js, Express et Socket.io.

---

## Présentation

Le **Barbu** est un jeu de cartes traditionnel à plis. Les joueurs s'affrontent sur plusieurs contrats, chacun avec ses propres règles de scoring. L'objectif général est d'**éviter** de remporter certaines cartes ou certains plis.

Cette implémentation supporte de **3 à 8 joueurs** connectés en réseau local ou sur Internet.

---

## Contrats

| # | Nom | Règle | Points |
|---|-----|-------|--------|
| 1 | **Ne prenez pas de plis !** | Chaque pli remporté coûte des points | 4 pts / pli |
| 2 | **Ne prenez pas de cœurs !** | Chaque cœur dans un pli remporté coûte des points | 6 pts / cœur |
| 3 | **Ne prenez pas de dames !** | Chaque dame dans un pli remporté coûte des points — le contrat se ferme dès que les 4 dames sont sorties | 12 pts / dame |
| 4 | **Ne prenez pas le Roi de Cœur !** | Prendre le K♥ coûte 52 points — le contrat se ferme dès que le Roi est pris | 52 pts |
| 5 | **Chaos !** | Toutes les règles s'appliquent simultanément et de façon cumulative — tous les plis sont joués jusqu'au bout | 4 (pli) + 6/cœur + 12/dame + 52 (K♥) |

### Exemple Chaos
Un joueur remporte un pli contenant 3 cœurs dont la Dame de Cœur :
> 4 (pli) + 3×6 (cœurs) + 1×12 (dame) = **34 pts**

Les scores sont **cumulatifs** sur les 5 contrats. Les cartes sont redistribuées à chaque nouveau contrat.

---

## Prérequis

- [Node.js](https://nodejs.org/) v16 ou supérieur
- npm (inclus avec Node.js)

---

## Installation

```bash
# Cloner ou télécharger le projet
cd Barbu

# Installer les dépendances
npm install
```

---

## Lancer le serveur

```bash
npm start
```

Le serveur démarre sur **http://localhost:3000**.

> Si le port 3000 est déjà utilisé, arrêtez le processus existant :
> ```powershell
> netstat -ano | findstr :3000
> taskkill /PID <PID> /F
> ```

---

## Comment jouer

### 1. Héberger une partie
1. Ouvrez `http://localhost:3000` dans votre navigateur.
2. Cliquez sur **Héberger une partie**.
3. Définissez un code à 6 chiffres et choisissez le nombre de joueurs (3 à 8).
4. Entrez votre pseudo dans la salle d'attente.
5. Partagez le code aux autres joueurs.

### 2. Rejoindre une partie
1. Ouvrez `http://localhost:3000`.
2. Cliquez sur **Rejoindre une partie**.
3. Entrez le code à 6 chiffres fourni par l'hôte.
4. Entrez votre pseudo.

### 3. Déroulement
- La partie commence dès que tous les joueurs sont connectés.
- Un tirage au sort désigne le joueur qui ouvre chaque contrat.
- **Cliquez sur votre tas de cartes** (en bas, dos rouge) pour voir votre main.
- Cliquez sur une carte pour la jouer — les cartes grisées ne sont pas jouables (règle de suivi de couleur).
- Le gagnant du pli rejoue en premier.
- À la fin de chaque contrat, les scores sont affichés et les cartes redistribuées automatiquement.
- À la fin des 5 contrats, le classement final s'affiche du perdant (le plus de points) au gagnant (le moins de points).

---

## Structure du projet

```
Barbu/
├── server.js          # Serveur Node.js (Express + Socket.io)
├── tapis.html         # Page d'accueil
├── heberger.html      # Création de partie
├── rejoindre.html     # Rejoindre une partie
├── partie.html        # Salle d'attente
├── jeu.html           # Plateau de jeu
├── xefia.png          # Logo affiché sur la table
├── package.json
└── .gitignore
```

---

## Règles techniques

- Le jeu utilise un **jeu de 52 cartes**. Si le nombre de joueurs ne divise pas 52 exactement, les cartes les plus basses sont retirées (2♥ et 2♦ en priorité).
- Le **suivi de couleur** est obligatoire : si vous avez la couleur demandée, vous devez la jouer.
- Le gagnant d'un pli est le joueur ayant joué la carte la plus haute **de la couleur d'ouverture** — une coupe ne prend pas.
- Les scores sont **cumulatifs** sur les 5 contrats.
- **Fermetures anticipées** : le contrat 3 se ferme dès que les 4 dames sont prises ; le contrat 4 se ferme dès que le Roi de Cœur est pris. Le contrat 5 (Chaos) se joue toujours jusqu'au bout.

---

## Technologies

| Rôle | Outil |
|------|-------|
| Serveur | Node.js + Express |
| Temps réel | Socket.io |
| Frontend | HTML5 / CSS3 / JavaScript vanilla |
| État du jeu | In-memory (objet JS côté serveur) |
