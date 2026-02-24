/**
 * Language Switcher Component
 * Week 6 Day 3: Internationalization & Localization
 *
 * Features:
 * - Dropdown language selector with native language names
 * - Flag emojis for visual identification
 * - RTL support toggle
 * - Currency auto-switching based on language
 * - Compact and full display modes
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage, getLanguageInfo, type LanguageCode } from '../i18n';
import { setCurrentCurrency } from '../utils/currency';

// ─── Types ──────────────────────────────────────────────────

interface LanguageSwitcherProps {
  /** Compact mode shows just the flag */
  compact?: boolean;
  /** Show currency auto-switch */
  showCurrency?: boolean;
  /** CSS className override */
  className?: string;
}

// ─── Language-to-Currency Mapping ───────────────────────────

const LANG_CURRENCY_MAP: Record<string, string> = {
  en: 'USD',
  es: 'MXN',
  fr: 'EUR',
  hi: 'INR',
  ar: 'SAR',
};

// ─── Component ──────────────────────────────────────────────

export function LanguageSwitcher({
  compact = false,
  showCurrency = true,
  className = '',
}: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = getLanguageInfo(i18n.language) || LANGUAGES[0];

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleLanguageChange = async (code: LanguageCode) => {
    await changeLanguage(code);

    // Auto-switch currency based on language
    if (showCurrency && LANG_CURRENCY_MAP[code]) {
      setCurrentCurrency(LANG_CURRENCY_MAP[code]);
    }

    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg
          ${
            compact
              ? 'bg-white/10 hover:bg-white/20'
              : 'bg-white/10 hover:bg-white/20 border border-white/20'
          }
          text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400`}
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-lg" role="img" aria-label={currentLang.name}>
          {currentLang.flag}
        </span>
        {!compact && (
          <>
            <span className="text-sm font-medium">{currentLang.nativeName}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-xl bg-gray-900 border border-white/20
            shadow-2xl z-50 overflow-hidden animate-fadeIn"
          role="listbox"
          aria-label="Available languages"
        >
          <div className="py-1">
            {LANGUAGES.map((lang) => {
              const isActive = i18n.language === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code as LanguageCode)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    ${
                      isActive
                        ? 'bg-purple-600/30 text-purple-200'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="text-xl" role="img" aria-label={lang.name}>
                    {lang.flag}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{lang.nativeName}</div>
                    <div className="text-xs text-white/50">{lang.name}</div>
                  </div>
                  {lang.dir === 'rtl' && (
                    <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">
                      RTL
                    </span>
                  )}
                  {isActive && (
                    <svg
                      className="w-4 h-4 text-purple-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer with currency info */}
          {showCurrency && (
            <div className="border-t border-white/10 px-4 py-2">
              <div className="text-xs text-white/40">
                Currency: {LANG_CURRENCY_MAP[i18n.language] || 'USD'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher;
