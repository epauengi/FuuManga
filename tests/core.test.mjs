import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY, normalize, filterBooks, parseRoute, chapterTarget, loadState, saveState, validateState } from '../src/core.mjs';

const sampleBooks = [
  { id: 'md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', rawId: 'b8e88f44-8fe3-41b8-a391-335576f7ddcc', title: 'Truyện MangaDex mẫu', genres: ['Kỳ ảo', 'Phiêu lưu'], chapters: [{ id: '1', title: 'Chương 1' }] }
];

test('Vietnamese search and combined filters', () => {
  assert.equal(normalize(' ĐỜI THƯỜNG '), 'doi thuong');
  assert.equal(filterBooks(sampleBooks, 'MANGADEX', 'Kỳ ảo').length, 1);
  assert.equal(filterBooks(sampleBooks, 'MANGADEX', 'Tình cảm').length, 0);
  assert.equal(filterBooks(sampleBooks, 'khongco', 'Tất cả').length, 0);
});

test('routes validate malformed encoding, identifiers, chapter bounds', () => {
  for (const hash of ['#/%E0%A4%A', '#/library/extra', '#/read/invalid_id!/1']) {
    assert.equal(parseRoute(hash, sampleBooks).page, 'notFound');
  }
  assert.equal(parseRoute('#/', sampleBooks).page, 'home');
  assert.equal(parseRoute('#/library', sampleBooks).page, 'library');
  // Remote API routes
  assert.equal(parseRoute('#/book/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', sampleBooks).page, 'detail');
  assert.equal(parseRoute('#/book/ot-one-piece', sampleBooks).page, 'detail');
  assert.equal(parseRoute('#/read/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc/1', sampleBooks).page, 'reader');
  assert.equal(parseRoute('#/read/ot-one-piece/chap-1', sampleBooks).page, 'reader');
});

test('chapter navigation respects both ends', () => {
  assert.equal(chapterTarget(1,-1,3), null);
  assert.equal(chapterTarget(3,1,3), null);
  assert.equal(chapterTarget(1,1,3), 2);
});

test('saved state is validated and deduplicated', () => {
  assert.deepEqual(
    validateState({ saved:['bad-id','md-b8e88f44-8fe3-41b8-a391-335576f7ddcc','md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'], theme:'bogus' }, sampleBooks),
    { saved:['md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'], history:{}, theme:'dark' }
  );

  const remoteState = validateState({ saved: ['md-123456', 'ot-one-piece'] }, sampleBooks);
  assert.deepEqual(remoteState.saved, ['md-123456', 'ot-one-piece']);
});

test('corrupt/blocked storage falls back; valid state round trips', () => {
  const blocked = {getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
  assert.equal(loadState(blocked, sampleBooks).error,true);
  assert.equal(saveState(blocked,{}),false);
  assert.equal(loadState({getItem:()=>'{broken'}, sampleBooks).error,true);
  const memory = new Map();
  const storage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  const state = validateState({saved:['md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'],theme:'light'},sampleBooks);
  assert.equal(saveState(storage,state),true);
  assert.deepEqual(loadState(storage,sampleBooks).state,state);
  assert.equal(memory.size,1);
  assert.ok(memory.has(KEY));
});
