import { useEffect, useMemo, useState } from 'react';
import { Home, Play, Search, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGame } from '@/hooks/useGame';
import { cn } from '@/lib/utils';
import { WEAPON_GROUPS, WEAPON_BY_ID, WEAPON_LIST, imageUrl } from '@/lib/game';
import * as ctl from '@/engine/controller.js';

// ------------------------------------------------------------------ weapons
export function WeaponPanel() {
  const open = useGame(s => s.panelOpen);
  const h = useGame(s => s.hud);
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const ammo = useMemo(() => {
    const parts = (h?.ammoSig || '').split(',');
    return Object.fromEntries(WEAPON_LIST.map((w, i) => [w.id, parts[i] === 'i' ? Infinity : Number(parts[i] || 0)]));
  }, [h?.ammoSig]);
  const match = (id: string) => !q || WEAPON_BY_ID[id].name.toLowerCase().includes(q.toLowerCase());
  let n = 0;
  return (
    <Dialog open={open} onOpenChange={o => !o && ctl.closePanel()}>
      <DialogContent className="max-w-[min(760px,calc(100vw-24px))] gap-3 sm:max-w-[760px]" data-testid="weapon-panel">
        <DialogHeader>
          <DialogTitle className="font-num tracking-wide">Arsenal</DialogTitle>
          <DialogDescription>Pick a weapon. Greyed out ones need a crate first.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus placeholder="Search weapons" value={q} onChange={e => setQ(e.target.value)} className="pl-8"
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              const first = WEAPON_GROUPS.flatMap(g => g.ids).find(id => match(id) && ammo[id] > 0);
              if (first) ctl.selectWeapon(first);
            }} />
        </div>
        <div className="-mx-1.5 grid max-h-[60vh] gap-3 overflow-y-auto px-1.5 pb-1.5 pt-1">
          {WEAPON_GROUPS.map(g => {
            const ids = g.ids.filter(match);
            if (!ids.length) return null;
            return (
              <div key={g.name}>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{g.name}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {ids.map(id => {
                    const w = WEAPON_BY_ID[id], a = ammo[id], empty = !(a > 0), sel = h?.weaponId === id;
                    const key = ++n;
                    return (
                      <Tooltip key={id}>
                        <TooltipTrigger asChild>
                          <button type="button" disabled={empty} data-testid={`weapon-${id}`} onClick={() => ctl.selectWeapon(id)}
                            className={cn('relative grid aspect-square place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 transition',
                              'hover:-translate-y-0.5 hover:bg-primary/15 hover:ring-primary disabled:cursor-not-allowed disabled:opacity-25 disabled:grayscale disabled:hover:translate-y-0',
                              sel && 'bg-primary/20 ring-2 ring-primary')}>
                            <img src={imageUrl(w.icon)} alt={w.name} className="size-[62%] object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,.6)]" />
                            {a !== Infinity && a > 0 && <Badge className="absolute bottom-1 right-1 h-4 min-w-4 rounded px-1 font-num text-[9px]">{a}</Badge>}
                            {key <= 9 && <span className="absolute left-1.5 top-1 text-[9px] font-bold text-muted-foreground">{key}</span>}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{w.name}{a === Infinity ? ' · unlimited' : empty ? ' · none left' : ` · ${a} left`}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ help
const CONTROLS: [string, string[][]][] = [
  ['Move', [['Walk', ['←', '→']], ['Jump', ['Enter']], ['Backflip', ['Enter', 'Enter']]]],
  ['Aim & fire', [['Aim', ['↑', '↓']], ['Fine aim', ['Shift']], ['Charge & fire', ['Space']], ['Grenade fuse', ['1', '5']], ['Pick a target', ['Click']]]],
  ['Rope & jet pack', [['Fire / release rope', ['Space']], ['Climb', ['↑', '↓']], ['Swing / steer', ['←', '→']]]],
  ['Weapons', [['Arsenal', ['Tab']], ['Previous / next', ['Q', 'E']], ['Rotate girder', ['↑', '↓']]]],
  ['Camera', [['Pan', ['Right-drag']], ['Zoom', ['Wheel']], ['Centre on worm', ['C']]]],
  ['Game', [['Pause', ['Esc']], ['Mute', ['M']], ['This help', ['H']]]],
];

export function HelpDialog() {
  const open = useGame(s => s.helpOpen);
  return (
    <Dialog open={open} onOpenChange={o => ctl.setHelp(o)}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="font-num tracking-wide">Controls</DialogTitle>
          <DialogDescription>Mouse aiming works too: point to aim, hold the left button to charge.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {CONTROLS.map(([title, rows]) => (
            <div key={title}>
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{title}</div>
              {rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between py-0.5 text-sm">
                  <span className="text-foreground/85">{label}</span>
                  <KbdGroup>{keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</KbdGroup>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground">Get hurt on your own turn and it ends. Water is instant death. Sudden death drops everyone to 1 HP and the sea starts rising.</p>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ pause
export function PauseDialog() {
  const open = useGame(s => s.paused);
  const muted = useGame(s => s.muted);
  const online = useGame(s => !!s.online);
  return (
    <Dialog open={open} onOpenChange={o => ctl.setPaused(o)}>
      <DialogContent className="sm:max-w-[380px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-num text-2xl tracking-wide">Paused</DialogTitle>
          <DialogDescription>{online ? 'Online matches keep running for the other players.' : 'Take a breather.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button size="lg" className="h-11" onClick={() => ctl.setPaused(false)} data-testid="resume"><Play /> Resume</Button>
          <Button size="lg" variant="secondary" className="h-11" onClick={() => ctl.toggleMute()}>{muted ? <VolumeX /> : <Volume2 />} {muted ? 'Unmute' : 'Mute sound'}</Button>
          <Button size="lg" variant="outline" className="h-11" onClick={() => ctl.backToMenu()} data-testid="quit"><Home /> Quit to menu</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ game over
export function GameOverDialog() {
  const over = useGame(s => s.over);
  return (
    <Dialog open={!!over} onOpenChange={o => !o && ctl.backToMenu()}>
      <DialogContent className="sm:max-w-[560px]" showCloseButton={false} data-testid="game-over">
        {over && (
          <>
            <DialogHeader className="items-center text-center">
              <Trophy className="size-9" style={{ color: over.winnerColor || 'var(--muted-foreground)' }} />
              <DialogTitle className="font-game text-5xl tracking-wide text-primary text-stroke">{over.title}</DialogTitle>
              <DialogDescription className="text-base font-semibold text-foreground">{over.subtitle}</DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Team</TableHead><TableHead className="text-right">Alive</TableHead><TableHead className="text-right">Kills</TableHead><TableHead className="text-right">Damage</TableHead></TableRow></TableHeader>
              <TableBody>
                {over.rows.map((r, i) => (
                  <TableRow key={i} className={cn(r.winner && 'bg-primary/10')}>
                    <TableCell className="font-bold" style={{ color: r.color }}>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.alive}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.kills}</TableCell>
                    <TableCell className="text-right font-num tabular-nums">{r.dmg}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {over.mvp && <p className="text-center text-sm text-muted-foreground">Most violent worm: <span className="font-bold" style={{ color: over.mvp.color }}>{over.mvp.name}</span> ({over.mvp.dmg} damage)</p>}
            <DialogFooter className="sm:justify-center">
              <Button size="lg" className="h-11 px-8 font-num tracking-wide" onClick={() => ctl.backToMenu()} data-testid="play-again">Play again</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ loading
export function LoadingScreen() {
  const load = useGame(s => s.load);
  const text = useGame(s => s.loadText);
  return (
    <div className="fixed inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_50%_34%,#2b4d73_0%,#14243a_52%,#080d16_100%)]">
      <div className="grid w-[min(320px,80vw)] gap-3 text-center">
        <div className="font-game text-5xl tracking-wide text-primary text-stroke">WORMS</div>
        <Progress value={Math.round(load * 100)} className="h-2.5" />
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground" data-testid="loading">{text}</div>
      </div>
    </div>
  );
}
