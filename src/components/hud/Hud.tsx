import { ArrowLeft, ArrowRight, ChevronsUp, CircleHelp, Crosshair, Pause, RotateCcw, SkipForward, Swords, Volume2, VolumeX, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGame } from '@/hooks/useGame';
import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/game';
import * as ctl from '@/engine/controller.js';

// ------------------------------------------------------------------ teams
function TeamsPanel() {
  const teams = useGame(s => s.teams);
  return (
    <div className="pointer-events-none fixed left-3 top-3 flex w-[min(240px,44vw)] flex-col gap-1.5" data-testid="teams">
      {teams.map(t => (
        <Card key={t.idx} className={cn('gap-1.5 rounded-xl px-3 py-2 transition-all duration-300',
          t.active && 'ring-2', t.out && 'opacity-35 grayscale')} style={t.active ? { boxShadow: `0 0 0 2px ${t.color}, 0 6px 20px rgba(0,0,0,.35)` } : undefined}>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {t.badge && <Badge variant={t.badge === 'YOU' ? 'default' : 'secondary'} className="h-4 rounded px-1 text-[9px] font-extrabold tracking-wider">{t.badge}</Badge>}
            <span className="truncate uppercase tracking-wide" style={{ color: t.color }}>{t.player ? `${t.player}` : t.name}</span>
            <span className="ml-auto font-num text-[11px] tabular-nums text-foreground/85">{t.hp}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/45">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, (t.hp / t.maxHp) * 100)}%`, background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
          </div>
          <div className="flex gap-1">
            {t.worms.map((w, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className={cn('pointer-events-auto size-2.5 rounded-[3px] bg-white/20 transition-all', w.alive && 'bg-[currentColor] shadow-[0_0_5px_currentColor]', w.cur && 'outline outline-2 outline-offset-1 outline-white')} style={{ color: t.color }} />
                </TooltipTrigger>
                <TooltipContent side="bottom">{w.name} · {w.alive ? `${w.hp} HP` : 'out'}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ top bar
function WindGauge({ wind }: { wind: number }) {
  const pct = Math.abs(wind) * 50;
  return (
    <Card className="flex-row items-center gap-2 rounded-xl px-3 py-2" data-testid="wind">
      <Wind className="size-3.5 text-muted-foreground" />
      <div className="relative h-2.5 w-28 overflow-hidden rounded-full bg-black/50">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-300 to-sky-500 transition-all duration-300"
          style={wind >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%`, background: 'linear-gradient(270deg,#7dd3fc,#0ea5e9)' }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
      </div>
      <span className="flex w-7 items-center justify-end gap-0.5 text-[11px] font-bold tabular-nums text-foreground/85">
        {wind > 0 ? <ArrowRight className="size-3" /> : wind < 0 ? <ArrowLeft className="size-3" /> : null}{Math.round(Math.abs(wind) * 10)}
      </span>
    </Card>
  );
}

function TurnClock({ timer, total, retreat, color }: { timer: number | null; total: number; retreat: boolean; color: string }) {
  const R = 22, C = 2 * Math.PI * R;
  const frac = timer == null || timer < 0 ? 1 : Math.min(1, timer / (retreat ? 5 : total));
  const low = !retreat && timer != null && timer >= 0 && timer <= 5;
  return (
    <div className={cn('relative grid size-[58px] place-items-center rounded-full bg-card/85 ring-1 ring-white/10 backdrop-blur-md', low && 'timer-low')} data-testid="timer">
      <svg viewBox="0 0 52 52" className="absolute inset-0 size-full -rotate-90">
        <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
        <circle cx="26" cy="26" r={R} fill="none" stroke={retreat ? '#fbbf24' : low ? '#f87171' : color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset .3s linear, stroke .3s' }} />
      </svg>
      <span className={cn('relative font-num text-lg leading-none tabular-nums', retreat ? 'text-amber-300' : low ? 'text-red-400' : 'text-foreground')}>
        {timer == null ? '·' : timer < 0 ? '∞' : timer}
      </span>
    </div>
  );
}

function TopBar() {
  const h = useGame(s => s.hud);
  if (!h) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 flex -translate-x-1/2 items-center gap-2.5">
      <WindGauge wind={h.wind} />
      <TurnClock timer={h.timer} total={h.turnTime} retreat={h.retreat} color={h.teamColor} />
      {h.suddenDeath
        ? <Badge variant="destructive" className="h-8 rounded-xl px-3 text-xs font-extrabold uppercase tracking-wider">Sudden death</Badge>
        : <Card className="rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wider">Round {h.round}</Card>}
    </div>
  );
}

// ------------------------------------------------------------------ weapon dock + power
function WeaponDock() {
  const h = useGame(s => s.hud);
  if (!h || !h.weaponId) return null;
  return (
    <div className="fixed bottom-3 right-3 flex flex-col items-end gap-2" data-testid="weapon-dock">
      {h.showFuse && h.myTurn && (
        <Card className="flex-row items-center gap-2 rounded-xl px-2.5 py-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Fuse</span>
          <ToggleGroup type="single" size="sm" value={String(h.fuse)} onValueChange={v => v && ctl.setFuse(+v)} className="gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <ToggleGroupItem key={n} value={String(n)} className="h-7 w-7 font-num text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{n}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Card>
      )}
      <button type="button" onClick={() => ctl.togglePanel()} disabled={!h.myTurn}
        className="group flex items-center gap-3 rounded-2xl bg-card/85 py-2 pl-2 pr-4 text-left ring-1 ring-white/10 backdrop-blur-md transition hover:ring-primary/60 disabled:cursor-default">
        <img src={imageUrl(h.weaponIcon)} alt="" className="size-12 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,.6)] transition-transform group-hover:scale-110" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-extrabold uppercase tracking-wide">{h.weaponName}</span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-num text-[10px]">{h.ammo < 0 ? '∞' : `× ${h.ammo}`}</Badge>
            {h.myTurn && <span className="text-[10px] text-muted-foreground"><Kbd>Tab</Kbd> change</span>}
          </span>
        </span>
      </button>
    </div>
  );
}

function PowerMeter() {
  const h = useGame(s => s.hud);
  if (!h?.charging) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 w-[min(320px,70vw)] -translate-x-1/2" data-testid="power">
      <div className="h-3.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-red-500 shadow-[0_0_14px_rgba(255,180,60,.75)]" style={{ width: `${h.power * 100}%` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ action bar
function Action({ label, keys, onClick, children, testId, disabled }: { label: string; keys?: string; onClick: () => void; children: React.ReactNode; testId?: string; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="icon" onClick={onClick} data-testid={testId} disabled={disabled} aria-label={label}
          className="size-11 rounded-xl bg-card/85 ring-1 ring-white/10 backdrop-blur-md [&_svg]:size-5">{children}</Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">{label}{keys && <Kbd>{keys}</Kbd>}</TooltipContent>
    </Tooltip>
  );
}

function ActionBar() {
  const muted = useGame(s => s.muted);
  const myTurn = useGame(s => !!s.hud?.myTurn);
  return (
    <div className="fixed bottom-3 left-3 flex gap-2">
      <Action label="Weapons" keys="Tab" onClick={() => ctl.togglePanel()} testId="btn-weapons" disabled={!myTurn}><Swords /></Action>
      <Action label="Skip go" onClick={() => ctl.skipTurn()} testId="btn-skip" disabled={!myTurn}><SkipForward /></Action>
      <Action label={muted ? 'Unmute' : 'Mute'} keys="M" onClick={() => ctl.toggleMute()}>{muted ? <VolumeX /> : <Volume2 />}</Action>
      <Action label="Controls" keys="H" onClick={() => ctl.setHelp(true)}><CircleHelp /></Action>
      <Action label="Pause" keys="Esc" onClick={() => ctl.setPaused(true)} testId="btn-pause"><Pause /></Action>
    </div>
  );
}

// ------------------------------------------------------------------ announcements + touch
function BigMessage() {
  const big = useGame(s => s.big);
  if (!big) return null;
  return (
    <div key={big.key} className="big-pop pointer-events-none fixed inset-x-0 top-[34%] whitespace-pre-line text-center font-game text-[clamp(40px,7vw,68px)] leading-[1.02] tracking-wide text-primary text-stroke drop-shadow-[0_7px_0_rgba(0,0,0,.45)]">
      {big.text}
    </div>
  );
}

function TouchPad() {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (!coarse) return null;
  const btn = (k: string, child: React.ReactNode, cls = '') => (
    <Button key={k} variant="secondary" className={cn('size-14 touch-none rounded-full bg-card/70 backdrop-blur [&_svg]:size-6', cls)}
      onPointerDown={e => { e.preventDefault(); ctl.pad(k, true); }} onPointerUp={() => ctl.pad(k, false)} onPointerCancel={() => ctl.pad(k, false)} onPointerLeave={() => ctl.pad(k, false)}>
      {child}
    </Button>
  );
  return (
    <div className="fixed inset-x-3 bottom-20 flex justify-between">
      <div className="grid grid-cols-2 gap-2">{btn('left', <ArrowLeft />)}{btn('right', <ArrowRight />)}{btn('jump', <ChevronsUp />)}{btn('backflip', <RotateCcw />)}</div>
      <div className="grid grid-cols-2 items-end gap-2">{btn('up', <ChevronsUp />)}{btn('down', <ChevronsUp className="rotate-180" />)}
        {btn('fire', <Crosshair />, 'col-span-2 size-20 bg-red-600/80 hover:bg-red-600')}</div>
    </div>
  );
}

export function Hud() {
  return (
    <>
      <TeamsPanel />
      <TopBar />
      <WeaponDock />
      <PowerMeter />
      <ActionBar />
      <BigMessage />
      <TouchPad />
    </>
  );
}
