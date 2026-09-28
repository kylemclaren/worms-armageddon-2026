import type React from 'react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { Orbit, BouncingDots, Wave, Comet } from 'loading-dev';
import {
  Toast, ToastContent, ToastDescription, ToastPortal, ToastProvider, ToastTitle, ToastViewport,
  toast, useToastManager,
} from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import wormFace from '@/assets/worm-face.png';

// shadcn Toast restyled as a HUD capsule: anchored top-centre under the round/timer bar,
// a status chip on the left (worm portrait for turns, loader while thinking), an optional
// team eyebrow, and a hairline timer along the bottom. Layout and stacking live in game.css.
type GameToastData = {
  accent?: string;
  loader?: 'orbit' | 'dots' | 'wave' | 'comet';
  kind?: 'turn';
  eyebrow?: string;
  tag?: string;
};
const LOADERS = { orbit: Orbit, dots: BouncingDots, wave: Wave, comet: Comet };
const TYPE_COLOR: Record<string, string> = {
  success: '#34d399', error: '#f87171', info: '#7cc4ff', warning: '#fbbf24', loading: 'var(--primary)',
};

function Chip({ type, data }: { type?: string; data?: GameToastData }) {
  if (data?.kind === 'turn') {
    return (
      <span className="toast-chip toast-chip-face">
        <img src={wormFace} alt="" draggable={false} />
      </span>
    );
  }
  if (type === 'loading') {
    const L = LOADERS[data?.loader ?? 'orbit'] ?? Orbit;
    return <span className="toast-chip"><L size={18} color={data?.accent || 'var(--primary)'} /></span>;
  }
  const Icon = type === 'success' ? Check : type === 'error' ? X : type === 'warning' ? TriangleAlert : type === 'info' ? Info : null;
  if (!Icon) return null;
  return <span className="toast-chip toast-chip-icon"><Icon strokeWidth={3} /></span>;
}

function GameToastList() {
  const { toasts } = useToastManager<GameToastData>();
  return toasts.map(t => {
    const d = t.data;
    const tone = d?.accent || (t.type && TYPE_COLOR[t.type]) || 'rgb(255 255 255 / .5)';
    const plain = !d?.kind && (!t.type || t.type === 'default');
    return (
      <Toast key={t.id} toast={t} swipeDirection="up" className="game-toast" data-testid={`toast-${t.id}`}
        data-type={t.type} data-kind={d?.kind} data-plain={plain ? '' : undefined}
        style={{ '--tone': tone, '--life': `${t.timeout ?? 0}ms` } as React.CSSProperties}>
        <ToastContent className="toast-pill">
          <Chip type={t.type} data={d} />
          <div className="flex min-w-0 flex-col justify-center">
            {d?.eyebrow && (
              <span className="toast-eyebrow">
                {d.eyebrow}{d.tag && <span className="toast-tag">{d.tag}</span>}
              </span>
            )}
            <ToastTitle className="toast-title" />
            <ToastDescription className="toast-desc" />
          </div>
          {t.type === 'loading'
            ? <span className="toast-timer toast-timer-busy" />
            : t.timeout ? <span key={t.updateKey} className="toast-timer" /> : null}
        </ToastContent>
      </Toast>
    );
  });
}

export function GameToaster() {
  return (
    <ToastProvider toastManager={toast} limit={3}>
      <ToastPortal>
        <ToastViewport className={cn('game-toast-viewport')}>
          <GameToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}
