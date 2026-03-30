import { SUPPORTED_LANGUAGES, OPENAI_MODEL, supportsReasoningEffortNone } from './config.js';

// Load English as the base
import en from './i18n/en.js';
import af from './i18n/af.js';
import ar from './i18n/ar.js';
import az from './i18n/az.js';
import be from './i18n/be.js';
import bg from './i18n/bg.js';
import bs from './i18n/bs.js';
import ca from './i18n/ca.js';
import cs from './i18n/cs.js';
import cy from './i18n/cy.js';
import da from './i18n/da.js';
import de from './i18n/de.js';
import el from './i18n/el.js';
import es from './i18n/es.js';
import et from './i18n/et.js';
import fa from './i18n/fa.js';
import fi from './i18n/fi.js';
import fr from './i18n/fr.js';
import gl from './i18n/gl.js';
import he from './i18n/he.js';
import hi from './i18n/hi.js';
import hr from './i18n/hr.js';
import hu from './i18n/hu.js';
import hy from './i18n/hy.js';
import id from './i18n/id.js';
import is from './i18n/is.js';
import it from './i18n/it.js';
import ja from './i18n/ja.js';
import kk from './i18n/kk.js';
import kn from './i18n/kn.js';
import ko from './i18n/ko.js';
import lt from './i18n/lt.js';
import lv from './i18n/lv.js';
import mi from './i18n/mi.js';
import mk from './i18n/mk.js';
import mr from './i18n/mr.js';
import ms from './i18n/ms.js';
import ne from './i18n/ne.js';
import nl from './i18n/nl.js';
import no from './i18n/no.js';
import pl from './i18n/pl.js';
import pt from './i18n/pt.js';
import ro from './i18n/ro.js';
import ru from './i18n/ru.js';
import sk from './i18n/sk.js';
import sl from './i18n/sl.js';
import sr from './i18n/sr.js';
import sv from './i18n/sv.js';
import sw from './i18n/sw.js';
import ta from './i18n/ta.js';
import th from './i18n/th.js';
import tl from './i18n/tl.js';
import tr from './i18n/tr.js';
import uk from './i18n/uk.js';
import ur from './i18n/ur.js';
import vi from './i18n/vi.js';
import zh from './i18n/zh.js';

export const GUI_STRINGS = {
  en, af, ar, az, be, bg, bs, ca, cs, cy, da, de, el, es, et, fa, fi, fr, gl, he, hi, hr, hu, hy, id, is, it, ja, kk, kn, ko, lt, lv, mi, mk, mr, ms, ne, nl, no, pl, pt, ro, ru, sk, sl, sr, sv, sw, ta, th, tl, tr, uk, ur, vi, zh
};

// Dynamic loader for language files (for future expansion)
export async function loadLanguage(langCode) {
  if (!SUPPORTED_LANGUAGES[langCode]) return null;
  if (GUI_STRINGS[langCode]) return GUI_STRINGS[langCode];
  
  try {
    const module = await import(`./i18n/${langCode}.js`);
    GUI_STRINGS[langCode] = module.default;
    return module.default;
  } catch (e) {
    console.error(`Could not load translations for ${langCode}:`, e.message);
    return null;
  }
}

export function translateGUI(text, targetLang) {
  const lang = SUPPORTED_LANGUAGES[targetLang] ? targetLang : 'en';

  const cached = GUI_STRINGS[lang];
  if (cached && cached[text]) {
    return cached[text];
  }

  return GUI_STRINGS.en?.[text] ?? text;
}

export async function translate(text, targetLang, openai) {
  const requestOptions = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a translator. Translate the following text to ${SUPPORTED_LANGUAGES[targetLang]?.name || targetLang}. Only return the translation, nothing else.`
      },
      { role: 'user', content: text }
    ]
  };

  // Only add reasoning_effort: "none" for models that support it (gpt-5.1, gpt-5.2, gpt-5.4)
  if (supportsReasoningEffortNone(OPENAI_MODEL)) {
    requestOptions.reasoning_effort = "none";
  }

  const response = await openai.chat.completions.create(requestOptions);
  return response.choices[0].message.content;
}
