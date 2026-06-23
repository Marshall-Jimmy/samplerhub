import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';
import it from './locales/it.json';
import ug from './locales/ug.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en': { translation: en },
      'ja': { translation: ja },
      'ko': { translation: ko },
      'fr': { translation: fr },
      'de': { translation: de },
      'es': { translation: es },
      'pt-BR': { translation: ptBR },
      'ru': { translation: ru },
      'it': { translation: it },
      'ug': { translation: ug },
    },
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'samplerhub-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
