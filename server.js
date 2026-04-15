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
  socket.on('creer_partie', ({ code, joueurs }) => {
    if (parties[code]) {
      // Reconnexion de l'hôte (ex: rafraîchissement de page)
      socket.join(code);
      socket.emit('salle_rejointe', { numero: 1, joueurs: parties[code].joueurs });
      socket.emit('maj_joueurs', { connectes: parties[code].connectes, joueurs: parties[code].joueurs });
      return;
    }

    parties[code] = { joueurs, connectes: 1, socketIds: [socket.id] };
    socket.join(code);
    console.log(`[Partie] Créée  : ${code} (${joueurs} joueurs)`);

    socket.emit('salle_rejointe', { numero: 1, joueurs });
    io.to(code).emit('maj_joueurs', { connectes: 1, joueurs });
  });

  // Un joueur rejoint une salle existante
  socket.on('rejoindre_partie', ({ code }) => {
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
    socket.join(code);

    console.log(`[Partie] ${code} : joueur ${p.connectes}/${p.joueurs} connecté`);

    socket.emit('salle_rejointe', { numero: p.connectes, joueurs: p.joueurs });
    io.to(code).emit('maj_joueurs', { connectes: p.connectes, joueurs: p.joueurs });

    // Tous connectés → on lance la partie
    if (p.connectes === p.joueurs) {
      console.log(`[Partie] ${code} : complète → lancement !`);
      setTimeout(() => {
        io.to(code).emit('tous_connectes', { code, joueurs: p.joueurs });
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
