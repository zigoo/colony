import { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameCanvasGL } from './components/GameCanvasGL';
import { GLDevPanel } from './components/GLDevPanel';
import { WorldClockIndicator } from './components/WorldClockIndicator';
import { UnitTooltip } from './components/UnitTooltip';
import { UnitInfoPanel } from './components/UnitInfoPanel';
import { HUD } from './components/HUD';
import { Toolbar } from './components/Toolbar';
import { Minimap } from './components/Minimap';
import { SelectionBox } from './components/SelectionBox';
import { BuildingMenu } from './components/BuildingMenu';
import { BuildingInfoPanel } from './components/BuildingInfoPanel';

export default function App() {
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [glRenderer, setGlRenderer] = useState(() => !new URLSearchParams(location.search).has('2d'));

  // Press 'g' to toggle between the 2D canvas renderer and the WebGL one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') setGlRenderer(v => !v);
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {glRenderer ? <GameCanvasGL /> : <GameCanvas />}
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 50, font: '11px monospace', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4, pointerEvents: 'none' }}>
        {glRenderer ? 'WebGL (three.js) — press G for 2D' : '2D canvas — press G for WebGL'}
      </div>
      {glRenderer && <GLDevPanel />}
      {glRenderer && <WorldClockIndicator />}
      {glRenderer && <SelectionBox />}
      {glRenderer && <UnitTooltip />}
      {glRenderer && <UnitInfoPanel />}
      {!glRenderer && (
        <>
          <HUD />
          <Toolbar minimapVisible={minimapVisible} onToggleMinimap={() => setMinimapVisible(visible => !visible)} />
          {minimapVisible && <Minimap />}
          <SelectionBox />
          <BuildingMenu />
          <BuildingInfoPanel />
        </>
      )}
    </>
  );
}
