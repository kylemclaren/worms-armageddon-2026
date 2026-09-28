import { TooltipProvider } from '@/components/ui/tooltip';
import { GameToaster } from '@/components/GameToaster';
import { useGame } from '@/hooks/useGame';
import { Menu } from '@/components/menu/Menu';
import { Hud } from '@/components/hud/Hud';
import { GameOverDialog, HelpDialog, LoadingScreen, PauseDialog, WeaponPanel } from '@/components/Dialogs';

export default function App() {
  const phase = useGame(s => s.phase);
  return (
    <TooltipProvider delayDuration={250}>
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'menu' && <Menu />}
      {phase === 'game' && <Hud />}
      <WeaponPanel />
      <HelpDialog />
      <PauseDialog />
      <GameOverDialog />
      <GameToaster />
    </TooltipProvider>
  );
}
