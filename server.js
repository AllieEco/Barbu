const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Stockage en mémoire des parties ─────────────────────────────────
// { [code]: { joueurs: N, connectes: N, socketIds: [], pseudos: [] } }
const parties = {};

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

      // Générer et distribuer le jeu côté serveur (une seule source de vérité)
      const { mains, retirees, parJoueur } = distribuerCartes(p.joueurs);

      // Envoyer à chaque joueur uniquement sa propre main
      p.socketIds.forEach((socketId, i) => {
        io.to(socketId).emit('votre_main', { main: mains[i], retirees, parJoueur });
      });

      setTimeout(() => {
        io.to(code).emit('tous_connectes', { code, joueurs: p.joueurs, pseudos: p.pseudos, joueurCommence });
        delete parties[code];
      }, 1000);
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} déconnecté`);
    // TODO : gérer proprement les déconnexions en cours de partie
  });
});

// ── Démarrage ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏  Serveur Barbu démarré → http://localhost:${PORT}\n`);
});
