import { useEffect } from 'react';
import { fetchNetworkInfo } from './services/network';
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
    // sessionStorage = per-tab unique (multi-window testing)
    let storedId = sessionStorage.getItem('wb-userid');
    if (!storedId) {
      storedId = crypto.randomUUID();
      sessionStorage.setItem('wb-userid', storedId);
    }
    setUserId(storedId);

    const storedName = localStorage.getItem('wb-username');
    if (storedName) {
      setUserName(storedName);
    }
  }, [setUserId, setUserName]);

  useEffect(() => {
    fetchNetworkInfo()
      .then((info) => {
        useCanvasStore.getState().setNetworkInfo(info);
      })
      .catch(() => {
        // 网络信息获取失败，不显示 IP（功能降级）
      });
  }, []);

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
