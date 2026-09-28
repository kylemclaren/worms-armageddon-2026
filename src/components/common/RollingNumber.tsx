/** Odometer-style value: each digit slides to its new position (after Rare UI's Animated Counter). */
export function RollingNumber({ value, className = '' }: { value: string | number; className?: string }) {
  const chars = [...String(value)];
  return (
    <span className={`inline-flex items-start leading-[1.2em] tabular-nums ${className}`} aria-label={String(value)}>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="rn-slot">
            <span className="rn-strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map(d => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : <span key={i} className="inline-block h-[1.2em]">{ch === ' ' ? '\u00a0' : ch}</span>,
      )}
    </span>
  );
}
