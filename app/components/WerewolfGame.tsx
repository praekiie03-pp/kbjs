'use client';

import { useState, useEffect } from 'react';
import io from 'socket.io-client';

let socket;

export default function WerewolfGame() {
  const [gameState, setGameState] = useState('menu'); // menu, lobby, game
  const [gameId, setGameId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [yourRole, setYourRole] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('day');
  const [alivePlayers, setAlivePlayers] = useState(0);
  const [votes, setVotes] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
    socket = io(serverUrl);

    socket.on('gameCreated', (data) => {
      setGameId(data.gameId);
      setGameState('lobby');
    });

    socket.on('playerJoined', (data) => {
      setPlayers(data.players);
      setTotalPlayers(data.totalPlayers);
    });

    socket.on('gameStarted', (data) => {
      setGameState('game');
      setYourRole(data.yourRole);
      setCurrentPhase(data.gameData.currentPhase);
      setPlayers(data.gameData.players);
      setAlivePlayers(data.gameData.alivePlayers);
    });

    socket.on('playerLeft', (data) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
      setTotalPlayers(data.totalPlayers);
    });

    socket.on('voteUpdated', (data) => {
      setVotes(data.totalVotes);
    });

    socket.on('voteResult', (data) => {
      console.log('Vote result:', data);
      setAlivePlayers(data.alivePlayers);
    });

    socket.on('error', (data) => {
      alert(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createGame = () => {
    socket.emit('createGame', { maxPlayers: 12 });
  };

  const joinGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    socket.emit('joinGame', { gameId, playerName });
  };

  const startGame = () => {
    if (players.length < 5) {
      alert('Need at least 5 players to start');
      return;
    }
    socket.emit('startGame', { gameId });
  };

  const vote = (votedPlayerId) => {
    socket.emit('vote', { gameId, votedPlayerId });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#D9A8FF', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: 'white', padding: '30px', borderRadius: '10px' }}>
        <h1 style={{ textAlign: 'center', color: '#333' }}>🐺 Werewolf Game</h1>

        {gameState === 'menu' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: '20px' }}>Welcome to Werewolf Online!</p>
            <button
              onClick={createGame}
              style={{
                padding: '10px 20px',
                marginRight: '10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Create Game
            </button>
            <input
              type="text"
              placeholder="Enter Game ID"
              style={{ padding: '10px', marginRight: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
              onChange={(e) => setGameId(e.target.value)}
            />
            <button
              onClick={() => {
                if (gameId.trim()) setGameState('lobby');
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Join Game
            </button>
          </div>
        )}

        {gameState === 'lobby' && (
          <div>
            <p><strong>Game ID:</strong> {gameId}</p>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box' }}
            />
            <button
              onClick={joinGame}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                marginBottom: '20px',
                fontSize: '16px'
              }}
            >
              Join Game
            </button>

            <h3>Players ({totalPlayers}/12):</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {players.map(player => (
                <li key={player.id} style={{ padding: '8px', backgroundColor: '#f0f0f0', marginBottom: '5px', borderRadius: '3px' }}>
                  {player.name} {player.alive ? '✓' : '✗'}
                </li>
              ))}
            </ul>

            {totalPlayers >= 5 && (
              <button
                onClick={startGame}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  marginTop: '20px',
                  fontSize: '16px'
                }}
              >
                Start Game
              </button>
            )}
          </div>
        )}

        {gameState === 'game' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2>Your Role: <span style={{ color: yourRole === 'werewolf' ? '#d9534f' : '#5cb85c' }}>{yourRole?.toUpperCase()}</span></h2>
              <p><strong>Phase:</strong> {currentPhase.toUpperCase()}</p>
              <p><strong>Alive Players:</strong> {alivePlayers}</p>
            </div>

            <h3>Players:</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {players.filter(p => p.alive).map(player => (
                <div
                  key={player.id}
                  style={{
                    padding: '10px',
                    backgroundColor: '#f0f0f0',
                    borderRadius: '5px',
                    cursor: currentPhase === 'day' ? 'pointer' : 'default',
                    opacity: player.alive ? 1 : 0.5
                  }}
                  onClick={() => currentPhase === 'day' && vote(player.id)}
                >
                  <strong>{player.name}</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>{player.alive ? '🟢 Alive' : '🔴 Dead'}</p>
                </div>
              ))}
            </div>

            <p style={{ textAlign: 'center', color: '#999' }}>
              {currentPhase === 'day' ? 'Click a player to vote them out' : 'Waiting for day phase...'}
            </p>
            <p style={{ textAlign: 'center', color: '#999' }}>Votes: {votes}/{alivePlayers}</p>
          </div>
        )}
      </div>
    </div>
  );
}
