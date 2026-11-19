// Study card visuals ported from the design (project/screens/study.jsx).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CardDTO, CardFields } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { Pill, Waveform } from '@/components/ui/glass'
import { CARD_TYPES, tint, type CardType } from '@/components/ui/categories'
import type { FlipStyle } from '@/theme/theme'
import { canSpeak, speak, speechLang } from './speech'

export const mediaURL = (uid: string) => `/api/v1/media/${uid}`

export function CardShell({ children, style, glow }: { children?: ReactNode; style?: CSSProperties; glow?: boolean }) {
  return (
    <div
      className="na-glass na-glass--strong relative h-full overflow-hidden"
      style={{
        borderRadius: 28,
        // backdrop-filter does not apply inside the 3D flip (preserve-3d), so the card carries its own tinted base.
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--na-glass-strong) 100%, transparent), transparent), color-mix(in oklab, var(--na-bg-1) 88%, transparent)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.16) inset, 0 24px 60px rgba(0,0,0,0.45)',
        ...style,
      }}
    >
      {glow ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 50% at 50% 0%, ${tint('var(--na-accent)', 20)}, transparent 70%)`, opacity: 0.5 }} />
      ) : null}
      {children}
    </div>
  )
}

export function CardFace({ card, deckName, revealed, flipStyle }: { card: CardDTO; deckName?: string; revealed: boolean; flipStyle: FlipStyle }) {
  const front = <CardShell><CardFront card={card} deckName={deckName} /></CardShell>
  const back = <CardShell glow><CardBack card={card} deckName={deckName} /></CardShell>
  const ease = 'cubic-bezier(.2,.7,.3,1)'

  if (flipStyle === 'fade') {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0" style={{ opacity: revealed ? 0 : 1, transition: 'opacity 320ms', pointerEvents: revealed ? 'none' : 'auto' }}>{front}</div>
        <div className="absolute inset-0" style={{ opacity: revealed ? 1 : 0, transition: 'opacity 320ms', pointerEvents: revealed ? 'auto' : 'none' }}>{back}</div>
      </div>
    )
  }
  if (flipStyle === 'slide') {
    return (
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: 28 }}>
        <div className="absolute inset-0" style={{ transform: revealed ? 'translateY(-100%)' : 'none', transition: `transform 480ms ${ease}` }}>{front}</div>
        <div className="absolute inset-0" style={{ transform: revealed ? 'none' : 'translateY(100%)', transition: `transform 480ms ${ease}` }}>{back}</div>
      </div>
    )
  }
  const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }
  return (
    <div className="h-full w-full" style={{ perspective: 1600 }}>
      <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d', transition: `transform 600ms ${ease}`, transform: revealed ? 'rotateY(180deg)' : 'none' }}>
        <div style={{ ...face, pointerEvents: revealed ? 'none' : 'auto' }}>{front}</div>
        <div style={{ ...face, transform: 'rotateY(180deg)', pointerEvents: revealed ? 'auto' : 'none' }}>{back}</div>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const t = CARD_TYPES[type as CardType] ?? CARD_TYPES.word
  return <Pill color={t.color} icon={t.icon}>{t.label}</Pill>
}

function Header({ card, deckName }: { card: CardDTO; deckName?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <TypeBadge type={card.type} />
      {deckName ? <span className="truncate text-[11px] font-semibold tracking-[0.03em] text-na-text-3">{deckName}</span> : null}
    </div>
  )
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

function CardFront({ card, deckName }: { card: CardDTO; deckName?: string }) {
  const f = card.fields
  return (
    <div className="relative flex h-full flex-col px-[22px] py-5">
      <Header card={card} deckName={deckName} />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {card.type === 'word' && (
          <div className="px-2 text-center">
            {f.lang ? <div className="mb-3.5 text-[11px] tracking-[0.08em] text-na-text-3 uppercase">{f.lang}</div> : null}
            <div className="na-display text-[clamp(30px,10vw,44px)] leading-[1.05] tracking-[-0.03em] break-words">{card.front}</div>
            {f.ipa || f.pos ? <div className="na-mono mt-2.5 text-xs text-na-text-3">{[f.ipa, f.pos].filter(Boolean).join(' · ')}</div> : null}
            {canSpeak ? (
              <button
                type="button"
                onPointerDown={stop}
                onClick={(e) => {
                  e.stopPropagation()
                  speak(card.front, speechLang(f.lang))
                }}
                className="na-glass mt-[22px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-na-text-2"
                style={{ borderRadius: 999 }}
              >
                <Icon name="speaker" size={14} /> Telaffuzu duy
              </button>
            ) : null}
          </div>
        )}
        {card.type === 'audio' && <AudioFront card={card} />}
        {card.type === 'image' && <ImageFront card={card} />}
        {card.type === 'quran' && <QuranFront fields={f} />}
      </div>
      <div className="text-center text-[11px] text-na-text-4">Cevap için karta dokun</div>
    </div>
  )
}

function CardBack({ card, deckName }: { card: CardDTO; deckName?: string }) {
  const f = card.fields
  return (
    <div className="relative flex h-full flex-col px-[22px] py-5">
      <Header card={card} deckName={deckName} />
      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        {card.type === 'word' && (
          <div className="text-center">
            <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-na-accent uppercase">Anlam</div>
            <div className="na-display text-[clamp(24px,8vw,32px)] leading-[1.2] tracking-[-0.025em]">{card.back}</div>
            {f.example ? (
              <div className="na-glass mx-auto mt-[22px] max-w-[280px] px-3.5 py-3 text-left text-[13px] leading-normal text-na-text-2" style={{ borderRadius: 14 }}>
                <span className="text-na-text-3">ör.</span> {f.example}
                {f.example_tr ? <div className="mt-1.5 text-xs text-na-text-3">{f.example_tr}</div> : null}
              </div>
            ) : null}
            {f.synonyms ? (
              <div className="mx-auto mt-3 max-w-[280px] text-xs text-na-text-3">
                <span className="font-semibold">eş anl.</span> {f.synonyms}
              </div>
            ) : null}
          </div>
        )}
        {card.type === 'audio' && (
          <div className="px-1 text-center">
            <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-na-accent uppercase">Cümle</div>
            <div className="na-display text-[19px] leading-[1.35] font-medium tracking-[-0.015em]">“{card.back}”</div>
            {f.media_uid ? <div className="mt-5" onPointerDown={stop} onClick={stop}><AudioPlayer src={mediaURL(f.media_uid)} compact /></div> : null}
          </div>
        )}
        {card.type === 'image' && (
          <div className="text-center">
            <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-na-accent uppercase">Cevap</div>
            <div className="na-display text-[clamp(28px,9vw,38px)] tracking-[-0.025em]">{card.back}</div>
            {f.extra ? <div className="mt-3.5 px-3 text-[13px] leading-normal text-na-text-2">{f.extra}</div> : null}
          </div>
        )}
        {card.type === 'quran' && <QuranBack fields={f} />}
      </div>
    </div>
  )
}

/** Audio with a play/pause button and waveform progress. */
function AudioPlayer({ src, compact }: { src: string; compact?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rate, setRate] = useState(1)
  useEffect(() => () => ref.current?.pause(), [])
  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }
  const audio = (
    <audio
      ref={ref}
      src={src}
      preload="metadata"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
    />
  )
  if (compact) {
    return (
      <div className="na-glass inline-flex items-center gap-3 px-3 py-2.5" style={{ borderRadius: 12 }}>
        {audio}
        <button type="button" onClick={toggle} aria-label={playing ? 'Duraklat' : 'Oynat'} className="flex h-8 w-8 items-center justify-center border-0 bg-transparent">
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
        <div className="w-[100px] text-na-purple"><Waveform bars={24} height={20} progress={progress} dim={0.3} /></div>
        <button
          type="button"
          onClick={() => {
            const next = rate === 1 ? 0.75 : 1
            setRate(next)
            if (ref.current) ref.current.playbackRate = next
          }}
          className="na-mono border-0 bg-transparent text-[11px] text-na-text-3"
        >
          {rate}×
        </button>
      </div>
    )
  }
  return (
    <div className="w-full text-center">
      {audio}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Duraklat' : 'Oynat'}
        className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full border-0 text-white"
        style={{ background: 'linear-gradient(180deg, #A78BFA 0%, #7C3AED 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.35) inset, 0 12px 32px rgba(124,58,237,0.45)' }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={32} strokeWidth={2.5} />
      </button>
      <div className="mt-[26px] px-2 text-na-purple"><Waveform bars={42} height={42} progress={progress} dim={0.22} /></div>
    </div>
  )
}

function AudioFront({ card }: { card: CardDTO }) {
  return (
    <div className="w-full px-1.5 text-center" onPointerDown={stop} onClick={stop}>
      <div className="mb-[18px] text-xs font-semibold tracking-[0.04em] text-na-text-3 uppercase">{card.front || 'Sesi dinleyin'}</div>
      {card.fields.media_uid ? (
        <AudioPlayer src={mediaURL(card.fields.media_uid)} />
      ) : (
        <div className="na-glass mx-auto flex max-w-[260px] flex-col items-center gap-2 px-4 py-6 text-sm text-na-text-3" style={{ borderRadius: 18 }}>
          <Icon name="mic" size={22} />
          Bu kartta ses kaydı yok
        </div>
      )}
    </div>
  )
}

function ImageFront({ card }: { card: CardDTO }) {
  const uid = card.fields.media_uid
  return (
    <div className="w-full text-center">
      <div className="na-glass relative mx-auto w-full overflow-hidden" style={{ aspectRatio: '1 / 1', maxHeight: '42dvh', maxWidth: '42dvh', borderRadius: 22, background: 'linear-gradient(135deg, #1E293B, #334155)' }}>
        {uid ? (
          <img src={mediaURL(uid)} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-na-pink"><Icon name="image" size={56} strokeWidth={1.2} /></div>
        )}
      </div>
      <div className="na-display mt-[18px] text-[22px] tracking-[-0.015em]">{card.front}</div>
    </div>
  )
}

function QuranFront({ fields: f }: { fields: CardFields }) {
  return (
    <div className="w-full text-center">
      <div className="mb-1 text-[11px] tracking-[0.08em] text-na-text-3 uppercase">{[f.sure, f.ayah].filter(Boolean).join(' · ')}</div>
      <div className="na-arabic mt-4 px-1.5 text-[clamp(24px,8vw,30px)] leading-[1.9]" lang="ar">{f.arabic || f.meal}</div>
      {f.reciter ? <Pill tone="accent" icon="speaker" className="mt-[22px]">{f.reciter}</Pill> : null}
    </div>
  )
}

function QuranBack({ fields: f }: { fields: CardFields }) {
  return (
    <div className="max-h-full w-full overflow-auto px-0.5" onPointerDown={stop}>
      {f.translit ? (
        <>
          <div className="text-[10px] font-semibold tracking-[0.08em] text-na-accent uppercase">Okunuş</div>
          <div className="mt-1.5 text-[13px] leading-normal text-na-text-2 italic">{f.translit}</div>
        </>
      ) : null}
      {f.meal ? (
        <>
          <div className="mt-4 text-[10px] font-semibold tracking-[0.08em] text-na-accent uppercase">Meal</div>
          <div className="na-display mt-1.5 text-[17px] leading-[1.4] font-medium tracking-[-0.01em]">{f.meal}</div>
        </>
      ) : null}
      {f.tefsir ? (
        <div className="na-glass mt-4 px-3.5 py-3 text-left" style={{ borderRadius: 14 }}>
          <div className="mb-1 text-[10px] font-semibold tracking-[0.08em] text-na-text-3 uppercase">Tefsir özeti</div>
          <div className="text-xs leading-normal text-na-text-2">{f.tefsir}</div>
        </div>
      ) : null}
    </div>
  )
}
