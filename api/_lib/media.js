'use strict';

// NIP-92 imeta media extraction (Story 7, ADR 0035). Resolves the type of a note's media
// attachments from their `imeta` tags, so the client can embed extension-less Blossom URLs
// (content-hash paths carry no file extension) it could not classify from the URL alone.
//
// An imeta tag is: ['imeta', 'url <u>', 'm <mime>', …more space-delimited "key value" fields].
// We emit one sanitized `{ url, kind: 'image' | 'video' }` per attachment that has both a
// http(s) url and an image/* or video/* mime, deduped by url, order preserved. Pure; never throws.
function extractImetaMedia(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  const seen = new Set();

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag[0] !== 'imeta') continue;

    let url = '';
    let mime = '';
    // Fields after the tag name are "key value" strings, in any order.
    for (let i = 1; i < tag.length; i++) {
      const field = typeof tag[i] === 'string' ? tag[i] : '';
      const sp = field.indexOf(' ');
      if (sp === -1) continue;
      const key = field.slice(0, sp);
      const val = field.slice(sp + 1).trim();
      if (key === 'url') url = val;
      else if (key === 'm') mime = val;
    }

    // http(s) only (mirrors safePicUrl); classify by mime prefix.
    if (!/^https?:\/\//.test(url)) continue;
    const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : '';
    if (!kind) continue;

    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, kind });
  }

  return out;
}

module.exports = { extractImetaMedia };
