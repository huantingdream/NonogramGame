import { useEffect, useRef, useState } from 'react';
import { createGameRuntime } from '../runtime.js';
import { GAMES } from '../games/registry.js';
export function useGameRuntime() {
  const runtime = useRef(null);
  const [game, setGame] = useState(GAMES[0]);
  useEffect(() => {
    runtime.current = createGameRuntime(setGame);
    import('../core/glass-bg.js');
    const onHash = () => runtime.current.selectGame(location.hash.slice(1));
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); runtime.current.dispose(); };
  }, []);
  return { game, selectGame: id => runtime.current?.selectGame(id), getActiveGame: () => runtime.current?.getActiveGame() };
}
