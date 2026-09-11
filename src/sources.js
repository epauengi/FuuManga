export const DEFAULT_GENRES = [
  'Tất cả',
  'Action',
  'Comedy',
  'Drama',
  'Fantasy',
  'Romance',
  'Slice of Life',
  'Sci-Fi',
  'Supernatural'
];

// ponytail: Bảng 8 tag cố định đối chiếu MangaDex tag UUID; nâng cấp fetch động /manga/tag khi cần danh mục mở rộng.
export const GENRE_TAG_MAP = {
  'Action': '391b0423-d847-456f-aff0-8b0cfc03066b',
  'Comedy': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
  'Drama': 'b9af3a63-f058-46de-a9a0-e0c13906197a',
  'Fantasy': 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
  'Romance': '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  'Slice of Life': 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
  'Sci-Fi': '256c8bd9-4904-4360-bf4f-508a76d67183',
  'Supernatural': 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75'
};

const MD_BASE = '/api/mangadex';
const cache = new Map();

export function mangaDexAssetUrl(url) {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return url;
  return `/api/mangadex-image?url=${encodeURIComponent(url)}`;
}

export async function fetchCatalog({ query = '', genre = 'Tất cả', offset = 0 } = {}) {
  return getMangaDexCatalog(query, genre, offset);
}

export async function fetchBook(id) {
  if (!id?.startsWith('md-')) return null;
  if (cache.has(id)) return cache.get(id);

  const book = await fetchMangaDexBook(id.slice(3));
  if (book) cache.set(book.id, book);
  return book;
}

export async function fetchChapterPages(book, chapterId) {
  if (!book?.id?.startsWith('md-')) throw new Error('Không tìm thấy chương truyện yêu cầu');
  return fetchMangaDexChapterPages(chapterId);
}

async function getMangaDexCatalog(query, genre, offset = 0) {
  const safeOffset = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0);
  if (safeOffset >= 10000) {
    return {
      items: [],
      total: 10000,
      offset: safeOffset,
      limit: 0,
      nextOffset: null,
      reachedLimit: true
    };
  }

  const limit = Math.min(18, 10000 - safeOffset);
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(safeOffset),
    'availableTranslatedLanguage[]': 'vi',
    'includes[]': 'cover_art',
    'order[latestUploadedChapter]': 'desc'
  });
  if (query) params.set('title', query);
  const tagId = GENRE_TAG_MAP[genre];
  if (tagId) params.append('includedTags[]', tagId);

  const json = await fetchJson(`${MD_BASE}/manga?${params}`, 'MangaDex');
  const entries = requireArray(json.data, 'MangaDex', 'danh mục truyện');
  const total = Number.isFinite(Number(json.total)) ? Math.max(0, Math.floor(Number(json.total))) : entries.length;
  const items = entries.map(mapMangaDexCatalogItem).filter(Boolean);
  const sourceCount = entries.length;
  const nextRawOffset = safeOffset + sourceCount;
  const nextOffset = (nextRawOffset < total && sourceCount > 0 && nextRawOffset < 10000)
    ? nextRawOffset
    : null;

  return {
    items,
    total,
    offset: safeOffset,
    limit,
    nextOffset,
    reachedLimit: nextRawOffset >= 10000 && total > 10000
  };
}

async function fetchMangaDexBook(mangaId) {
  const json = await fetchJson(`${MD_BASE}/manga/${encodeURIComponent(mangaId)}?includes[]=cover_art`, 'MangaDex', { notFound: true });
  if (!json) return null;

  const manga = requireObject(json.data, 'MangaDex', 'thông tin truyện');
  const chaptersJson = await fetchJson(
    `${MD_BASE}/chapter?manga=${encodeURIComponent(mangaId)}&translatedLanguage[]=vi&order[chapter]=asc&limit=100`,
    'MangaDex'
  );
  const chapterData = requireArray(chaptersJson.data, 'MangaDex', 'danh sách chương');
  const chapters = chapterData.map((chapter, index) => mapMangaDexChapter(chapter, index)).filter(Boolean);

  return {
    id: `md-${manga.id}`,
    rawId: manga.id,
    title: mangaTitle(manga.attributes),
    subtitle: 'Bản dịch Tiếng Việt đầy đủ',
    author: 'Đội ngũ biên dịch',
    genres: mangaTags(manga.attributes),
    cover: mangaDexCover(manga, '512'),
    color: '#a9e6ce',
    description: localizedText(manga.attributes?.description) || '',
    chapters
  };
}

async function fetchMangaDexChapterPages(chapterId) {
  const json = await fetchJson(`${MD_BASE}/at-home/server/${encodeURIComponent(chapterId)}`, 'MangaDex');
  const baseUrl = validHttpsUrl(json.baseUrl);
  const chapter = requireObject(json.chapter, 'MangaDex', 'dữ liệu chương');
  const hash = typeof chapter.hash === 'string' && chapter.hash;
  const files = requireArray(chapter.data, 'MangaDex', 'trang truyện');

  if (!baseUrl || !hash || !files.length || files.some(file => typeof file !== 'string' || !file)) {
    throw providerError('MangaDex', 'Dữ liệu chương không hợp lệ');
  }

  const prefix = baseUrl.replace(/\/+$/, '');
  return {
    type: 'image',
    images: files.map(file => mangaDexAssetUrl(`${prefix}/data/${encodeURIComponent(hash)}/${encodeURIComponent(file)}`))
  };
}

function mapMangaDexCatalogItem(manga) {
  if (!manga?.id || !manga.attributes) return null;

  return {
    id: `md-${manga.id}`,
    rawId: manga.id,
    title: mangaTitle(manga.attributes),
    subtitle: 'Bản dịch Tiếng Việt đầy đủ',
    author: 'Đội ngũ biên dịch',
    genres: mangaTags(manga.attributes),
    cover: mangaDexCover(manga, '256'),
    color: '#a9e6ce',
    description: localizedText(manga.attributes.description) || 'Bộ truyện tranh hấp dẫn.',
    chaptersCount: 'Nhiều chương · Đọc ngay'
  };
}

function mapMangaDexChapter(chapter, index) {
  if (!chapter?.id) return null;
  const number = chapter.attributes?.chapter || String(index + 1);
  const name = chapter.attributes?.title;
  return {
    id: chapter.id,
    chapterNum: number,
    title: name ? `Chương ${number}: ${name}` : `Chương ${number}`
  };
}

function mangaDexCover(manga, size) {
  const fileName = manga.relationships?.find(relationship => relationship.type === 'cover_art')?.attributes?.fileName;
  return fileName ? mangaDexAssetUrl(`https://uploads.mangadex.org/covers/${manga.id}/${fileName}.${size}.jpg`) : '';
}

function mangaTags(attributes) {
  const tags = Array.isArray(attributes?.tags)
    ? attributes.tags.map(tag => tag.attributes?.name?.en).filter(Boolean)
    : [];
  return tags.length ? tags : ['Manga', 'Truyện tranh'];
}

function mangaTitle(attributes) {
  const vietnameseAlternative = Array.isArray(attributes?.altTitles)
    ? attributes.altTitles.map(title => title?.vi).find(title => typeof title === 'string' && title)
    : '';
  return attributes?.title?.vi || vietnameseAlternative || localizedText(attributes?.title) || 'Truyện tranh';
}

function localizedText(value) {
  if (!value || typeof value !== 'object') return '';
  return value.vi || value.en || Object.values(value).find(text => typeof text === 'string' && text) || '';
}

async function fetchJson(url, provider, { notFound = false } = {}) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw providerError(provider, 'Không thể kết nối tới máy chủ');
  }

  if (notFound && response.status === 404) return null;
  if (!response.ok) throw providerError(provider, `Máy chủ phản hồi lỗi ${response.status}`);

  try {
    return await response.json();
  } catch {
    throw providerError(provider, 'Dữ liệu phản hồi không hợp lệ');
  }
}

function requireObject(value, provider, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw providerError(provider, `${label} không hợp lệ`);
  }
  return value;
}

function requireArray(value, provider, label) {
  if (!Array.isArray(value)) throw providerError(provider, `${label} không hợp lệ`);
  return value;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

function providerError(provider, message) {
  return new Error(`${provider}: ${message}. Vui lòng thử lại.`);
}
