/**
 * 「联系支持」弹窗里的渠道。
 *
 * `SupportDialog` 本身不硬编任何社群地址(渠道由调用方给),所以「产品在用的是哪条」
 * 得有一个单一出处 —— 否则报错卡、帮助菜单、设置各写一份,改链接要改三处。
 *
 * Product support goes to the OpenComputer Design website. No Discord channel.
 */
import type { SupportChannel } from './SupportDialog';
import { FeishuIcon } from './support-brand-icons';
import type { Dict } from '../../i18n/types';

export const SUPPORT_SITE_URL = 'https://tryopencomputer.com';
export const SUPPORT_FEISHU_URL = 'https://tryopencomputer.com';

export function supportChannels(
  _t: (key: keyof Dict) => string,
): SupportChannel[] {
  return [
    {
      id: 'website',
      name: 'Website',
      href: SUPPORT_SITE_URL,
      icon: <FeishuIcon />,
    },
  ];
}
