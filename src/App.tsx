import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { Toolbar } from './components/Toolbar';

export default function App() {
  return (
    <>
      <GameCanvas />
      <HUD />
      <Toolbar />
    </>
  );
}
