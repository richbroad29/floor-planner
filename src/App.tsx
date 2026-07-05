import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { OptionsBar } from './components/OptionsBar';
import { FurniturePanel } from './components/FurniturePanel';
import { FloorBar } from './components/FloorBar';
import { SyncManager } from './components/SyncManager';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <SyncManager />
      <Toolbar />
      <div className="workarea">
        <FurniturePanel />
        <div className="canvas-col">
          <FloorBar />
          <Canvas />
        </div>
      </div>
      <OptionsBar />
    </div>
  );
}
