/* JIZURA — the built-in Adobe Fonts kit (web project wtu3ogb) and the faces the styles use when it is active.
   The kit only serves the domains listed in its web project (the Worker build). J.useAdobeKit() loads it; when the
   kit becomes active J.adobeReady is set and J.resolveStyle swaps each style's font roles for its `adobeFonts`.
   Elsewhere (other domains, offline) the styles keep their Google Fonts. */
(() => {
'use strict';
J.DEFAULT_ADOBE_KIT = 'wtu3ogb';
const JP_SANS = '"Noto Sans JP", sans-serif', JP_SERIF = '"Noto Serif JP", serif';
const A = (key, label, family, weight, serif) => {
  J.FONTS[key] = { label: label + '（Adobe）', family: `"${family}"`, weight, kind: 'adobe', adobe: true, loaded: true, fb: serif ? JP_SERIF : JP_SANS };
};
// weights as the kit serves them (wf-… classes of the kit): Source Han Sans 100–900, Ten Mincho Antique 200–900,
// Kinuta Shin Enpitsu 300–700, Ryo Display 500 / 700, Ryo Gothic 400 / 700 / 800 / 900, MB101 and Tsukushi A Old 300, the rest 400
A('ad_ryodisp_b', 'りょうディスプレイ B', 'ryo-display-plusn', 700, true);
A('ad_ryodisp_m', 'りょうディスプレイ M', 'ryo-display-plusn', 500, true);
A('ad_ryogo', 'りょうゴシック R', 'ryo-gothic-plusn', 400);
A('ad_ryogo_b', 'りょうゴシック B', 'ryo-gothic-plusn', 700);
A('ad_ryogo_h', 'りょうゴシック H', 'ryo-gothic-plusn', 800);
A('ad_ryogo_ub', 'りょうゴシック UB', 'ryo-gothic-plusn', 900);
A('ad_logojr', 'VDL ロゴJr', 'vdl-logojr', 400);
A('ad_logomaru', 'VDL ロゴ丸Jr', 'vdl-logomaru-jr', 400);
A('ad_ten', '貂明朝', 'ten-mincho', 400, true);
A('ad_tenant', '貂明朝アンチック', 'ten-mincho-antique', 400, true);
A('ad_tenant_h', '貂明朝アンチック H', 'ten-mincho-antique', 900, true);
A('ad_shs', '源ノ角ゴシック R', 'source-han-sans-cjk-ja', 400);
A('ad_shs_l', '源ノ角ゴシック EL', 'source-han-sans-cjk-ja', 200);
A('ad_shs_b', '源ノ角ゴシック B', 'source-han-sans-cjk-ja', 700);
A('ad_shs_h', '源ノ角ゴシック H', 'source-han-sans-cjk-ja', 900);
A('ad_mb101', 'ゴシックMB101 L', 'a-otf-gothic-mb101-pr6n', 300);
A('ad_tsukua', '筑紫Aオールド明朝', 'fot-tsukuaoldmin-pr6n', 300, true);
A('ad_enpitsu', '砧 芯・鉛筆', 'kinuta-shin-enpitsu-stdn', 400);
A('ad_enpitsu_b', '砧 芯・鉛筆 B', 'kinuta-shin-enpitsu-stdn', 700);
A('ad_komu_c', 'コム C', 'komu-new-c', 400);
A('ad_komu_d', 'コム D', 'komu-new-d', 400);
A('ad_komu_e', 'コム E', 'komu-new-e', 400);
A('ad_komu_f', 'コム F', 'komu-new-f', 400);

/* each style's faces with the kit: display (the big words), serif (the second voice), body (small lines) */
const G = { display: ['ad_ryogo_ub'], serif: ['ad_ryodisp_b'], body: ['ad_ryogo'] };          // graphic Gothic (Ryo Gothic)
const POP = { display: ['ad_logojr'], serif: ['ad_ryogo_ub'], body: ['ad_ryogo'] };           // pop, heavy
const CUTE = { display: ['ad_logomaru'], serif: ['ad_komu_d'], body: ['ad_shs'] };           // round, cute
const MIN = { display: ['ad_ryodisp_b'], serif: ['ad_ten'], body: ['ad_tsukua'] };           // Mincho, editorial
const LIT = { display: ['ad_tsukua'], serif: ['ad_ryodisp_m'], body: ['ad_tsukua'] };        // literary, quiet
const HAND = { display: ['ad_enpitsu_b'], serif: ['ad_tenant'], body: ['ad_enpitsu'] };      // handwriting
const ANTQ = { display: ['ad_tenant_h'], serif: ['ad_ryodisp_b'], body: ['ad_shs'] };        // manga antique
const KOMU = { display: ['ad_komu_e'], serif: ['ad_tenant_h'], body: ['ad_shs'] };           // retro pop
const MAP = {
  noir: G, crimson: POP, caution: POP, magenta: POP, paper: MIN, hud: G, mint: G, specimen: MIN, transit: G, blueprint: G,
  rouge: ANTQ, mono: G, hrRuin: HAND, hrNightRec: G, hrCurse: ANTQ, sakura: CUTE, ocean: LIT, sunset: MIN, forest: LIT,
  vapor: KOMU, newsprint: MIN, synth80: KOMU, kraft: HAND, candy: CUTE, acid: POP, sumi: MIN, gold: MIN,
  bsSlam: POP, bsRefrain: CUTE, bsScale: G, bsBallad: LIT,
  edMincho: MIN, street: POP, tegaki: HAND, showa: KOMU, minimal: { display: ['ad_ryogo_h'], serif: ['ad_shs_l'], body: ['ad_ryogo'] },
};
for (const [k, f] of Object.entries(MAP)) if (J.STYLES[k]) J.STYLES[k].adobeFonts = f;

J.adobeReady = false;
/* load the built-in kit (once); on success the next plan uses the Adobe faces */
J.useAdobeKit = async (id = J.DEFAULT_ADOBE_KIT) => {
  try {
    await J.loadAdobeKit(id);
    // the kit marks <html> with wf-active once its faces are in (dynamic kits load them in chunks)
    const cl = () => document.documentElement.className;
    for (let i = 0; i < 60 && /wf-loading/.test(cl()) && !/wf-active/.test(cl()); i++) await new Promise(r => setTimeout(r, 500));
    J.adobeReady = /wf-active/.test(cl()) || !!(document.fonts && [...document.fonts].some(f => /source-han-sans-cjk-ja|ryo-display-plusn|vdl-logojr/i.test(f.family)));
  } catch (e) { J.adobeReady = false; }
  return J.adobeReady;
};
})();
