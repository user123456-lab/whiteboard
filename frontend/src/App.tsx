import { useEffect } from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { useUserPrefs } from './store/useUserPrefs';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { SettingsPanel } from './components/SettingsPanel';

function App() {
  const userId = useCanvasStore((s) => s.userId);
  const setUserId = useCanvasStore((s) => s.setUserId);
  const setUserName = useCanvasStore((s) => s.setUserName);
  const roomId = useCanvasStore((s) => s.roomId);
  const showHistory = useCanvasStore((s) => s.showHistory);
  const hasSelection = useCanvasStore((s) => s.selectedIds.length > 0);
  const canvasBg = useUserPrefs((s) => s.canvasBg);
  const showSettings = useUserPrefs((s) => s.showSettings);

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
    <div className="w-screen h-screen overflow-hidden" style={{ background: canvasBg }}>
      {roomId && <Toolbar />}
      <RoomPanel />
      {roomId && showHistory && <HistoryPanel />}
      {roomId && hasSelection && <PropertiesPanel />}
      {showSettings && <SettingsPanel />}
      <WhiteboardCanvas />
    </div>
  );
}

export default App;
