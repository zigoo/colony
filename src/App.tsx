import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { Toolbar } from './components/Toolbar';
import { Minimap } from './components/Minimap';
import { SelectionBox } from './components/SelectionBox';
import { BuildingMenu } from './components/BuildingMenu';

export default function App() {
  const [minimapVisible, setMinimapVisible] = useState(true);

  return (
    <>
      <GameCanvas />
      <HUD />
      <Toolbar minimapVisible={minimapVisible} onToggleMinimap={() => setMinimapVisible(visible => !visible)} />
      {minimapVisible && <Minimap />}
      <SelectionBox />
      <BuildingMenu />
    </>
  );
}
