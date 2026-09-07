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

export const CATALOG_SOURCES = ['MangaDex', 'OTruyen'];

const MD_BASE = '/api/mangadex';
const OT_BASE = '/api/otruyen';
const OT_IMG = 'https://img.otruyenapi.com/uploads/comics';
// ponytail: only OTruyen's current sv1 chapter endpoint; add a fixed host allowlist if it introduces another API host.
const OT_CHAPTER_HOST = 'sv1.otruyencdn.com';
const cache = new Map();

export function mangaDexAssetUrl(url) {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return url;
  return `/api/mangadex-image?url=${encodeURIComponent(url)}`;
}

export async function fetchCatalog({ query = '', genre = 'Tất cả' } = {}) {
  const sources = [
    ['MangaDex', () => getMangaDexCatalog(query, genre)],
    ['OTruyen', () => getOTruyenCatalog(query, genre)]
  ];
  const results = await Promise.allSettled(sources.map(([, load]) => load()));
  const items = [];
  const failedSources = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else failedSources.push(sources[index][0]);
  });

  return { items, failedSources };
}

export async function fetchBook(id) {
  if (cache.has(id)) return cache.get(id);

  const [source, rawId] = splitId(id);
  const book = source === 'md'
    ? await fetchMangaDexBook(rawId)
    : source === 'ot'
      ? await fetchOTruyenBook(rawId)
      : null;

  if (book) cache.set(book.id, book);
  return book;
}

export async function fetchChapterPages(book, chapterId) {
  const [source] = splitId(book?.id);

  if (source === 'md') return fetchMangaDexChapterPages(chapterId);
  if (source === 'ot') return fetchOTruyenChapterPages(book, chapterId);
  throw new Error('Không tìm thấy chương truyện yêu cầu');
}

export function splitId(id) {
  if (!id) return ['', ''];
  if (id.startsWith('md-')) return ['md', id.slice(3)];
  if (id.startsWith('ot-')) return ['ot', id.slice(3)];
  return ['', id];
}

async function getMangaDexCatalog(query, genre) {
  const params = new URLSearchParams({
    limit: '18',
    'availableTranslatedLanguage[]': 'vi',
    'includes[]': 'cover_art',
    'order[latestUploadedChapter]': 'desc'
  });
  if (query) params.set('title', query);

  const json = await fetchJson(`${MD_BASE}/manga?${params}`, 'MangaDex');
  const entries = requireArray(json.data, 'MangaDex', 'danh mục truyện');
  const books = entries.map(mapMangaDexCatalogItem).filter(Boolean);
  return filterGenre(books, genre);
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

async function getOTruyenCatalog(query, genre) {
  const url = query
    ? `${OT_BASE}/tim-kiem?keyword=${encodeURIComponent(query)}`
    : `${OT_BASE}/danh-sach/truyen-moi?page=1`;
  const json = await fetchJson(url, 'OTruyen');
  const data = requireObject(json.data, 'OTruyen', 'danh mục truyện');
  const items = requireArray(data.items, 'OTruyen', 'danh mục truyện');
  const books = items.map(mapOTruyenCatalogItem).filter(Boolean);
  return filterGenre(books, genre);
}

async function fetchOTruyenBook(slug) {
  const json = await fetchJson(`${OT_BASE}/truyen-tranh/${encodeURIComponent(slug)}`, 'OTruyen', { notFound: true });
  if (!json) return null;

  const item = requireObject(json.data?.item, 'OTruyen', 'thông tin truyện');
  const chapters = mapOTruyenChapters(item.chapters);

  return {
    id: `ot-${item.slug}`,
    rawId: item.slug,
    title: item.name || 'Truyện tranh',
    subtitle: 'Kho truyện tranh tuyển chọn',
    author: Array.isArray(item.author) ? item.author.join(', ') : (item.author || 'Đang cập nhật'),
    genres: Array.isArray(item.category) ? item.category.map(category => category?.name).filter(Boolean) : [],
    cover: item.thumb_url ? `${OT_IMG}/${item.thumb_url}` : '',
    color: '#edbb97',
    description: item.content ? item.content.replace(/<[^>]*>/g, '') : '',
    chapters
  };
}

async function fetchOTruyenChapterPages(book, chapterId) {
  const chapter = book?.chapters?.find(item => String(item.id) === String(chapterId));
  if (!chapter?.apiData) throw new Error('Không tìm thấy chương truyện yêu cầu');

  const json = await fetchJson(chapter.apiData, 'OTruyen');
  const data = requireObject(json.data, 'OTruyen', 'dữ liệu chương');
  const item = requireObject(data.item, 'OTruyen', 'dữ liệu chương');
  const domain = validHttpsUrl(data.domain_cdn);
  const chapterPath = typeof item.chapter_path === 'string' ? item.chapter_path.replace(/^\/+|\/+$/g, '') : '';
  const pages = requireArray(item.chapter_image, 'OTruyen', 'trang truyện');

  if (!domain || !chapterPath || !pages.length || pages.some(page => typeof page?.image_file !== 'string' || !page.image_file)) {
    throw providerError('OTruyen', 'Dữ liệu chương không hợp lệ');
  }

  const prefix = `${domain.replace(/\/+$/, '')}/${chapterPath}`;
  return {
    type: 'image',
    images: pages.map(page => `${prefix}/${encodeURIComponent(page.image_file)}`)
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

function mapOTruyenCatalogItem(item) {
  if (!item?.slug) return null;

  return {
    id: `ot-${item.slug}`,
    rawId: item.slug,
    title: item.name || 'Truyện tranh',
    subtitle: 'Kho truyện tranh tuyển chọn',
    author: Array.isArray(item.author) && item.author[0] ? item.author[0] : 'Đang cập nhật',
    genres: Array.isArray(item.category) ? item.category.map(category => category?.name).filter(Boolean).slice(0, 3) : [],
    cover: item.thumb_url ? `${OT_IMG}/${item.thumb_url}` : '',
    color: '#edbb97',
    description: 'Tuyển tập truyện tranh đặc sắc.',
    chaptersCount: `${item.chaptersLatest?.[0]?.chapter_name || 'Nhiều'} chương`
  };
}

function mapOTruyenChapters(groups) {
  if (!Array.isArray(groups)) return [];

  const seen = new Set();
  return groups.flatMap(group => Array.isArray(group?.server_data) ? group.server_data : [])
    .map((chapter, index) => {
      const number = String(chapter?.chapter_name || index + 1);
      const apiData = oTruyenChapterApiUrl(chapter?.chapter_api_data);
      if (!apiData || seen.has(number)) return null;
      seen.add(number);
      return {
        id: number,
        chapterNum: number,
        title: `Chương ${number}${chapter.chapter_title ? ': ' + chapter.chapter_title : ''}`,
        apiData
      };
    })
    .filter(Boolean);
}

function oTruyenChapterApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }

  const match = url.pathname.match(/^\/v1\/api\/chapter\/([a-f0-9]{24})$/i);
  if (url.protocol !== 'https:' || url.hostname !== OT_CHAPTER_HOST || url.username || url.password || url.search || url.hash || !match) {
    return '';
  }
  return `${OT_BASE}/chapter/${match[1]}`;
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

function filterGenre(books, genre) {
  if (!genre || genre === 'Tất cả') return books;
  const normalizedGenre = genre.toLowerCase();
  return books.filter(book => book.genres.some(item => item.toLowerCase().includes(normalizedGenre)));
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
