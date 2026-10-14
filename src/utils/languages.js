// BCP-47 language tags supported by the Web Speech API
// (safe subset — Chrome/Edge/Safari recognize these)
const SUPPORTED_LANGUAGES = [
  { code: "en-US", name: "English (US)",       flag: "🇺🇸" },
  { code: "en-GB", name: "English (UK)",       flag: "🇬🇧" },
  { code: "bn-BD", name: "Bengali (Bangladesh)", flag: "🇧🇩" },
  { code: "hi-IN", name: "Hindi",              flag: "🇮🇳" },
  { code: "ur-PK", name: "Urdu",               flag: "🇵🇰" },
  { code: "ar-SA", name: "Arabic",             flag: "🇸🇦" },
  { code: "es-ES", name: "Spanish",            flag: "🇪🇸" },
  { code: "fr-FR", name: "French",             flag: "🇫🇷" },
  { code: "de-DE", name: "German",             flag: "🇩🇪" },
  { code: "pt-BR", name: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "ru-RU", name: "Russian",            flag: "🇷🇺" },
  { code: "zh-CN", name: "Chinese (Mandarin)", flag: "🇨🇳" },
  { code: "ja-JP", name: "Japanese",           flag: "🇯🇵" },
  { code: "ko-KR", name: "Korean",             flag: "🇰🇷" },
  { code: "tr-TR", name: "Turkish",            flag: "🇹🇷" },
];

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

module.exports = { SUPPORTED_LANGUAGES, LANGUAGE_CODES };