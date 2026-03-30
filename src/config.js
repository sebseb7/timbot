import 'dotenv/config';

export const SUPPORTED_LANGUAGES = {
  'af': { name: 'Afrikaans', native: 'Afrikaans', flag: '🇿🇦' },
  'ar': { name: 'Arabic', native: 'العربية', flag: '🇸🇦' },
  'hy': { name: 'Armenian', native: 'Հայերեն', flag: '🇦🇲' },
  'az': { name: 'Azerbaijani', native: 'Azərbaycanca', flag: '🇦🇿' },
  'be': { name: 'Belarusian', native: 'Беларуская', flag: '🇧🇾' },
  'bs': { name: 'Bosnian', native: 'Bosanski', flag: '🇧🇦' },
  'bg': { name: 'Bulgarian', native: 'Български', flag: '🇧🇬' },
  'ca': { name: 'Catalan', native: 'Català', flag: '🇦🇩' },
  'zh': { name: 'Chinese', native: '中文', flag: '🇨🇳' },
  'hr': { name: 'Croatian', native: 'Hrvatski', flag: '🇭🇷' },
  'cs': { name: 'Czech', native: 'Čeština', flag: '🇨🇿' },
  'da': { name: 'Danish', native: 'Dansk', flag: '🇩🇰' },
  'nl': { name: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
  'en': { name: 'English', native: 'English', flag: '🇬🇧' },
  'et': { name: 'Estonian', native: 'Eesti', flag: '🇪🇪' },
  'fi': { name: 'Finnish', native: 'Suomi', flag: '🇫🇮' },
  'fr': { name: 'French', native: 'Français', flag: '🇫🇷' },
  'gl': { name: 'Galician', native: 'Galego', flag: '🇪🇸' },
  'de': { name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  'el': { name: 'Greek', native: 'Ελληνικά', flag: '🇬🇷' },
  'he': { name: 'Hebrew', native: 'עברית', flag: '🇮🇱' },
  'hi': { name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  'hu': { name: 'Hungarian', native: 'Magyar', flag: '🇭🇺' },
  'is': { name: 'Icelandic', native: 'Íslenska', flag: '🇮🇸' },
  'id': { name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  'it': { name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  'ja': { name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  'kn': { name: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳' },
  'kk': { name: 'Kazakh', native: 'Қазақша', flag: '🇰🇿' },
  'ko': { name: 'Korean', native: '한국어', flag: '🇰🇷' },
  'lv': { name: 'Latvian', native: 'Latviešu', flag: '🇱🇻' },
  'lt': { name: 'Lithuanian', native: 'Lietuvių', flag: '🇱🇹' },
  'mk': { name: 'Macedonian', native: 'Македонски', flag: '🇲🇰' },
  'ms': { name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾' },
  'mr': { name: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
  'mi': { name: 'Maori', native: 'Te Reo Māori', flag: '🇳🇿' },
  'ne': { name: 'Nepali', native: 'नेपाली', flag: '🇳🇵' },
  'no': { name: 'Norwegian', native: 'Norsk', flag: '🇳🇴' },
  'fa': { name: 'Persian', native: 'فارسی', flag: '🇮🇷' },
  'pl': { name: 'Polish', native: 'Polski', flag: '🇵🇱' },
  'pt': { name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  'ro': { name: 'Romanian', native: 'Română', flag: '🇷🇴' },
  'ru': { name: 'Russian', native: 'Русский', flag: '🇷🇺' },
  'sr': { name: 'Serbian', native: 'Српски', flag: '🇷🇸' },
  'sk': { name: 'Slovak', native: 'Slovenčina', flag: '🇸🇰' },
  'sl': { name: 'Slovenian', native: 'Slovenščina', flag: '🇸🇮' },
  'es': { name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  'sw': { name: 'Swahili', native: 'Kiswahili', flag: '🇹🇿' },
  'sv': { name: 'Swedish', native: 'Svenska', flag: '🇸🇪' },
  'tl': { name: 'Tagalog', native: 'Tagalog', flag: '🇵🇭' },
  'ta': { name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  'th': { name: 'Thai', native: 'ไทย', flag: '🇹🇭' },
  'tr': { name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  'uk': { name: 'Ukrainian', native: 'Українська', flag: '🇺🇦' },
  'ur': { name: 'Urdu', native: 'اردو', flag: '🇵🇰' },
  'vi': { name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  'cy': { name: 'Welsh', native: 'Cymraeg', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' }
};

export const COMMANDS = {
  NEW: { name: 'new', description: 'Create a conversation and get a code' },
  JOIN: { name: 'join', description: 'Join a conversation' },
  LEAVE: { name: 'leave', description: 'Leave a conversation' },
  LANG: { name: 'lang', description: 'Set your language' },
  OUTPUT: { name: 'output', description: 'Setting: Receive messages as audio or text' }
};

export const MAX_MESSAGE_LENGTH = 500;

export const DISABLE_RECEIVE_AUDIO = process.env.DISABLE_RECEIVE_AUDIO === 'true';

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

export const USE_LOCAL_WHISPER = process.env.USE_LOCAL_WHISPER === 'true';

export const WHISPER_MODEL_URL = process.env.WHISPER_MODEL_URL;

export const WHISPER_CPP_PATH = process.env.WHISPER_CPP_PATH || 'whisper-cli';

export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Check if a model supports reasoning_effort parameter
 * Only GPT-5+ reasoning models support this parameter
 * - gpt-5: supports reasoning_effort but NOT "none"
 * - gpt-5.1, gpt-5.2, gpt-5.4: support reasoning_effort including "none"
 * - gpt-5-mini: support reasoning_effort but NOT "none"
 * - gpt-5.4-mini: support reasoning_effort including "none"
 * - gpt-4.1, gpt-4.1-mini: do NOT support reasoning_effort at all
 */
export function supportsReasoningEffort(model) {
  // Must start with gpt-5
  if (!model.startsWith('gpt-5')) {
    return false;
  }
  return true;
}

/**
 * Check if a model supports reasoning_effort: "none"
 * Only gpt-5.1, gpt-5.2, gpt-5.4 (non-mini) support "none" value
 * gpt-5-mini and plain gpt-5 do NOT support "none"
 */
export function supportsReasoningEffortNone(model) {
  if (!supportsReasoningEffort(model)) {
    return false;
  }
  // gpt-5-mini does not support "none", but gpt-5.4-mini does
  if (model === 'gpt-5-mini') {
    return false;
  }
  // Plain gpt-5 does not support "none"
  if (model === 'gpt-5') {
    return false;
  }
  // gpt-5.1, gpt-5.2, gpt-5.4, etc. support "none"
  return true;
}
