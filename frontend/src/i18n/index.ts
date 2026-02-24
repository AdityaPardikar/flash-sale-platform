/**
 * i18n Configuration
 * Week 6 Day 3: Internationalization & Localization
 *
 * i18next initialization with:
 * - Language detection (browser, URL, cookie, localStorage)
 * - Lazy-loaded translation bundles
 * - Namespace organization
 * - Pluralization & interpolation
 * - Fallback chains
 * - RTL support for Arabic
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// ─── Translation Resources ─────────────────────────────────

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ar from './locales/ar.json';

// ─── Supported Languages ───────────────────────────────────

export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' as const, flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' as const, flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' as const, flag: '🇫🇷' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' as const, flag: '🇮🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' as const, flag: '🇸🇦' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const RTL_LANGUAGES: LanguageCode[] = ['ar'];

// ─── Initialize ────────────────────────────────────────────

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      hi: { translation: hi },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
  });

// ─── Helpers ────────────────────────────────────────────────

/**
 * Check if the current language is RTL
 */
export function isRTL(lang?: string): boolean {
  const currentLang = lang || i18n.language;
  return RTL_LANGUAGES.includes(currentLang as LanguageCode);
}

/**
 * Get direction for a language
 */
export function getDirection(lang?: string): 'ltr' | 'rtl' {
  return isRTL(lang) ? 'rtl' : 'ltr';
}

/**
 * Change language and update document direction
 */
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  await i18n.changeLanguage(lang);
  document.documentElement.dir = getDirection(lang);
  document.documentElement.lang = lang;
  localStorage.setItem('i18nextLng', lang);
}

/**
 * Get language info by code
 */
export function getLanguageInfo(code: string) {
  return LANGUAGES.find((l) => l.code === code);
}

export default i18n;
