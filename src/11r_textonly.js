/* ============================================================
   JIZURA — テキストのみ (text-only styles)
   Every built-in style is text-only: no decorations, background graphics, HUD, texture, plates or shapes — just the lyric
   text. Planning is unchanged (layouts, motion, timing, colours are drawn exactly as before); the renderer only stops painting
   what is not text (see J.plainOn in 03_text.js and Renderer.frame / drawCut in 09_render.js).
   Styles registered by a later file (src/11s_*.js) are not touched, so they can still bring their own decoration.
   ============================================================ */
(() => {
'use strict';
for (const k of J.STYLE_ORDER) if (J.STYLES[k]) J.STYLES[k].textOnly = true;
})();
