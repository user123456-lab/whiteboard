import { useEffect } from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';

function App() {
  const userId = useCanvasStore((s) => s.userId);
  const setUserId = useCanvasStore((s) => s.setUserId);
  const setUserName = useCanvasStore((s) => s.setUserName);
  const roomId = useCanvasStore((s) => s.roomId);

  useEffect(() => {
    // Generate userId on mount
    const storedId = localStorage.getItem('wb-userid');
    const id = storedId || crypto.randomUUID();
    if (!storedId) {
      localStorage.setItem('wb-userid', id);
    }
    setUserId(id);

    // Restore username
    const storedName = localStorage.getItem('wb-username');
    if (storedName) {
      setUserName(storedName);
    }

    // Auto-join room from URL
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      // Will be handled by RoomPanel
    }
  }, [setUserId, setUserName]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-900">
      {roomId && <Toolbar />}
      <RoomPanel />
      <WhiteboardCanvas />
    </div>
  );
}

export default App;
