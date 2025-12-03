const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Game state
const games = new Map();
const players = new Map();

// Game class
class Game {
  constructor(gameId, maxPlayers = 12) {
    this.id = gameId;
    this.maxPlayers = maxPlayers;
    this.players = [];
    this.gameState = 'waiting'; // waiting, started, day, night, ended
    this.currentPhase = 'day';
    this.dayCount = 0;
    this.nightCount = 0;
    this.werewolves = [];
    this.villagers = [];
    this.alivePlayers = [];
    this.deadPlayers = [];
    this.votes = new Map();
    this.winner = null;
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= this.maxPlayers) {
      return false;
    }
    this.players.push({
      id: playerId,
      name: playerName,
      role: null,
      alive: true
    });
    this.alivePlayers.push(playerId);
    return true;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    this.alivePlayers = this.alivePlayers.filter(id => id !== playerId);
    this.deadPlayers = this.deadPlayers.filter(id => id !== playerId);
  }

  startGame() {
    if (this.players.length < 5) {
      return false;
    }
    
    this.gameState = 'started';
    this.assignRoles();
    this.currentPhase = 'night';
    this.nightCount = 1;
    return true;
  }

  assignRoles() {
    // Shuffle players
    const shuffled = [...this.players].sort(() => Math.random() - 0.5);
    const werewolfCount = Math.ceil(this.players.length / 3);

    shuffled.forEach((player, index) => {
      if (index < werewolfCount) {
        player.role = 'werewolf';
        this.werewolves.push(player.id);
      } else {
        player.role = 'villager';
        this.villagers.push(player.id);
      }
    });
  }

  switchPhase() {
    if (this.currentPhase === 'night') {
      this.currentPhase = 'day';
      this.dayCount++;
    } else {
      this.currentPhase = 'night';
      this.nightCount++;
    }
  }

  getGameData() {
    return {
      id: this.id,
      gameState: this.gameState,
      currentPhase: this.currentPhase,
      dayCount: this.dayCount,
      nightCount: this.nightCount,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        role: p.role // You can hide this from other players
      })),
      alivePlayers: this.alivePlayers.length,
      deadPlayers: this.deadPlayers.length
    };
  }
}

// Socket.IO events
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('createGame', (data) => {
    const gameId = uuidv4();
    const game = new Game(gameId, data.maxPlayers || 12);
    games.set(gameId, game);
    
    socket.emit('gameCreated', { gameId });
  });

  socket.on('joinGame', (data) => {
    const { gameId, playerName } = data;
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const playerId = socket.id;
    const success = game.addPlayer(playerId, playerName);

    if (success) {
      players.set(playerId, { gameId, playerName });
      socket.join(gameId);
      io.to(gameId).emit('playerJoined', {
        playerId,
        playerName,
        players: game.players,
        totalPlayers: game.players.length
      });
    } else {
      socket.emit('error', { message: 'Game is full' });
    }
  });

  socket.on('startGame', (data) => {
    const { gameId } = data;
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const success = game.startGame();
    if (success) {
      io.to(gameId).emit('gameStarted', {
        gameData: game.getGameData(),
        yourRole: game.players.find(p => p.id === socket.id)?.role
      });
    } else {
      socket.emit('error', { message: 'Not enough players' });
    }
  });

  socket.on('vote', (data) => {
    const { gameId, votedPlayerId } = data;
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    game.votes.set(socket.id, votedPlayerId);
    io.to(gameId).emit('voteUpdated', {
      totalVotes: game.votes.size,
      totalPlayers: game.alivePlayers.length
    });

    // Check if all players voted
    if (game.votes.size === game.alivePlayers.length) {
      const result = calculateVotes(game);
      io.to(gameId).emit('voteResult', result);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const playerData = players.get(socket.id);
    if (playerData) {
      const game = games.get(playerData.gameId);
      if (game) {
        game.removePlayer(socket.id);
        io.to(playerData.gameId).emit('playerLeft', {
          playerId: socket.id,
          playerName: playerData.playerName,
          totalPlayers: game.players.length
        });
      }
    }
    players.delete(socket.id);
  });
});

function calculateVotes(game) {
  const voteCount = new Map();
  game.votes.forEach((votedId, voterId) => {
    voteCount.set(votedId, (voteCount.get(votedId) || 0) + 1);
  });

  const maxVotes = Math.max(...voteCount.values());
  const votedOut = [...voteCount.entries()].find(([_, votes]) => votes === maxVotes)?.[0];

  if (votedOut) {
    const player = game.players.find(p => p.id === votedOut);
    if (player) {
      player.alive = false;
      game.alivePlayers = game.alivePlayers.filter(id => id !== votedOut);
      game.deadPlayers.push(votedOut);
    }
  }

  game.votes.clear();
  return {
    votedOutPlayer: votedOut,
    playerRole: game.players.find(p => p.id === votedOut)?.role,
    alivePlayers: game.alivePlayers.length
  };
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
