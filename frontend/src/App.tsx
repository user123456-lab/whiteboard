import { useEffect } from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { HistoryPanel } from './components/HistoryPanel';

function App() {
  const userId = useCanvasStore((s) => s.userId);
  const setUserId = useCanvasStore((s) => s.setUserId);
  const setUserName = useCanvasStore((s) => s.setUserName);
  const roomId = useCanvasStore((s) => s.roomId);
  const showHistory = useCanvasStore((s) => s.showHistory);

  useEffect(() => {
    const storedId = localStorage.getItem('wb-userid');
    const id = storedId || crypto.randomUUID();
    if (!storedId) {
      localStorage.setItem('wb-userid', id);
    }
    setUserId(id);

    const storedName = localStorage.getItem('wb-username');
    if (storedName) {
      setUserName(storedName);
    }
  }, [setUserId, setUserName]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0A0A0B]">
      {roomId && <Toolbar />}
      <RoomPanel />
      {roomId && showHistory && <HistoryPanel />}
      <WhiteboardCanvas />
    </div>
  );
}

export default App;
