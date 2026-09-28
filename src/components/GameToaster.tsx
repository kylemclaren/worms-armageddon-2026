import type React from 'react';
import { CircleCheck, Info, OctagonX, TriangleAlert } from 'lucide-react';
import { Orbit, BouncingDots, Wave, Comet } from 'loading-dev';
import {
  Toast, ToastClose, ToastContent, ToastDescription, ToastPortal, ToastProvider, ToastTitle, ToastViewport,
  toast, useToastManager,
} from '@/components/ui/toast';

// shadcn Toast, anchored top-centre under the HUD bar (the stock viewport sits
// bottom-right, where the weapon dock lives). Stacking overrides are in game.css.
type GameToastData = { accent?: string; loader?: 'orbit' | 'dots' | 'wave' | 'comet' };
const LOADERS = { orbit: Orbit, dots: BouncingDots, wave: Wave, comet: Comet };

function Icon({ type, loader }: { type?: string; loader?: GameToastData['loader'] }) {
  if (type === 'loading') {
    const L = LOADERS[loader ?? 'orbit'] ?? Orbit;
    return <L size={16} color="var(--primary)" />;
  }
  if (type === 'success') return <CircleCheck className="text-emerald-400" />;
  if (type === 'info') return <Info className="text-sky-400" />;
  if (type === 'warning') return <TriangleAlert className="text-amber-400" />;
  if (type === 'error') return <OctagonX className="text-destructive" />;
  return null;
}

function GameToastList() {
  const { toasts } = useToastManager<GameToastData>();
  return toasts.map(t => (
    <Toast key={t.id} toast={t} swipeDirection="up" className="game-toast bg-popover/90 backdrop-blur-md"
      data-testid={`toast-${t.id}`} data-accent={t.data?.accent ? '' : undefined}
      style={t.data?.accent ? ({ '--toast-accent': t.data.accent } as React.CSSProperties) : undefined}>
      <ToastContent className="gap-2.5 px-3.5 py-2.5">
        {t.type && t.type !== 'default' && (
          <span className="grid size-4 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-4"><Icon type={t.type} loader={t.data?.loader} /></span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastTitle className="font-semibold leading-tight" />
          <ToastDescription className="text-xs leading-snug" />
        </div>
        <ToastClose className="size-6 opacity-60 hover:opacity-100" />
      </ToastContent>
    </Toast>
  ));
}

export function GameToaster() {
  return (
    <ToastProvider toastManager={toast} limit={4}>
      <ToastPortal>
        <ToastViewport className="game-toast-viewport">
          <GameToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}
