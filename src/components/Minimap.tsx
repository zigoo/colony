import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { TILE_COLORS, TILE_W, TILE_H } from '../game/constants';
import { worldToGrid, gridToWorld } from '../game/isoMath';

const SIZE = 180;
const SCALE = SIZE / 120;

export const Minimap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const game = useStore(state => state.game);
  const camera = useStore(state => state.camera);
  const panCamera = useStore(state => state.panCamera);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, SIZE, SIZE);

    for (const tile of Object.values(game.map.tiles)) {
      context.fillStyle = TILE_COLORS[tile.type];
      context.fillRect(tile.col * SCALE, tile.row * SCALE, Math.ceil(SCALE), Math.ceil(SCALE));
    }

    context.fillStyle = '#ffffff';
    for (const unit of Object.values(game.units)) {
      const col = unit.prevCol + (unit.col - unit.prevCol) * unit.moveProgress;
      const row = unit.prevRow + (unit.row - unit.prevRow) * unit.moveProgress;
      context.beginPath();
      context.arc(col * SCALE + SCALE / 2, row * SCALE + SCALE / 2, 2.5, 0, Math.PI * 2);
      context.fill();
    }

    // Screen corners in world space → grid → minimap (gives diamond for iso viewport)
    const halfWidth = camera.screenWidth / (2 * camera.zoom);
    const halfHeight = camera.screenHeight / (2 * camera.zoom);
    const corners = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ].map(([worldOffsetX, worldOffsetY]) => {
      const { col, row } = worldToGrid(camera.x + worldOffsetX, camera.y + worldOffsetY);
      return { x: col * SCALE, y: row * SCALE };
    });

    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach(corner => context.lineTo(corner.x, corner.y));
    context.closePath();
    context.fillStyle = 'rgba(255, 255, 255, 0.08)';
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    context.lineWidth = 1;
    context.stroke();
  }, [game, camera]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = event.clientX - lastPosition.current.x;
      const deltaY = event.clientY - lastPosition.current.y;
      lastPosition.current = { x: event.clientX, y: event.clientY };

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) hasMoved.current = true;

      // Minimap pixel delta → tile delta → world delta (top-down: col=x, row=y)
      const deltaCol = deltaX / SCALE;
      const deltaRow = deltaY / SCALE;
      const worldDeltaX = (deltaCol - deltaRow) * (TILE_W / 2);
      const worldDeltaY = (deltaCol + deltaRow) * (TILE_H / 2);

      const currentCamera = useStore.getState().camera;
      panCamera(-worldDeltaX * currentCamera.zoom, -worldDeltaY * currentCamera.zoom);
    };

    const onMouseUp = () => { isDragging.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [panCamera]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    hasMoved.current = false;
    lastPosition.current = { x: event.clientX, y: event.clientY };
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasMoved.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const col = (event.clientX - rect.left) / SCALE;
    const row = (event.clientY - rect.top) / SCALE;
    const { x: targetX, y: targetY } = gridToWorld(col, row);
    const currentCamera = useStore.getState().camera;

    panCamera(
      (currentCamera.x - targetX) * currentCamera.zoom,
      (currentCamera.y - targetY) * currentCamera.zoom,
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 36,
      left: 16,
      width: SIZE,
      height: SIZE,
      borderRadius: '50%',
      overflow: 'hidden',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.7)',
      background: '#0d1117',
    }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ cursor: 'crosshair', display: 'block' }}
      />
    </div>
  );
};
