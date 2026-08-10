import { useState } from 'react';
import { Copy, LogOut, Users, Link, Wifi, WifiOff, RefreshCw } from 'lucide-react';
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
  const users = useCanvasStore((s) => s.users);
  const networkInfo = useCanvasStore((s) => s.networkInfo);

  const [joinInput, setJoinInput] = useState('');
  const [nameInput, setNameInput] = useState(() => {
    return localStorage.getItem('wb-username') || '';
  });
  const [copied, setCopied] = useState(false);

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
    const store = useCanvasStore.getState();
    Object.keys(store.remoteCursors).forEach((k) => store.removeRemoteCursor(k));
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  // ─── In-Room: Minimal corner widget ───
  if (roomId) {
    return (
      <div className="fixed top-3 right-3 z-panel hover-expand-trigger select-none">
        {/* Always-visible status bar */}
        <div className="glass-panel px-3 py-2 flex items-center gap-2.5 cursor-pointer min-w-[160px]">
          {/* Connection status */}
          {wsConnected ? (
            <Wifi className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          ) : wsReconnecting ? (
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          )}

          {/* Room code */}
          <span className="text-xs text-slate-300 font-mono tracking-wider font-medium">
            {roomId}
          </span>

          {/* Online count */}
          <div className="flex items-center gap-1 ml-auto">
            <Users className="w-3 h-3 text-slate-500" />
            <span className="text-[11px] text-slate-400 tabular-nums">{users.length}</span>
          </div>
        </div>

        {/* Expandable details (on hover) */}
        <div className="hover-expand-content">
          <div className="glass-panel mt-1.5 px-3 py-2.5 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Room</span>
              <span className="text-xs text-slate-200 font-mono font-medium">{roomId}</span>
            </div>

            {/* 局域网地址 */}
            {networkInfo && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded bg-white/5">
                <span className="text-[10px] text-slate-500 flex-shrink-0">LAN</span>
                <code className="text-[10px] text-slate-400 font-mono truncate">
                  http://{networkInfo.lanIp}:{networkInfo.frontendPort}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`http://${networkInfo.lanIp}:${networkInfo.frontendPort}`)
                      .catch(() => {});
                  }}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  <Copy className="w-2.5 h-2.5 text-slate-500" />
                </button>
              </div>
            )}

            <UserList />

            <div className="flex gap-1.5 mt-3">
              <button
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-slate-300 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
              >
                {copied ? (
                  <>
                    <span className="text-green-400 text-xs">Copied</span>
                  </>
                ) : (
                  <>
                    <Link className="w-3 h-3" />
                    Copy Link
                  </>
                )}
              </button>
              <button
                onClick={handleLeaveRoom}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 transition-all cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                Leave
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Login: Centered join/create dialog ───
  return (
    <div className="fixed inset-0 flex items-center justify-center z-modal bg-black/60 backdrop-blur-sm">
      <div className="glass-panel p-6 w-[340px] max-w-[90vw]">
        <h1 className="text-lg font-semibold text-slate-100 mb-5 text-center tracking-tight">
          Collaborative Whiteboard
        </h1>

        {/* 局域网地址提示 */}
        {networkInfo && (
          <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0">LAN</span>
            <code className="text-[11px] text-slate-300 font-mono flex-1 truncate">
              http://{networkInfo.lanIp}:{networkInfo.frontendPort}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`http://${networkInfo.lanIp}:${networkInfo.frontendPort}`)
                  .catch(() => {});
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
              title="复制局域网地址"
            >
              <Copy className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-[11px] text-slate-500 mb-1.5 font-medium tracking-wide uppercase">
            Your Name
          </label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Enter your name..."
            className="w-full px-3 py-2 bg-white/5 rounded-lg text-sm text-slate-200 outline-none border border-white/10 focus:border-accent focus:ring-1 focus:ring-accent/30 placeholder:text-slate-600 transition-all"
            maxLength={20}
            autoFocus
          />
        </div>

        <button
          onClick={handleCreateRoom}
          disabled={!nameInput.trim()}
          className="w-full mb-3 px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium cursor-pointer"
        >
          Create New Room
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-[10px] text-slate-600 font-medium">or join</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Room code..."
            className="flex-1 px-3 py-2 bg-white/5 rounded-lg text-sm text-slate-200 outline-none border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-slate-600 transition-all font-mono"
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            aria-label="Room code"
          />
          <button
            onClick={handleJoinRoom}
            disabled={!joinInput.trim() || !nameInput.trim()}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium cursor-pointer"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
