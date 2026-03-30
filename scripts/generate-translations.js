import 'dotenv/config';
import OpenAI from 'openai';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { SUPPORTED_LANGUAGES } from '../src/config.js';
import en from '../src/i18n/en.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ENGLISH_STRINGS = en;

const I18N_DIR = './src/i18n';

function loadExistingTranslations(langCode) {
  const filePath = `${I18N_DIR}/${langCode}.js`;
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    // We can't dynamically import here easily, so we'll skip validation
    // and just check if file exists
    return true;
  } catch (e) {
    console.log(`Could not load existing translations for ${langCode}`);
  }

  return null;
}

function saveTranslations(langCode, translations) {
  const output = `export default ${JSON.stringify(translations, null, 2)};\n`;
  writeFileSync(`${I18N_DIR}/${langCode}.js`, output);
}

async function translateAllForLanguage(targetLang) {
  if (targetLang === 'en') return ENGLISH_STRINGS;

  const messages = [
    {
      role: 'system',
      content: `You are a translation assistant. Translate the following UI strings to ${SUPPORTED_LANGUAGES[targetLang].name} (${targetLang}). Return ONLY a valid JSON object with the same keys as the input. Keep all emoji, placeholders, and formatting exactly as in the original. Be concise and natural.`
    },
    { role: 'user', content: JSON.stringify(ENGLISH_STRINGS, null, 2) }
  ];

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4',
        reasoning_effort: "none",
        messages,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);

      messages.push({ role: 'assistant', content });

      return parsed;
    } catch (error) {
      const content = error.choices?.[0]?.message?.content || 'No content';
      messages.push({ role: 'assistant', content });
      messages.push({
        role: 'user',
        content: `Your response was not valid JSON. Error: ${error.message}. Please fix the JSON and return only the corrected JSON object.`
      });

      if (attempt === maxRetries) {
        console.error(`Failed to translate to ${targetLang} after ${maxRetries} attempts`);
        return null;
      }
    }
  }
}

async function generateTranslations() {
  // Ensure i18n directory exists
  if (!existsSync(I18N_DIR)) {
    mkdirSync(I18N_DIR, { recursive: true });
  }

  const languages = Object.keys(SUPPORTED_LANGUAGES).filter(l => l !== 'en');

  console.log(`Checking ${languages.length} languages...\n`);

  for (const lang of languages) {
    const fileExists = loadExistingTranslations(lang);

    if (fileExists) {
      console.log(`✓ ${SUPPORTED_LANGUAGES[lang].name} (${lang}) - file exists, skipping`);
      continue;
    }

    console.log(`\nTranslating to ${SUPPORTED_LANGUAGES[lang].name} (${lang})...`);

    const translated = await translateAllForLanguage(lang);
    if (translated) {
      saveTranslations(lang, translated);
      console.log(`  ✓ Saved to ${I18N_DIR}/${lang}.js`);
    } else {
      console.log(`  ✗ Failed`);
    }
  }

  console.log('\n✅ All translations complete!');
  console.log(`Files saved to: ${I18N_DIR}/`);
}

generateTranslations().catch(console.error);
