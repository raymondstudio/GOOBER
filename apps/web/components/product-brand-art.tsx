'use client';

export interface BrandVisualSpec {
  brand: string;
  stamp: string;
  seal: string;
  bg: string;
  fg: string;
  accent: string;
  glyph: string;
}

const RULES: Array<[RegExp, BrandVisualSpec]> = [
  [/facebook|\bfb\b/i, { brand: 'FACEBOOK', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#0E2A5C', fg: '#FFFFFF', accent: '#3B82F6', glyph: 'fb' }],
  [/instagram|\big\b/i, { brand: 'INSTAGRAM', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#4A1228', fg: '#FFF5F7', accent: '#F43F5E', glyph: 'ig' }],
  [/twitter|\(x\)|\bx account/i, { brand: 'X / TWITTER', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#11161B', fg: '#F8FAFC', accent: '#94A3B8', glyph: 'x' }],
  [/tiktok/i, { brand: 'TIKTOK', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#121316', fg: '#FFFFFF', accent: '#2DD4BF', glyph: 'tiktok' }],
  [/telegram/i, { brand: 'TELEGRAM', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#0C354D', fg: '#F0F9FF', accent: '#38BDF8', glyph: 'tg' }],
  [/reddit/i, { brand: 'REDDIT', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#4C1B0B', fg: '#FFF7ED', accent: '#FB923C', glyph: 'tg' }],
  [/discord/i, { brand: 'DISCORD', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#1E1F4B', fg: '#EEF2FF', accent: '#818CF8', glyph: 'tg' }],
  [/linkedin/i, { brand: 'LINKEDIN', stamp: 'GOOBER // PRO', seal: 'g. TOOLS', bg: '#0A2E4D', fg: '#F0F9FF', accent: '#38BDF8', glyph: 'work' }],
  [/gmail|outlook|hotmail|mail/i, { brand: 'MAIL SUITE', stamp: 'GOOBER // ACCOUNTS', seal: 'g. VERIFIED', bg: '#1F2937', fg: '#F9FAFB', accent: '#60A5FA', glyph: 'work' }],
  [/claude|anthropic/i, { brand: 'CLAUDE AI', stamp: 'GOOBER // AI TOOLS', seal: 'g. TOOLS', bg: '#2C1D16', fg: '#FDF6F0', accent: '#D97757', glyph: 'claude' }],
  [/chatgpt|openai|codex|gpt/i, { brand: 'OPENAI / GPT', stamp: 'GOOBER // AI TOOLS', seal: 'g. TOOLS', bg: '#0B3329', fg: '#ECFDF5', accent: '#10B981', glyph: 'gpt' }],
  [/gemini|google ai|veo/i, { brand: 'GEMINI AI', stamp: 'GOOBER // AI TOOLS', seal: 'g. TOOLS', bg: '#132448', fg: '#EFF6FF', accent: '#60A5FA', glyph: 'gemini' }],
  [/cursor|perplexity|grok|elevenlabs|kling|leonardo|midjourney|gamma|qwen|minimax|higgsfield|ai tools/i, { brand: 'AI STUDIO', stamp: 'GOOBER // AI TOOLS', seal: 'g. TOOLS', bg: '#142923', fg: '#ECFDF5', accent: '#34D399', glyph: 'gpt' }],
  [/canva|adobe|capcut|figma|autocad|autodesk|design|video/i, { brand: 'CREATIVE PRO', stamp: 'GOOBER // STUDIO', seal: 'g. TOOLS', bg: '#2B1636', fg: '#FAF5FF', accent: '#C084FC', glyph: 'design' }],
  [/vpn|nordvpn|expressvpn|surfshark|proton|adguard|avira|ipvanish|hotspot/i, { brand: 'PRIVACY VPN', stamp: 'GOOBER // SECURITY', seal: 'g. TOOLS', bg: '#0F2933', fg: '#ECFEFF', accent: '#22D3EE', glyph: 'vpn' }],
  [/netflix|youtube|crunchyroll|prime video|paramount|disney|hulu|streaming/i, { brand: 'CINEMA PRO', stamp: 'GOOBER // MEDIA', seal: 'g. TOOLS', bg: '#3B0F14', fg: '#FEF2F2', accent: '#F87171', glyph: 'stream' }],
  [/spotify|apple music|pocket fm|music|audio/i, { brand: 'AUDIO PRO', stamp: 'GOOBER // AUDIO', seal: 'g. TOOLS', bg: '#0D2E1E', fg: '#ECFDF5', accent: '#4ADE80', glyph: 'music' }],
  [/duolingo|coursera|udemy|edx|jetbrains|quizlet|wordwall|education/i, { brand: 'ACADEMY LAB', stamp: 'GOOBER // LEARN', seal: 'g. TOOLS', bg: '#172E1C', fg: '#F0FDF4', accent: '#86EFAC', glyph: 'work' }],
];

export function resolveProductBrand(name: string, category = '', provider = 'PAI'): BrandVisualSpec {
  const hay = `${name} ${category}`;
  for (const [re, spec] of RULES) if (re.test(hay)) return spec;
  if (provider === 'GRAML' || category === 'Social Media Accounts') {
    return { brand: 'SOCIAL SUITE', stamp: 'GOOBER // SOCIAL', seal: 'g. VERIFIED', bg: '#162B36', fg: '#F8FAFC', accent: '#38BDF8', glyph: 'tg' };
  }
  return { brand: 'WORKSPACE', stamp: 'GOOBER // TOOLS', seal: 'g. TOOLS', bg: '#153B2C', fg: '#F0FDF4', accent: '#34D399', glyph: 'work' };
}

function Glyph({ glyph, accent }: { glyph: string; accent: string }) {
  if (glyph === 'fb') return <path d="M26 13h-4c-3.3 0-5 1.7-5 5v3h-3v4h3v10h4.5V25h3.5l.8-4h-4.3v-2.5c0-1.1.4-1.5 1.6-1.5H26V13Z" fill="currentColor" />;
  if (glyph === 'ig') return <><rect x="12" y="12" width="24" height="24" rx="6.5" stroke="currentColor" strokeWidth="2.4" fill="none" /><circle cx="24" cy="24" r="5.5" stroke={accent} strokeWidth="2.4" fill="none" /><circle cx="30.5" cy="17.5" r="1.6" fill="currentColor" /></>;
  if (glyph === 'x') return <path d="M13 13h5.2l6.1 8.2L30.8 13H35l-8.6 10.6L35.5 35h-5.2l-6.6-8.8L16.5 35H12.3l9.1-11.2L13 13Z" fill="currentColor" />;
  if (glyph === 'tiktok') return <path d="M27 12c.6 3.5 2.8 5.8 6 6.2v4.1c-2.2-.1-4.2-.8-5.8-2v8.2c0 4.4-3.5 7.5-7.8 7.5a7.4 7.4 0 0 1-7.4-7.5c0-4.3 3.4-7.6 7.8-7.4v4.2a3.4 3.4 0 0 0-3.5 3.3c0 1.9 1.5 3.4 3.4 3.4 2 0 3.3-1.4 3.3-3.7V12h4Z" fill="currentColor" />;
  if (glyph === 'claude') return <><path d="M24 11v26M11 24h26M14.8 14.8l18.4 18.4M33.2 14.8 14.8 33.2" stroke={accent} strokeWidth="2.6" strokeLinecap="round" /><circle cx="24" cy="24" r="3.5" fill="currentColor" /></>;
  if (glyph === 'gpt') return <><polygon points="24,11 35,17.5 35,30.5 24,37 13,30.5 13,17.5" stroke="currentColor" strokeWidth="2.3" fill="none" /><circle cx="24" cy="24" r="4.5" stroke={accent} strokeWidth="2.2" fill="none" /></>;
  if (glyph === 'gemini') return <path d="M24 10c1.8 7.6 6.4 12.2 14 14-7.6 1.8-12.2 6.4-14 14-1.8-7.6-6.4-12.2-14-14 7.6-1.8 12.2-6.4 14-14Z" fill="currentColor" />;
  if (glyph === 'vpn') return <path d="M24 11 13 15.5v7.8c0 6.8 4.7 12.8 11 14.7 6.3-1.9 11-7.9 11-14.7v-7.8L24 11Zm-2 17.5-4.5-4.5 1.8-1.8 2.7 2.7 6.2-6.2 1.8 1.8-8 8Z" fill="currentColor" />;
  if (glyph === 'stream') return <><rect x="11" y="14" width="26" height="20" rx="4" stroke="currentColor" strokeWidth="2.2" fill="none" /><polygon points="21,19 30,24 21,29" fill={accent} /></>;
  if (glyph === 'music') return <><circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="2.2" fill="none" /><path d="M18 21.5c4-1.3 8.5-1 12 1M19 25c3.2-1 6.8-.7 9.6.8" stroke={accent} strokeWidth="2.2" strokeLinecap="round" fill="none" /></>;
  return <><rect x="13" y="13" width="22" height="22" rx="5" stroke="currentColor" strokeWidth="2.2" fill="none" /><path d="M18 24h12M24 18v12" stroke={accent} strokeWidth="2.2" strokeLinecap="round" /></>;
}

export function ProductBrandArt({ name, category = '', provider = 'PAI', variant = 'card' }: { name: string; category?: string; provider?: string; variant?: 'card' | 'hero' | 'compact' }) {
  const s = resolveProductBrand(name, category, provider);
  return (
    <div className={`goober-brand-tile goober-brand-${variant}`} style={{ background: s.bg, color: s.fg }} aria-hidden="true">
      <div className="goober-brand-topline"><span className="goober-brand-stamp">{s.stamp}</span><span className="goober-brand-dot" style={{ background: s.accent }} /></div>
      <div className="goober-brand-center"><svg viewBox="0 0 48 48" className="goober-brand-svg" role="presentation"><Glyph glyph={s.glyph} accent={s.accent} /></svg><span className="goober-brand-label">{s.brand}</span></div>
      <div className="goober-brand-bottomline"><span className="goober-brand-monogram">g.</span><span className="goober-brand-seal">{s.seal}</span></div>
    </div>
  );
}
