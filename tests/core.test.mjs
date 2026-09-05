import test from 'node:test';
import assert from 'node:assert/strict';
import { books } from '../src/catalog.js';
import { KEY, normalize, filterBooks, parseRoute, chapterTarget, loadState, saveState, validateState } from '../src/core.mjs';

test('Vietnamese search and combined filters', () => {
  assert.equal(normalize(' ĐỜI THƯỜNG '), 'doi thuong');
  assert.equal(filterBooks(books, 'NGUOI GIU', 'Kỳ ảo').length, 1);
  assert.equal(filterBooks(books, 'NGUOI GIU', 'Tình cảm').length, 0);
  assert.equal(filterBooks(books, 'khongco', 'Tất cả').length, 0);
});

test('routes validate malformed encoding, identifiers, chapter bounds', () => {
  for (const hash of ['#/%E0%A4%A', '#/library/extra', '#/read/nguoi-giu-sao/0', '#/read/nguoi-giu-sao/4', '#/read/hem-nho-mua-ha/1', '#/read/nguoi-giu-sao/1.5']) {
    assert.equal(parseRoute(hash, books).page, 'notFound');
  }
  assert.equal(parseRoute('#/', books).page, 'home');
  assert.equal(parseRoute('#/library', books).page, 'library');
  assert.equal(parseRoute('#/book/nguoi-giu-sao', books).page, 'detail');
  assert.equal(parseRoute('#/read/nguoi-giu-sao/3', books).chapter, 3);
  // Remote source routes
  assert.equal(parseRoute('#/book/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', books).page, 'detail');
  assert.equal(parseRoute('#/book/ot-one-piece', books).page, 'detail');
  assert.equal(parseRoute('#/read/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc/chap-1', books).page, 'reader');
});

test('chapter navigation respects both ends', () => {
  assert.equal(chapterTarget(1,-1,3), null);
  assert.equal(chapterTarget(3,1,3), null);
  assert.equal(chapterTarget(1,1,3), 2);
});

test('saved state is validated and deduplicated', () => {
  assert.deepEqual(validateState({ saved:['bad-id','nguoi-giu-sao','nguoi-giu-sao'], theme:'bogus', history:{'nguoi-giu-sao':{ chapter:1,page:99,at:1 }} }, books), { saved:['nguoi-giu-sao'], history:{}, theme:'dark' });
  const h = {chapter:3,page:2,at:1};
  assert.deepEqual(validateState({history:{'nguoi-giu-sao':h}},books).history['nguoi-giu-sao'],h);
  // Remote items preservation in state
  const remoteState = validateState({ saved: ['md-123456', 'ot-one-piece'] }, books);
  assert.deepEqual(remoteState.saved, ['md-123456', 'ot-one-piece']);
});

test('corrupt/blocked storage falls back; valid state round trips', () => {
  const blocked = {getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
  assert.equal(loadState(blocked, books).error,true);
  assert.equal(saveState(blocked,{}),false);
  assert.equal(loadState({getItem:()=>'{broken'}, books).error,true);
  const memory = new Map();
  const storage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
  const state = validateState({saved:['nguoi-giu-sao'],theme:'light'},books);
  assert.equal(saveState(storage,state),true);
  assert.deepEqual(loadState(storage,books).state,state);
  assert.equal(memory.size,1);
  assert.ok(memory.has(KEY));
});
