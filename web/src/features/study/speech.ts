const LANGS: Record<string, string> = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', ar: 'ar-SA', tr: 'tr-TR', ru: 'ru-RU', ja: 'ja-JP',
}

/** "en→tr" → "en-US" (source language of the card). */
export function speechLang(lang: string | undefined): string | undefined {
  const src = (lang ?? '').split(/[→>-]/)[0]?.trim().toLowerCase()
  return src ? (LANGS[src] ?? src) : undefined
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Reads text aloud with the browser's TTS (pronunciation button on word cards). */
export function speak(text: string, lang?: string) {
  if (!canSpeak || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (lang) u.lang = lang
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}
