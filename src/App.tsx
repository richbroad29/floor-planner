import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { OptionsBar } from './components/OptionsBar';
import { FurniturePanel } from './components/FurniturePanel';
import { FloorBar } from './components/FloorBar';
import './App.css';

export default function App() {
  return (
    <div className="app">
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
