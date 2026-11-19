/** NewAnki app mark: gradient tile with a glass inner square and an N. */
export function Logo({ size = 76 }: { size?: number }) {
  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.33,
        background: 'linear-gradient(135deg, #34D399 0%, #10B981 60%, #A78BFA 100%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 20px 50px rgba(16,185,129,0.45)',
      }}
    >
      <div
        className="absolute flex items-center justify-center text-white"
        style={{
          inset: size * 0.055,
          borderRadius: size * 0.27,
          background: 'rgba(255,255,255,0.06)',
          border: '0.5px solid rgba(255,255,255,0.18)',
          fontFamily: 'var(--na-font-display)',
          fontSize: size * 0.38,
          fontWeight: 700,
          letterSpacing: '-0.04em',
        }}
      >
        N
      </div>
    </div>
  )
}
