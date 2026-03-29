import QRCode from 'qrcode';
import { getOrCreateUser, createConversation, getActiveConversations, getConversationPartnerInfo } from '../db.js';
import { translateGUI } from '../translations.js';
import { SUPPORTED_LANGUAGES, COMMANDS } from '../config.js';

export function createNewHandler() {
  return async (ctx) => {
    const user = getOrCreateUser(ctx.from.id, ctx.from.username, ctx.from.language_code, ctx.from.first_name);
    const lang = user.language;

    const code = createConversation(ctx.from.id);
    const qrUrl = `http://t.me/${ctx.botInfo.username}?start=join_${code}`;
    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 400 });

    const caption = `✅ ${translateGUI('conv_created', lang)}\n\n${translateGUI('join_code', lang)}:\n<code>/${COMMANDS.JOIN.name} ${code}</code>\n\n${translateGUI('or_share_link', lang)}: ${qrUrl}\n\n${translateGUI('your_language', lang)}: ${SUPPORTED_LANGUAGES[lang]?.native || lang}\n\n⏳ ${translateGUI('waiting_partner', lang)}`;

    await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption,
        parse_mode: 'HTML'
      }
    );

    const activeConversations = getActiveConversations(ctx.from.id);
    if (activeConversations.length > 0) {
      const otherConvs = activeConversations.filter(c => c.id !== code);
      if (otherConvs.length > 0) {
        const otherActiveConvs = translateGUI('other_active_conversations', lang);
        const withUser = translateGUI('with_user', lang);
        let listText = `📋 ${otherActiveConvs}:\n`;
        for (const conv of otherConvs) {
          const partner = getConversationPartnerInfo(conv.id, ctx.from.id);
          const partnerName = partner?.username || `User ${partner?.user_id || 'Unknown'}`;
          listText += `• <code>${conv.id}</code> ${withUser} ${partnerName}\n`;
        }
        await ctx.reply(listText, { parse_mode: 'HTML' });
      }
    }
  };
}
