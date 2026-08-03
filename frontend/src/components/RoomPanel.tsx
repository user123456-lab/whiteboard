import { useState } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { connect, disconnect } from '../services/websocket';
import { UserList } from './UserList';

function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function RoomPanel() {
  const roomId = useCanvasStore((s) => s.roomId);
  const setRoomId = useCanvasStore((s) => s.setRoomId);
  const userId = useCanvasStore((s) => s.userId);
  const userName = useCanvasStore((s) => s.userName);
  const wsConnected = useCanvasStore((s) => s.wsConnected);
  const wsReconnecting = useCanvasStore((s) => s.wsReconnecting);

  const [joinInput, setJoinInput] = useState('');
  const [nameInput, setNameInput] = useState(() => {
    const stored = localStorage.getItem('wb-username');
    return stored || '';
  });

  const handleCreateRoom = () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    localStorage.setItem('wb-username', name);
    useCanvasStore.getState().setUserName(name);

    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    connect(newRoomId, userId, name);
  };

  const handleJoinRoom = () => {
    if (!joinInput.trim() || !nameInput.trim()) return;
    const name = nameInput.trim();
    localStorage.setItem('wb-username', name);
    useCanvasStore.getState().setUserName(name);

    setRoomId(joinInput.trim().toLowerCase());
    connect(joinInput.trim().toLowerCase(), userId, name);
  };

  const handleLeaveRoom = () => {
    disconnect();
    setRoomId(null);
    useCanvasStore.getState().loadShapes([]);
    useCanvasStore.getState().setUsers([]);
    useCanvasStore.getState().setSelectedId(null);
    // Clear remote cursors
    const store = useCanvasStore.getState();
    Object.keys(store.remoteCursors).forEach(k => store.removeRemoteCursor(k));
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link).catch(() => {});
  };

  if (roomId) {
    return (
      <div className="fixed top-4 left-4 bg-gray-800/90 backdrop-blur rounded-xl p-3 shadow-xl border border-gray-700 z-50 min-w-[200px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <div className="w-2 h-2 rounded-full bg-green-500" />
            ) : wsReconnecting ? (
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-red-500" />
            )}
            <span className="text-sm text-gray-300">
              {wsConnected ? (
                <>Room: <span className="text-white font-mono">{roomId}</span></>
              ) : wsReconnecting ? (
                <span className="text-yellow-400">Reconnecting...</span>
              ) : (
                <span className="text-red-400">Disconnected</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex gap-1 mb-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Copy Link
          </button>
          <button
            onClick={handleLeaveRoom}
            className="flex-1 text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50 transition-colors"
          >
            Leave
          </button>
        </div>
        <UserList />
      </div>
    );
  }

  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800/95 backdrop-blur rounded-xl p-6 shadow-2xl border border-gray-700 z-50 w-[320px]">
      <h1 className="text-xl font-bold text-white mb-4 text-center">Collaborative Whiteboard</h1>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Your Name</label>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Enter your name..."
          className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={20}
        />
      </div>

      <button
        onClick={handleCreateRoom}
        disabled={!nameInput.trim()}
        className="w-full mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        Create New Room
      </button>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 border-t border-gray-700" />
        <span className="text-xs text-gray-500">or join</span>
        <div className="flex-1 border-t border-gray-700" />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          placeholder="Room code..."
          className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={20}
          onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
        />
        <button
          onClick={handleJoinRoom}
          disabled={!joinInput.trim() || !nameInput.trim()}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          Join
        </button>
      </div>
    </div>
  );
}
