/**
 * 「联系支持」弹窗里的那两行渠道。
 *
 * `SupportDialog` 本身不硬编任何社群地址(渠道由调用方给),所以「产品在用的是哪两条」
 * 得有一个单一出处 —— 否则报错卡、帮助菜单、设置各写一份,改群链接要改三处。
 *
 * Product support goes to the OpenComputer Design website. No Discord invite.
 */
import type { SupportChannel } from './SupportDialog';
import { DiscordIcon, FeishuIcon } from './support-brand-icons';
import type { Dict } from '../../i18n/types';

export const SUPPORT_SITE_URL = 'https://tryopencomputer.com';
export const SUPPORT_FEISHU_URL = 'https://tryopencomputer.com';

export function supportChannels(
  t: (key: keyof Dict) => string,
): SupportChannel[] {
  return [
    {
      id: 'feishu',
      name: t('chat.support.channel.feishu'),
      href: SUPPORT_FEISHU_URL,
      icon: <FeishuIcon />,
    },
    {
      id: 'discord',
      name: t('chat.support.channel.discord'),
      href: SUPPORT_SITE_URL,
      icon: <DiscordIcon />,
    },
  ];
}
