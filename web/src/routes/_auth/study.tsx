import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ApiError, uuidv7 } from '@/api/client'
import { decksQuery, qk, settingsQuery, summaryQuery } from '@/api/queries'
import type { CardDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, EmptyState, GlassCard, GlassProgress, Pill, RingProgress, Spinner, StatTile } from '@/components/ui/glass'
import { CardFace, CardShell } from '@/features/study/CardFaces'
import { SWIPE_THRESHOLD, intervalAfter, intervalLabel, nextLevel, swipeDecision } from '@/features/study/srs'
import { ago, duration } from '@/lib/format'
import { localDueAt } from '@/offline/localSrs'
import { enqueueAnswer, loadStudyQueue, useSyncState } from '@/offline/sync'
import type { FlipStyle } from '@/theme/theme'

export const Route = createFileRoute('/_auth/study')({
  validateSearch: (s: Record<string, unknown>): { deck_uid?: string } => ({ deck_uid: typeof s.deck_uid === 'string' ? s.deck_uid : undefined }),
  component: StudyRoute,
})

function StudyRoute() {
  const { deck_uid } = Route.useSearch()
  const { me } = Route.useRouteContext()
  const navigate = useNavigate()
  // Loaded once per session: online it downloads (and keeps) the queue, offline it uses the kept copy.
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['study-session', me.uid, deck_uid ?? 'all'],
    queryFn: () => loadStudyQueue(me.uid, deck_uid),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const noData = error instanceof ApiError && error.code === 'offline_no_data'
  return (
    <AppShell>
      {isPending ? (
        <div className="flex min-h-dvh items-center justify-center"><Spinner size={24} /></div>
      ) : error ? (
        <>
          <TopBar leading={<TopBarIcon name="close" label="Kapat" onClick={() => navigate({ to: '/' })} />} />
          <div className="px-[18px] pt-16">
            <EmptyState
              icon={noData ? 'wifiOff' : 'refresh'}
              title={noData ? 'Çevrimdışısın' : 'Kartlar yüklenemedi'}
              action={<Button variant="primary" onClick={() => refetch()}>Tekrar dene</Button>}
            >
              {noData ? 'Bu cihazda çalışmak için indirilmiş kart yok. İnternete bağlanınca kartlar otomatik indirilir.' : error.message}
            </EmptyState>
          </div>
        </>
      ) : (
        <StudySession key={deck_uid ?? 'all'} initial={data.cards} offline={data.offline} fetchedAt={data.fetchedAt} />
      )}
    </AppShell>
  )
}

interface QueueItem {
  card: CardDTO
  key: string
}

function StudySession({ initial, offline, fetchedAt }: { initial: CardDTO[]; offline: boolean; fetchedAt: number }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: settings } = useQuery(settingsQuery)
  const { data: decks = [] } = useQuery(decksQuery)
  const deckNames = useMemo(() => new Map(decks.map((d) => [d.uid, d.name])), [decks])
  const intervals = settings?.srs_intervals ?? [0, 1, 2, 3, 7, 30, 60, 90, 180, 360]
  const flipStyle = (settings?.flip_style ?? 'flip') as FlipStyle
  const timezone = settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const dayStartHour = settings?.day_starts_at_hour ?? 4
  const sync = useSyncState()

  const [queue, setQueue] = useState<QueueItem[]>(() => initial.map((c) => ({ card: c, key: c.uid })))
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [drag, setDrag] = useState({ x: 0, dragging: false })
  const [exiting, setExiting] = useState<'right' | 'left' | null>(null)
  const [stats, setStats] = useState({ ok: 0, no: 0 })
  const sessionStart = useRef(Date.now())
  const cardStart = useRef(Date.now())
  const startX = useRef(0)

  const item = queue[idx]
  const done = idx >= queue.length
  const answered = stats.ok + stats.no

  useEffect(() => {
    cardStart.current = Date.now()
  }, [idx])

  const finish = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.decks })
    void qc.invalidateQueries({ queryKey: qk.stats })
    void qc.invalidateQueries({ queryKey: ['cards'] })
    void navigate({ to: '/' })
  }, [qc, navigate])

  const rate = useCallback(
    (correct: boolean) => {
      if (!item || exiting) return
      navigator.vibrate?.(correct ? 8 : [6, 40, 6])
      const card = item.card
      setStats((s) => (correct ? { ...s, ok: s.ok + 1 } : { ...s, no: s.no + 1 }))
      setExiting(correct ? 'right' : 'left')
      // Scheduled on the device so the session works offline; the outbox sends it (now or later)
      // and the server's answer replaces this estimate.
      const now = Date.now()
      const level = nextLevel(card.level, correct, intervals)
      const due = localDueAt(now, level, intervals, timezone, dayStartHour)
      void enqueueAnswer({
        uid: uuidv7(), card_uid: card.uid, correct, client_ts: now, duration_ms: now - cardStart.current,
        level_after: level, due_at: due,
      })
      // Interval 0 → the card comes back later in this same session.
      if ((intervals[level] ?? 0) === 0) {
        setQueue((q) => [...q, { card: { ...card, level, due_at: due }, key: `${card.uid}:${q.length}` }])
      }
      window.setTimeout(() => {
        setIdx((i) => i + 1)
        setRevealed(false)
        setDrag({ x: 0, dragging: false })
        setExiting(null)
      }, 280)
    },
    [item, exiting, intervals, timezone, dayStartHour],
  )

  // Keyboard: space/enter reveals, → correct, ← wrong.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (done) return
      if ((e.key === ' ' || e.key === 'Enter') && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && (e.key === 'ArrowRight' || e.key === '2')) rate(true)
      else if (revealed && (e.key === 'ArrowLeft' || e.key === '1')) rate(false)
      else if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [revealed, rate, done, finish])

  if (initial.length === 0) {
    return (
      <>
        <TopBar leading={<TopBarIcon name="close" label="Kapat" onClick={() => navigate({ to: '/' })} />} />
        <div className="na-enter px-[18px] pt-10">
          <EmptyState icon="check" title="Bugünlük hepsi bu" action={<Link to="/decks"><Button variant="primary">Destelere git</Button></Link>}>
            Şu an tekrar edilecek kart yok. Yeni kartlar ekleyebilir veya yarın tekrar gelebilirsin.
          </EmptyState>
        </div>
      </>
    )
  }

  if (done) {
    return <StudyDone stats={stats} elapsed={Date.now() - sessionStart.current} onExit={finish} />
  }
  if (!item) {
    return <div className="flex min-h-dvh items-center justify-center"><Spinner size={24} /></div>
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!revealed || exiting) return
    startX.current = e.clientX
    setDrag({ x: 0, dragging: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.dragging) setDrag({ x: e.clientX - startX.current, dragging: true })
  }
  const onPointerUp = () => {
    if (!drag.dragging) return
    const d = swipeDecision(drag.x)
    if (d) rate(d === 'correct')
    else setDrag({ x: 0, dragging: false })
  }

  const total = queue.length
  const exitX = exiting === 'right' ? 520 : exiting === 'left' ? -520 : 0
  const transform = exiting
    ? `translate(${exitX}px, 0) rotate(${exiting === 'right' ? 18 : -18}deg)`
    : `translate(${drag.dragging ? drag.x : 0}px, 0) rotate(${drag.dragging ? drag.x * 0.04 : 0}deg)`
  const hint = (dir: 1 | -1) => Math.min(1, Math.max(0, (dir * drag.x) / (SWIPE_THRESHOLD + 10)))

  return (
    <div className="relative flex flex-col px-3.5" style={{ height: '100dvh', paddingTop: 'calc(max(var(--sat), 10px) + 8px)', paddingBottom: 'max(var(--sab), 14px)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-1 pt-1 pb-3">
        <TopBarIcon name="close" label="Oturumu bitir" onClick={() => (answered > 0 ? setIdx(queue.length) : finish())} />
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span className="na-mono text-xs font-semibold text-na-text-2">{Math.min(idx + 1, total)} / {total}</span>
              {offline || !sync.online ? (
                <span title={`Kartlar ${ago(fetchedAt)} indirildi`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-na-warn">
                  <Icon name="wifiOff" size={11} /> çevrimdışı
                </span>
              ) : null}
            </span>
            <div className="flex items-center gap-2 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1 text-na-accent"><Icon name="check" size={12} strokeWidth={2.5} /><span className="na-mono">{stats.ok}</span></span>
              <span className="inline-flex items-center gap-1 text-na-danger"><Icon name="close" size={12} strokeWidth={2.5} /><span className="na-mono">{stats.no}</span></span>
            </div>
          </div>
          <GlassProgress value={idx} max={total} height={4} label="Oturum ilerlemesi" />
        </div>
      </div>

      {/* Swipe hints */}
      <SwipeHint side="left" opacity={hint(-1)} />
      <SwipeHint side="right" opacity={hint(1)} />

      {/* Card stack */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-1 pt-1 pb-2">
        {idx + 1 < total ? (
          <CardShell style={{ position: 'absolute', inset: '12px 16px', height: 'auto', opacity: 0.35, transform: 'scale(0.94) translateY(14px)' }} />
        ) : null}
        <div
          key={item.key}
          role="button"
          tabIndex={0}
          aria-label={revealed ? 'Kart cevabı. Sağa kaydır: doğru, sola: yanlış' : 'Kartı çevirmek için dokun'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => !revealed && setRevealed(true)}
          className="absolute inset-0 z-10 outline-none"
          style={{ transform, transition: drag.dragging ? 'none' : 'transform 280ms cubic-bezier(.2,.7,.3,1)', touchAction: revealed ? 'none' : 'manipulation', cursor: revealed ? 'grab' : 'pointer' }}
        >
          <CardFace card={item.card} deckName={deckNames.get(item.card.deck_uid)} revealed={revealed} flipStyle={flipStyle} />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col gap-2.5 px-1 pt-1">
        {!revealed ? (
          <>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-na-text-3">
              <Icon name="swipe" size={14} /> Cevabı görmek için karta dokun
            </div>
            <Button className="w-full" style={{ height: 54 }} onClick={() => setRevealed(true)}>Cevabı göster</Button>
          </>
        ) : (
          <>
            <div className="mb-0.5 flex items-center justify-between px-1">
              <SrsTicker level={item.card.level} intervals={intervals} />
              <span className="inline-flex items-center gap-1 text-[10px] text-na-text-4"><Icon name="swipe" size={12} /> kaydır veya buton</span>
            </div>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => rate(false)} className="na-btn na-btn--danger flex-1 flex-col gap-px" style={{ height: 60, fontSize: 16 }}>
                <span className="inline-flex items-center gap-2"><Icon name="close" size={18} strokeWidth={2.5} /> Yanlış</span>
                <span className="na-mono text-[10px] font-medium opacity-70">{intervalLabel(intervalAfter(item.card.level, false, intervals))}</span>
              </button>
              <button type="button" onClick={() => rate(true)} className="na-btn na-btn--primary flex-1 flex-col gap-px" style={{ height: 60, fontSize: 16 }}>
                <span className="inline-flex items-center gap-2"><Icon name="check" size={18} strokeWidth={2.5} /> Doğru</span>
                <span className="na-mono text-[10px] font-medium opacity-70">+{intervalLabel(intervalAfter(item.card.level, true, intervals))}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SwipeHint({ side, opacity }: { side: 'left' | 'right'; opacity: number }) {
  const ok = side === 'right'
  const c = ok ? 'var(--na-accent)' : 'var(--na-danger)'
  return (
    <div className="pointer-events-none absolute top-1/2 z-20 -translate-y-1/2" style={{ [side]: 14, opacity }}>
      <div
        className="na-glass flex items-center gap-2 px-3.5 py-3 text-sm font-bold"
        style={{ borderRadius: 16, color: c, background: `color-mix(in oklab, ${c} 16%, transparent)`, borderColor: `color-mix(in oklab, ${c} 40%, transparent)`, boxShadow: `0 0 22px color-mix(in oklab, ${c} 35%, transparent)` }}
      >
        <Icon name={ok ? 'check' : 'close'} size={18} strokeWidth={2.5} />
        {ok ? 'DOĞRU' : 'YANLIŞ'}
      </div>
    </div>
  )
}

function SrsTicker({ level, intervals }: { level: number; intervals: number[] }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.05em] text-na-text-3 uppercase">SRS</span>
      <div className="inline-flex gap-0.5">
        {intervals.map((_, i) => (
          <span key={i} className="h-[5px] w-[5px] rounded-full" style={{ background: i < level ? 'var(--na-accent)' : 'var(--na-track)', boxShadow: i < level ? '0 0 5px var(--na-accent)' : 'none' }} />
        ))}
      </div>
      <span className="na-mono text-[10px] text-na-text-3">seviye {level}</span>
    </div>
  )
}

function StudyDone({ stats, elapsed, onExit }: { stats: { ok: number; no: number }; elapsed: number; onExit: () => void }) {
  const total = stats.ok + stats.no
  const sync = useSyncState()
  const ratio = total ? stats.ok / total : 0
  const { data: sum } = useQuery({ ...summaryQuery, staleTime: 0 })
  const goalPct = sum ? Math.min(100, Math.round((sum.reviewed_today / Math.max(1, sum.daily_goal)) * 100)) : null
  return (
    <div className="na-enter relative z-[1] px-[18px]">
      <TopBar leading={<TopBarIcon name="close" label="Kapat" onClick={onExit} />} />
      <div className="mt-6 text-center">
        <div className="flex justify-center">
          <RingProgress size={150} value={ratio} stroke={11}>
            <div className="text-center">
              <div className="na-mono text-[38px] font-semibold tracking-[-0.025em]">{Math.round(ratio * 100)}%</div>
              <div className="mt-0.5 text-[10px] tracking-[0.06em] text-na-text-3 uppercase">hatırlama</div>
            </div>
          </RingProgress>
        </div>
        <div className="na-display mt-[22px] text-[28px] tracking-[-0.03em]">Oturum bitti</div>
        <div className="mt-1.5 text-[13px] text-na-text-3">{total} cevap · seri devam ediyor 🔥</div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2.5">
        <StatTile label="Doğru" value={stats.ok} icon="check" accent="#34D399" />
        <StatTile label="Yanlış" value={stats.no} icon="close" accent="#FB7185" />
        <StatTile label="Süre" value={duration(elapsed)} icon="clock" accent="#A78BFA" />
      </div>
      {goalPct !== null ? (
        <GlassCard className="mt-4 px-4 py-3.5" radius={18}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(252,211,77,0.18)', color: '#FCD34D', border: '0.5px solid rgba(252,211,77,0.35)' }}>
              <Icon name="target" size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Bugünkü hedefin %{goalPct}'i tamam</div>
              <div className="mt-0.5 text-[11px] text-na-text-3">{sum!.reviewed_today} / {sum!.daily_goal} tekrar</div>
            </div>
            {goalPct >= 100 ? <Pill tone="accent">Hedef ✓</Pill> : null}
          </div>
        </GlassCard>
      ) : null}
      {sync.pending > 0 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-na-text-3">
          <Icon name={sync.online ? 'refresh' : 'wifiOff'} size={13} />
          {sync.online ? `${sync.pending} cevap gönderiliyor…` : `${sync.pending} cevap bu cihazda saklandı, bağlantı gelince gönderilecek.`}
        </div>
      ) : null}
      <Button variant="primary" size="lg" className="mt-[18px] w-full" onClick={onExit}>Bitir</Button>
    </div>
  )
}
