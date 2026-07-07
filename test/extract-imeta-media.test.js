// L1 — pure unit tests for NIP-92 imeta media extraction (Story 7, ADR 0035). Kind 1
// ("plumbing"): no relays, no network. Written BEFORE implementation — RED until
// `api/_lib/media.js` exports `extractImetaMedia(tags)` returning a sanitized, deduped
// list of `{ url, kind: 'image' | 'video' }` descriptors built from the event's imeta tags.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractImetaMedia } = require('../api/_lib/media.js');

const BLO_VID = 'https://blossom.primal.net/1afa0e58be2c0ffeecafef00dba5eba11deadbeef0123456789abcdef01234567';
const BLO_IMG = 'https://blossom.primal.net/b00b1e5deadbeefcafef00d0123456789abcdeffeedface55aa00112233445566';

// A NIP-92 imeta tag: ['imeta', 'url <u>', 'm <mime>', …more space-delimited k/v fields].
const imeta = (...fields) => ['imeta', ...fields];

test('extracts a video attachment (m video/*) as kind "video"', () => {
  const out = extractImetaMedia([imeta(`url ${BLO_VID}`, 'm video/mp4', 'dim 1080x1920')]);
  assert.deepEqual(out, [{ url: BLO_VID, kind: 'video' }]);
});

test('extracts an image attachment (m image/*) as kind "image"', () => {
  const out = extractImetaMedia([imeta(`url ${BLO_IMG}`, 'm image/jpeg')]);
  assert.deepEqual(out, [{ url: BLO_IMG, kind: 'image' }]);
});

test('parses url + m regardless of field order and ignores unrelated fields', () => {
  const out = extractImetaMedia([
    imeta('blurhash LKO2', 'dim 800x600', 'x deadbeef', `url ${BLO_VID}`, 'm video/webm', 'fallback https://x'),
  ]);
  assert.deepEqual(out, [{ url: BLO_VID, kind: 'video' }]);
});

test('skips an imeta with no m field (type cannot be classified)', () => {
  assert.deepEqual(extractImetaMedia([imeta(`url ${BLO_VID}`, 'dim 1x1')]), []);
});

test('skips an imeta whose m is neither image/* nor video/*', () => {
  const out = extractImetaMedia([
    imeta(`url ${BLO_VID}`, 'm audio/mpeg'),
    imeta(`url ${BLO_IMG}`, 'm application/pdf'),
  ]);
  assert.deepEqual(out, []);
});

test('drops a non-http(s) url (e.g. data:) — http(s) only, mirroring safePicUrl', () => {
  const out = extractImetaMedia([imeta('url data:video/mp4;base64,AAAA', 'm video/mp4')]);
  assert.deepEqual(out, []);
});

test('dedupes by URL across multiple imeta tags', () => {
  const out = extractImetaMedia([
    imeta(`url ${BLO_VID}`, 'm video/mp4'),
    imeta(`url ${BLO_VID}`, 'm video/mp4'),
  ]);
  assert.deepEqual(out, [{ url: BLO_VID, kind: 'video' }]);
});

test('preserves order across a mix of image and video attachments', () => {
  const out = extractImetaMedia([
    imeta(`url ${BLO_IMG}`, 'm image/png'),
    imeta(`url ${BLO_VID}`, 'm video/mp4'),
  ]);
  assert.deepEqual(out, [
    { url: BLO_IMG, kind: 'image' },
    { url: BLO_VID, kind: 'video' },
  ]);
});

test('ignores non-imeta tags and tolerates empty / missing tag arrays', () => {
  assert.deepEqual(extractImetaMedia([['t', 'bitcoin'], ['p', 'ab'.repeat(32)]]), []);
  assert.deepEqual(extractImetaMedia([]), []);
  assert.deepEqual(extractImetaMedia(undefined), []);
});
