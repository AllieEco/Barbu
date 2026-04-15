const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Stockage en mémoire des parties ─────────────────────────────────
const parties = {}; // lobby : { joueurs, connectes, socketIds, pseudos }
const jeux    = {}; // en cours : { pseudos, socketIds, mains, joueurCourant, pliActuel, suitePli }

const ORDRE_RANK = {'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'10':8,'J':9,'Q':10,'K':11,'A':12};

// ── Génération et distribution du jeu de cartes ──────────────────────
const SUITS = ['♥', '♦', '♣', '♠'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const ROUGE = new Set(['♥', '♦']);

function distribuerCartes(nbJoueurs) {
  const aRetirer  = 52 % nbJoueurs;
  const parJoueur = Math.floor(52 / nbJoueurs);

  // Jeu complet
  const jeu = [];
  for (const rank of RANKS)
    for (const suit of SUITS)
      jeu.push({ rank, suit, rouge: ROUGE.has(suit) });

  // Retirer les plus petites cartes (rouges en priorité)
  const retirees = [];
  let count = 0;
  outer: for (const rank of RANKS) {
    for (const suit of SUITS) {
      if (count >= aRetirer) break outer;
      const idx = jeu.findIndex(c => c.rank === rank && c.suit === suit);
      if (idx !== -1) { retirees.push(jeu.splice(idx, 1)[0]); count++; }
    }
  }

  // Mélanger (Fisher-Yates)
  for (let i = jeu.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [jeu[i], jeu[j]] = [jeu[j], jeu[i]];
  }

  // Distribuer une main par joueur
  const mains = Array.from({ length: nbJoueurs }, (_, i) =>
    jeu.slice(i * parJoueur, (i + 1) * parJoueur)
  );

  return { mains, retirees, parJoueur };
}

// ── Fichiers statiques ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// Rediriger la racine vers tapis.html
app.get('/', (req, res) => {
  res.redirect('/tapis.html');
});

// ── API REST : vérifier si une partie existe ─────────────────────────
app.get('/api/partie/:code', (req, res) => {
  const p = parties[req.params.code];
  if (p) {
    res.json({ existe: true, joueurs: p.joueurs, connectes: p.connectes });
  } else {
    res.json({ existe: false });
  }
});

// ── Socket.io ────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id} connecté`);

  // L'hôte enregistre la partie et entre dans la salle
  socket.on('creer_partie', ({ code, joueurs, pseudo }) => {
    if (parties[code]) {
      socket.join(code);
      socket.emit('salle_rejointe', { numero: 1, joueurs: parties[code].joueurs });
      socket.emit('maj_joueurs', { pseudos: parties[code].pseudos });
      return;
    }

    parties[code] = { joueurs, connectes: 1, socketIds: [socket.id], pseudos: [pseudo] };
    socket.join(code);
    console.log(`[Partie] Créée  : ${code} (${joueurs} joueurs) — hôte : ${pseudo}`);

    socket.emit('salle_rejointe', { numero: 1, joueurs });
    io.to(code).emit('maj_joueurs', { pseudos: parties[code].pseudos });
  });

  // Un joueur rejoint une salle existante
  socket.on('rejoindre_partie', ({ code, pseudo }) => {
    const p = parties[code];

    if (!p) {
      socket.emit('erreur_partie', { message: 'Partie introuvable.' });
      return;
    }
    if (p.connectes >= p.joueurs) {
      socket.emit('erreur_partie', { message: 'La partie est déjà complète.' });
      return;
    }

    p.connectes++;
    p.socketIds.push(socket.id);
    p.pseudos.push(pseudo);
    socket.join(code);

    console.log(`[Partie] ${code} : ${pseudo} (${p.connectes}/${p.joueurs})`);

    socket.emit('salle_rejointe', { numero: p.connectes, joueurs: p.joueurs });
    io.to(code).emit('maj_joueurs', { pseudos: p.pseudos });

    // Tous connectés → on lance la partie
    if (p.connectes === p.joueurs) {
      console.log(`[Partie] ${code} : complète → lancement !`);
      const joueurCommence = Math.floor(Math.random() * p.joueurs);
      console.log(`[Partie] ${code} : commence → ${p.pseudos[joueurCommence]}`);

      // Générer et distribuer le jeu côté serveur
      const { mains, retirees, parJoueur } = distribuerCartes(p.joueurs);

      // Envoyer à chaque joueur uniquement sa propre main
      p.socketIds.forEach((socketId, i) => {
        io.to(socketId).emit('votre_main', { main: mains[i], retirees, parJoueur });
      });

      // Créer l'état de jeu persistant
      jeux[code] = {
        pseudos:       p.pseudos,
        socketIds:     [...p.socketIds],
        mains,
        joueurCourant: joueurCommence,
        pliActuel:     [],
        suitePli:      null,
        scores:        new Array(p.joueurs).fill(0)  // plis remportés par joueur
      };

      setTimeout(() => {
        io.to(code).emit('tous_connectes', { code, joueurs: p.joueurs, pseudos: p.pseudos, joueurCommence });
        delete parties[code];
      }, 1000);
    }
  });

  // Joueur qui arrive sur jeu.html — ré-enregistrer son socket
  socket.on('rejoindre_jeu', ({ code, monIndex }) => {
    const jeu = jeux[code];
    if (!jeu) { console.log(`[Jeu] rejoindre_jeu: partie ${code} introuvable`); return; }
    socket.data.gameCode    = code;
    socket.data.joueurIndex = monIndex;
    jeu.socketIds[monIndex] = socket.id;
    socket.join(code);
    console.log(`[Jeu] ${jeu.pseudos[monIndex]} rejoint ${code} (socket ${socket.id})`);
    socket.emit('etat_jeu', {
      joueurCourant: jeu.joueurCourant,
      pliActuel:     jeu.pliActuel,
      suitePli:      jeu.suitePli
    });
  });

  // Un joueur joue une carte
  socket.on('jouer_carte', ({ code, carte }) => {
    const jeu = jeux[code];
    if (!jeu) { console.log(`[Jeu] jouer_carte: partie ${code} introuvable`); return; }

    // Identification fiable via socket.data
    const joueurIndex = (socket.data.gameCode === code)
      ? socket.data.joueurIndex
      : jeu.socketIds.indexOf(socket.id);

    if (joueurIndex === undefined || joueurIndex === -1) {
      console.log(`[Jeu] jouer_carte: joueur non identifié (socket ${socket.id})`); return;
    }
    if (joueurIndex !== jeu.joueurCourant) {
      console.log(`[Jeu] jouer_carte: pas le tour de ${jeu.pseudos[joueurIndex]}`); return;
    }

    const main = jeu.mains[joueurIndex];

    // Vérifier le suivi de couleur
    if (jeu.suitePli) {
      const aLaCouleur = main.some(c => c.suit === jeu.suitePli);
      if (aLaCouleur && carte.suit !== jeu.suitePli) {
        socket.emit('carte_refusee', { message: `Vous devez jouer ${jeu.suitePli}` });
        return;
      }
    }

    // Vérifier que la carte est dans la main
    const idx = main.findIndex(c => c.rank === carte.rank && c.suit === carte.suit);
    if (idx === -1) return;
    main.splice(idx, 1);

    // Enregistrer dans le pli courant
    if (jeu.pliActuel.length === 0) jeu.suitePli = carte.suit;
    jeu.pliActuel.push({ joueurIndex, carte });

    const nbJ        = jeu.socketIds.length;
    const pliComplet = jeu.pliActuel.length === nbJ;
    const suivant    = pliComplet ? null : (joueurIndex + 1) % nbJ;

    if (!pliComplet) jeu.joueurCourant = suivant;

    io.to(code).emit('carte_jouee', { joueurIndex, carte, joueurSuivant: suivant });

    if (pliComplet) {
      // Gagnant = carte la plus haute de la couleur demandée
      let gagnant  = jeu.pliActuel[0].joueurIndex;
      let meilleure = -1;
      for (const { joueurIndex: ji, carte: c } of jeu.pliActuel) {
        if (c.suit === jeu.suitePli && ORDRE_RANK[c.rank] > meilleure) {
          meilleure = ORDRE_RANK[c.rank];
          gagnant   = ji;
        }
      }

      jeu.scores[gagnant] += 4; // chaque pli vaut 4 points (première partie)
      jeu.pliActuel     = [];
      jeu.suitePli      = null;
      jeu.joueurCourant = gagnant;
      console.log(`[Jeu] ${code} : pli → ${jeu.pseudos[gagnant]} (${jeu.scores[gagnant]} pli(s))`);

      setTimeout(() => {
        io.to(code).emit('pli_termine', { gagnant, scores: jeu.scores });
        if (jeu.mains[0].length === 0) {
          io.to(code).emit('partie_terminee', { scores: jeu.scores, pseudos: jeu.pseudos });
          delete jeux[code];
        }
      }, 1500);
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} déconnecté`);
  });
});

// ── Démarrage ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏  Serveur Barbu démarré → http://localhost:${PORT}\n`);
});
