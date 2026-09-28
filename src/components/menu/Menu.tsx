import { useEffect, useRef, useState } from 'react';
import { Copy, LogOut, Radio, Users, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import WakeSlider from '@/components/WakeSlider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useGame } from '@/hooks/useGame';
import { RollingNumber } from '@/components/common/RollingNumber';
import { useTilt, spark } from '@/components/common/effects';
import { cn } from '@/lib/utils';
import { MODES, TERRAINS, RULES, TEAM_COLORS, imageUrl } from '@/lib/game';
import * as ctl from '@/engine/controller.js';
import { setOptions, setPlayerName } from '@/engine/store.js';
import { toast } from '@/engine/toast.js';

const skyUrl = (t: string) => imageUrl(`bg_${t === 'random' ? 'grass' : t}_sky`);

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ backdrop
function MenuBackdrop({ terrain }: { terrain: string }) {
  const [layers, setLayers] = useState<[string, string]>([skyUrl(terrain), '']);
  const [front, setFront] = useState(0);
  useEffect(() => {
    const url = skyUrl(terrain);
    if (url === layers[front]) return;
    const next = front ^ 1;
    setLayers(l => { const c = [...l] as [string, string]; c[next] = url; return c; });
    setFront(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain]);
  const embers = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = embers.current!; const c = cv.getContext('2d')!;
    const pts = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, p: Math.random() * 6 }));
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
      if (cv.width !== Math.round(W * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      for (const e of pts) {
        e.y -= dt * 0.03 * e.s; e.p += dt * 1.5; e.x += Math.sin(e.p) * dt * 0.004;
        if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
        c.fillStyle = `rgba(255,${(190 + e.s * 30) | 0},120,${0.35 + 0.35 * Math.sin(e.p * 1.7)})`;
        c.beginPath(); c.arc(e.x * W, e.y * H, e.s * 1.6, 0, Math.PI * 2); c.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#0b1220]">
      {layers.map((u, i) => <div key={i} className={cn('menu-layer', i === front && 'on')} style={{ backgroundImage: u ? `url('${u}')` : undefined }} />)}
      <div className="menu-aurora" />
      <canvas ref={embers} className="absolute inset-0 size-full" />
    </div>
  );
}

// ------------------------------------------------------------------ cards
function PickCard({ selected, disabled, onClick, children, art, icon, testId }: {
  selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; art?: string; icon?: string; testId?: string;
}) {
  const tilt = useTilt<HTMLButtonElement>();
  return (
    <button
      type="button" data-testid={testId} disabled={disabled} onClick={onClick} {...tilt}
      className={cn(
        'group relative flex min-h-[66px] flex-col justify-end overflow-hidden rounded-xl p-3 text-left transition-[box-shadow,transform,opacity] duration-200 will-change-transform',
        'bg-card/80 ring-1 ring-white/10 backdrop-blur-md hover:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale',
        selected && 'card-selected ring-2 ring-primary shadow-[0_0_0_4px_oklch(0.84_0.16_84/0.18)]',
      )}
    >
      {art && <span className="absolute inset-0 bg-cover bg-[center_30%] saturate-[1.15]" style={{ backgroundImage: art }} />}
      {art && <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />}
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: 'radial-gradient(60% 60% at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.2), transparent 60%)' }} />
      {icon && <img src={icon} alt="" className="absolute right-2 top-2 size-10 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,.5)] transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" />}
      <span className="relative">{children}</span>
    </button>
  );
}

// ------------------------------------------------------------------ online
function OnlinePanel() {
  const online = useGame(s => s.online);
  const name = useGame(s => s.playerName);
  const invite = useGame(s => (s as { inviteCode?: string }).inviteCode || '');
  const [code, setCode] = useState(invite);
  useEffect(() => { if (invite) setCode(invite); }, [invite]);

  if (online) {
    const seats = [0, 1, 2, 3].map(i => online.players[i]);
    const link = ctl.inviteLink();
    return (
      <Card className="gap-0 py-0 ring-1 ring-primary/40">
        <CardContent className="grid items-center gap-4 p-4 md:grid-cols-[auto_1fr_auto]">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Room code</div>
            <div data-testid="room-code" className="font-num text-3xl tracking-[0.2em] text-primary">{online.code || '······'}</div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
              <Users className="size-3.5" /> Players {online.players.length}/4
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seats.map((p: { seat: number; name: string } | undefined, i: number) => p ? (
                <Badge key={i} variant="secondary" className="h-7 gap-1.5 rounded-full pl-1.5 pr-3 text-[13px]" data-testid="player-chip">
                  <span className="size-3 rounded-full" style={{ background: TEAM_COLORS[i] }} />
                  {p.name}{p.seat === online.seat && <span className="text-muted-foreground">(you)</span>}{p.seat === 0 && <span className="text-primary">host</span>}
                </Badge>
              ) : (
                <Badge key={i} variant="outline" className="h-7 gap-1.5 rounded-full pl-1.5 pr-3 text-[13px] text-muted-foreground">
                  <span className="size-3 rounded-full bg-white/15" /> waiting…
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {online.role === 'host' && (
              <Button size="lg" onClick={() => navigator.clipboard?.writeText(link).then(
                () => toast.success('Invite link copied', { description: link }),
                () => toast.info('Share this link', { description: link, duration: 8000 }))}>
                <Copy /> Copy invite link
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={() => ctl.leaveOnline()}><LogOut /> Leave</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid min-w-40 flex-1 gap-1.5">
        <Label htmlFor="mpName" className="text-xs text-muted-foreground">Your name</Label>
        <Input id="mpName" value={name} maxLength={18} placeholder="Player" autoComplete="nickname"
          onChange={e => setPlayerName(e.target.value)} className="h-10 bg-card/80 font-semibold backdrop-blur-md" />
      </div>
      <Button size="lg" className="h-10 px-4" onClick={() => ctl.hostOnline()} data-testid="host"><Radio /> Host a game</Button>
      <span className="pb-2.5 text-xs font-bold text-muted-foreground">or</span>
      <div className="grid gap-1.5">
        <Label htmlFor="mpCode" className="text-xs text-muted-foreground">Room code</Label>
        <Input id="mpCode" value={code} maxLength={6} placeholder="CODE" spellCheck={false}
          onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') ctl.joinOnline(code); }}
          className="h-10 w-32 bg-card/80 text-center font-num uppercase tracking-[0.25em] backdrop-blur-md" />
      </div>
      <Button size="lg" variant="outline" className="h-10 px-4" onClick={() => ctl.joinOnline(code)} data-testid="join">Join</Button>
    </div>
  );
}

// ------------------------------------------------------------------ rules
function RuleSlider({ rule, value, onChange, disabled }: { rule: (typeof RULES)[number]; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const idx = Math.max(0, rule.values.indexOf(value));
  const label = rule.fmt ? rule.fmt(value) : String(value);
  return (
    <div className="grid gap-2" data-testid={`rule-${rule.key}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-foreground/90">{rule.label}</span>
        <RollingNumber value={label} className="text-sm font-extrabold text-primary" />
      </div>
      <WakeSlider min={0} max={rule.values.length - 1} step={1} value={idx} onChange={i => onChange(rule.values[i])}
        bars={28} height={30} restHeight={8} gap={3} reach={5} fillColor="var(--primary)"
        trackColor="color-mix(in oklab, var(--foreground) 14%, transparent)" crestColor="#fff6d6"
        ariaLabel={rule.label} disabled={disabled} formatValue={i => (rule.fmt ? rule.fmt(rule.values[i]) : String(rule.values[i]))} />
    </div>
  );
}

function Segment({ label, value, items, onChange }: { label: string; value: string; items: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <span className="px-1 text-[11px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      <ToggleGroup type="single" value={value} onValueChange={v => v && onChange(v)} variant="outline"
        className="w-full rounded-full bg-card/80 p-1 backdrop-blur-md">
        {items.map(([v, t]) => (
          <ToggleGroupItem key={v} value={v} className="flex-1 rounded-full border-0 font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {t}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

// ------------------------------------------------------------------ menu
export function Menu() {
  const o = useGame(s => s.options);
  const jev = useGame(s => s.jevEnabled);
  const online = useGame(s => s.online);
  const guest = online?.role === 'guest';
  const startLabel = !online ? 'Let battle commence'
    : online.role === 'host' ? (online.players.length < 2 ? 'Waiting for players' : `Start online match · ${online.players.length} players`)
    : 'Waiting for host';
  const canStart = !online || (online.role === 'host' && online.players.length >= 2);

  return (
    <div className="fixed inset-0 overflow-y-auto">
      <MenuBackdrop terrain={o.terrain} />
      <div className="relative mx-auto flex min-h-full max-w-[980px] flex-col items-center gap-3 px-4 pb-6 pt-3">
        <img src={imageUrl('logo')} alt="Worms Armageddon" className="logo-float max-h-[min(170px,19vh)] w-auto" />

        <Section title="Play online" className="w-full"><OnlinePanel /></Section>

        {!online && (
          <Section title="Game mode" className="w-full">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {MODES.map(m => (
                <PickCard key={m.v} testId={`mode-${m.v}`} selected={o.teams === m.v} disabled={m.jev && !jev} onClick={() => setOptions({ teams: m.v })} icon={imageUrl(m.icon)}>
                  <span className="block text-sm font-extrabold">{m.title}</span>
                  <span className="block text-[11px] font-semibold text-muted-foreground">{m.jev && !jev ? 'Needs API key' : m.sub}</span>
                </PickCard>
              ))}
            </div>
          </Section>
        )}

        <fieldset disabled={guest} className={cn('w-full space-y-3', guest && 'pointer-events-none opacity-55 grayscale-[.3]')}>
          <Section title="Battlefield">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
              {TERRAINS.map(t => (
                <PickCard key={t.v} testId={`terrain-${t.v}`} selected={o.terrain === t.v} onClick={() => setOptions({ terrain: t.v })}
                  art={t.v === 'random' ? ['grass', 'mars', 'snow', 'desert'].map(k => `url('${skyUrl(k)}')`).join(',') : `url('${skyUrl(t.v)}')`}>
                  <span className="block min-h-6 text-sm font-extrabold drop-shadow">{t.title}</span>
                </PickCard>
              ))}
            </div>
          </Section>

          <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
            <Section title="Rules">
              <Card className="gap-0 py-0"><CardContent className="grid grid-cols-1 gap-x-6 gap-y-3.5 p-4 sm:grid-cols-2">
                {RULES.map(r => <RuleSlider key={r.key} rule={r} value={o[r.key]} onChange={v => setOptions({ [r.key]: v })} disabled={guest} />)}
              </CardContent></Card>
            </Section>
            <div className="grid content-start gap-4 md:pt-6">
              <Segment label="CPU skill" value={o.ai} onChange={v => setOptions({ ai: v })}
                items={[['beginner', 'Beginner'], ['pro', 'Pro'], ['expert', 'Expert']]} />
              <Segment label="Graphics" value={o.gfx} onChange={v => setOptions({ gfx: v })}
                items={[['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']]} />
            </div>
          </div>
        </fieldset>

        <Button data-testid="start" disabled={!canStart} onPointerDown={e => canStart && spark(e)} onClick={() => ctl.start()}
          className="relative mt-1 h-14 overflow-hidden rounded-2xl px-10 font-num text-lg tracking-wider shadow-[0_6px_0_#9c6200,0_14px_30px_rgba(0,0,0,.45)] active:translate-y-1 active:shadow-[0_2px_0_#9c6200]">
          <Swords className="size-5" /> {startLabel}
          {canStart && <span className="shine" />}
        </Button>
      </div>
    </div>
  );
}
