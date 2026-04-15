const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Stockage en mémoire des parties ─────────────────────────────────
// { [code]: { joueurs: N, connectes: N, socketIds: [] } }
const parties = {};

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
