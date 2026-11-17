import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import bnTranslation from './locales/bn.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  bn: {
    translation: bnTranslation,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language MUST be English as per requirement
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already handles escaping
    },
  });

export default i18n;
