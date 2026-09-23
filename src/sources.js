import { chapterSlug, slugify } from './core.mjs';

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

export const PAGE_SIZE = 24;

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
const slugCache = new Map();

export function mangaDexAssetUrl(url) {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return url;
  return `/api/mangadex-image?url=${encodeURIComponent(url)}`;
}

export async function fetchCatalog({ query = '', genre = 'Tất cả', offset = 0 } = {}) {
  return getMangaDexCatalog(query, genre, offset);
}

export async function fetchSavedBooks(savedIds, { signal } = {}) {
  if (!Array.isArray(savedIds)) return { items: [], unavailableIds: [] };

  const rawIds = [...new Set(savedIds
    .filter(id => typeof id === 'string' && /^md-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
    .map(id => id.slice(3)))];
  const found = new Map();

  for (let start = 0; start < rawIds.length; start += 100) {
    const batch = rawIds.slice(start, start + 100);
    const params = new URLSearchParams({
      limit: String(batch.length),
      'includes[]': 'cover_art'
    });
    for (const id of batch) params.append('ids[]', id);

    const json = await fetchJson(`${MD_BASE}/manga?${params}`, 'MangaDex', { signal });
    const requested = new Set(batch);
    for (const manga of requireArray(json.data, 'MangaDex', 'thư viện đã lưu')) {
      if (!requested.has(manga?.id)) continue;
      const book = mapMangaDexCatalogItem(manga);
      if (book) found.set(manga.id, book);
    }
  }

  return {
    items: rawIds.map(id => found.get(id)).filter(Boolean),
    unavailableIds: rawIds.filter(id => !found.has(id)).map(id => `md-${id}`)
  };
}

export async function fetchBook(idOrSlug) {
  if (!idOrSlug || typeof idOrSlug !== 'string' || idOrSlug.startsWith('ot-')) return null;
  if (cache.has(idOrSlug)) return cache.get(idOrSlug);

  let targetId = idOrSlug;
  if (slugCache.has(idOrSlug)) {
    targetId = slugCache.get(idOrSlug);
  }

  if (targetId.startsWith('md-')) {
    if (cache.has(targetId)) return cache.get(targetId);
    const book = await fetchMangaDexBook(targetId.slice(3));
    if (book) {
      cache.set(book.id, book);
      if (book.slug) {
        cache.set(book.slug, book);
        slugCache.set(book.slug, book.id);
      }
    }
    return book;
  }

  const query = idOrSlug.replace(/-/g, ' ').trim();
  if (!query) return null;

  const searchParams = new URLSearchParams({
    title: query,
    limit: '15',
    'availableTranslatedLanguage[]': 'vi',
    'includes[]': 'cover_art'
  });

  const json = await fetchJson(`${MD_BASE}/manga?${searchParams}`, 'MangaDex', { notFound: true });
  const candidates = Array.isArray(json?.data) ? json.data : [];
  if (!candidates.length) return null;

  const matched = candidates.find(item => {
    const primaryTitle = mangaTitle(item.attributes);
    if (slugify(primaryTitle) === idOrSlug) return true;
    if (Array.isArray(item.attributes?.altTitles)) {
      return item.attributes.altTitles.some(alt => {
        const altText = alt?.vi || alt?.en || Object.values(alt || {})[0];
        return altText && slugify(altText) === idOrSlug;
      });
    }
    return false;
  }) || candidates[0];

  if (!matched?.id) return null;

  const book = await fetchMangaDexBook(matched.id);
  if (book) {
    cache.set(book.id, book);
    if (book.slug) {
      cache.set(book.slug, book);
      slugCache.set(book.slug, book.id);
    }
    cache.set(idOrSlug, book);
  }
  return book;
}

export async function fetchChapterPages(book, chapterId, options) {
  if (!book?.id?.startsWith('md-')) throw new Error('Không tìm thấy chương truyện yêu cầu');
  return fetchMangaDexChapterPages(chapterId, options);
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

  const limit = Math.min(PAGE_SIZE, 10000 - safeOffset);
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
    `${MD_BASE}/chapter?manga=${encodeURIComponent(mangaId)}&translatedLanguage[]=vi&translatedLanguage[]=en&order[chapter]=asc&limit=100`,
    'MangaDex'
  );
  let chapterData = requireArray(chaptersJson.data, 'MangaDex', 'danh sách chương');
  const totalChapters = Number.isFinite(Number(chaptersJson.total)) ? Number(chaptersJson.total) : chapterData.length;
  if (totalChapters > 100) {
    const maxOffset = Math.min(totalChapters, 500);
    const pagesToFetch = [];
    for (let offset = 100; offset < maxOffset; offset += 100) {
      pagesToFetch.push(
        fetchJson(
          `${MD_BASE}/chapter?manga=${encodeURIComponent(mangaId)}&translatedLanguage[]=vi&translatedLanguage[]=en&order[chapter]=asc&limit=100&offset=${offset}`,
          'MangaDex'
        ).then(res => (Array.isArray(res?.data) ? res.data : [])).catch(() => [])
      );
    }
    if (pagesToFetch.length > 0) {
      const extraPages = await Promise.all(pagesToFetch);
      for (const extra of extraPages) {
        if (Array.isArray(extra) && extra.length > 0) {
          chapterData = chapterData.concat(extra);
        }
      }
    }
  }

  const deduplicated = deduplicateAndSortChapters(chapterData);
  const seenSlugs = new Map();
  const chapters = deduplicated.map((chapter, index) => {
    const mapped = mapMangaDexChapter(chapter, index);
    if (!mapped) return null;
    let s = mapped.slug;
    if (seenSlugs.has(s)) {
      const count = seenSlugs.get(s) + 1;
      seenSlugs.set(s, count);
      mapped.slug = `${s}-${count}`;
    } else {
      seenSlugs.set(s, 1);
    }
    return mapped;
  }).filter(Boolean);

  const id = `md-${manga.id}`;
  const title = mangaTitle(manga.attributes);
  const slug = slugify(title) || id;
  slugCache.set(slug, id);

  const hasEn = chapters.some(c => c.lang === 'en');
  const hasVi = chapters.some(c => c.lang === 'vi');
  const subtitle = hasEn && hasVi
    ? 'Bản dịch Tiếng Việt & Tiếng Anh bổ sung'
    : hasEn
      ? 'Bản dịch Tiếng Anh'
      : 'Bản dịch Tiếng Việt đầy đủ';

  return {
    id,
    slug,
    rawId: manga.id,
    title,
    subtitle,
    author: 'Đội ngũ biên dịch',
    genres: mangaTags(manga.attributes),
    cover: mangaDexCover(manga, '512'),
    color: '#a9e6ce',
    description: localizedText(manga.attributes?.description) || '',
    chapters
  };
}

async function fetchMangaDexChapterPages(chapterId, options) {
  const json = await fetchJson(`${MD_BASE}/at-home/server/${encodeURIComponent(chapterId)}`, 'MangaDex', options);
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

  const id = `md-${manga.id}`;
  const title = mangaTitle(manga.attributes);
  const slug = slugify(title) || id;
  slugCache.set(slug, id);

  return {
    id,
    slug,
    rawId: manga.id,
    title,
    subtitle: 'Bản dịch Tiếng Việt đầy đủ',
    author: 'Đội ngũ biên dịch',
    genres: mangaTags(manga.attributes),
    cover: mangaDexCover(manga, '256'),
    color: '#a9e6ce',
    description: localizedText(manga.attributes.description) || 'Bộ truyện tranh hấp dẫn.',
    chaptersCount: 'Nhiều chương · Đọc ngay'
  };
}

export function formatChapterDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function deduplicateAndSortChapters(chapterList) {
  if (!Array.isArray(chapterList)) return [];
  const map = new Map();

  for (const chapter of chapterList) {
    if (!chapter?.id) continue;
    // Lọc các chương liên kết ngoài (MangaPlus, Bilibili) không có trang ảnh trên MangaDex
    if (chapter.attributes?.externalUrl) continue;

    const rawNum = chapter.attributes?.chapter;
    const isNumbered = rawNum !== undefined && rawNum !== null && String(rawNum).trim() !== '';
    const parsedNum = isNumbered ? Number(rawNum) : null;
    const isFiniteNum = isNumbered && Number.isFinite(parsedNum);
    const key = isFiniteNum ? `num:${parsedNum}` : `special:${chapter.id}`;

    const lang = chapter.attributes?.translatedLanguage === 'en' ? 'en' : 'vi';
    const rawDate = chapter.attributes?.publishAt || chapter.attributes?.readableAt || chapter.attributes?.createdAt || '';
    const time = rawDate ? new Date(rawDate).getTime() : 0;
    const safeTime = Number.isFinite(time) ? time : 0;

    const candidate = {
      chapter,
      lang,
      time: safeTime,
      sortKey: isFiniteNum ? parsedNum : 999999
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
    } else {
      // 1. Tiếng Việt ưu tiên cao hơn và ghi đè Tiếng Anh
      if (existing.lang === 'en' && lang === 'vi') {
        map.set(key, candidate);
      } else if (existing.lang === lang) {
        // 2. Cùng ngôn ngữ: chọn bản dịch phát hành mới hơn
        if (safeTime > existing.time) {
          map.set(key, candidate);
        }
      }
      // 3. Nếu existing là 'vi' mà candidate là 'en' thì giữ nguyên 'vi'
    }
  }

  // Sắp xếp tăng dần theo số chương, sau đó theo thời gian phát hành
  return Array.from(map.values())
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.time - b.time;
    })
    .map(item => item.chapter);
}

function mapMangaDexChapter(chapter, index) {
  if (!chapter?.id) return null;
  const number = chapter.attributes?.chapter || String(index + 1);
  const name = chapter.attributes?.title;
  const rawDate = chapter.attributes?.publishAt || chapter.attributes?.readableAt || chapter.attributes?.createdAt || '';
  const lang = chapter.attributes?.translatedLanguage === 'en' ? 'en' : 'vi';
  return {
    id: chapter.id,
    chapterNum: number,
    slug: chapterSlug(number, index),
    title: name ? `Chương ${number}: ${name}` : `Chương ${number}`,
    rawDate,
    date: formatChapterDate(rawDate),
    lang
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

async function fetchJson(url, provider, { notFound = false, signal } = {}) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
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
