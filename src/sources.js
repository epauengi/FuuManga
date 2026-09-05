export const SOURCES = {
  ALL: 'all',
  MD: 'md',
  OT: 'ot'
};

export const SOURCE_LABELS = {
  [SOURCES.ALL]: 'Tất cả nguồn',
  [SOURCES.MD]: 'MangaDex (Tiếng Việt)',
  [SOURCES.OT]: 'OTruyen'
};

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

const MD_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? '/api/mangadex'
  : 'https://api.mangadex.org';

const OT_BASE = 'https://otruyenapi.com/v1/api';
const OT_IMG = 'https://img.otruyenapi.com/uploads/comics';

const cache = new Map();

export async function fetchCatalog({ source = SOURCES.ALL, query = '', genre = 'Tất cả' } = {}) {
  const tasks = [];

  if (source === SOURCES.ALL || source === SOURCES.MD) {
    tasks.push(getMangaDexCatalog(query, genre));
  }
  if (source === SOURCES.ALL || source === SOURCES.OT) {
    tasks.push(getOTruyenCatalog(query, genre));
  }

  const results = await Promise.allSettled(tasks);
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return items;
}

export async function fetchBook(id) {
  if (cache.has(id)) return cache.get(id);

  const [src, rawId] = splitId(id);
  let book = null;

  if (src === SOURCES.MD) {
    book = await fetchMangaDexBook(rawId);
  } else if (src === SOURCES.OT) {
    book = await fetchOTruyenBook(rawId);
  }

  if (book) {
    cache.set(book.id, book);
  }
  return book;
}

export async function fetchChapterPages(bookId, chapterId) {
  const [src] = splitId(bookId);

  if (src === SOURCES.MD) {
    const res = await fetch(`${MD_BASE}/at-home/server/${chapterId}`);
    if (!res.ok) throw new Error(`Lỗi máy chủ ảnh MangaDex (${res.status})`);
    const json = await res.json();
    const { baseUrl, chapter } = json;
    const pages = (chapter.data || []).map(file => `${baseUrl}/data/${chapter.hash}/${file}`);
    return {
      type: 'image',
      images: pages
    };
  }

  if (src === SOURCES.OT) {
    throw new Error('Máy chủ ảnh OTruyen (sv1.otruyencdn.com) đang bảo trì/gián đoạn. Vui lòng đọc truyện từ nguồn MangaDex.');
  }

  throw new Error('Nguồn truyện không xác định');
}

export function splitId(id) {
  if (!id) return [SOURCES.MD, ''];
  if (id.startsWith('md-')) return [SOURCES.MD, id.slice(3)];
  if (id.startsWith('ot-')) return [SOURCES.OT, id.slice(3)];
  return [SOURCES.MD, id];
}

async function getMangaDexCatalog(query, genre) {
  try {
    const params = new URLSearchParams({
      limit: '18',
      'availableTranslatedLanguage[]': 'vi',
      'includes[]': 'cover_art',
      'order[latestUploadedChapter]': 'desc'
    });
    if (query) params.set('title', query);

    const res = await fetch(`${MD_BASE}/manga?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();

    const books = (json.data || []).map(m => {
      const coverRel = m.relationships?.find(r => r.type === 'cover_art');
      const cover = coverRel?.attributes?.fileName
        ? `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.256.jpg`
        : '';

      const titleObj = m.attributes.title || {};
      const title = titleObj.vi || titleObj.en || Object.values(titleObj)[0] || 'Truyện MangaDex';

      const descObj = m.attributes.description || {};
      const description = descObj.vi || descObj.en || Object.values(descObj)[0] || 'Truyện từ MangaDex có bản dịch tiếng Việt.';

      const tags = (m.attributes.tags || [])
        .map(t => t.attributes?.name?.en)
        .filter(Boolean)
        .slice(0, 3);

      return {
        id: `md-${m.id}`,
        rawId: m.id,
        source: SOURCES.MD,
        sourceLabel: 'MangaDex',
        title,
        subtitle: 'Bản dịch Tiếng Việt trên MangaDex',
        author: 'Cộng đồng dịch giả MangaDex',
        genres: tags.length ? tags : ['Manga', 'Tiếng Việt'],
        cover,
        color: '#a9e6ce',
        description,
        chaptersCount: 'Nhiều chương · Đọc ngay'
      };
    });

    if (genre && genre !== 'Tất cả') {
      const gNorm = genre.toLowerCase();
      return books.filter(b => b.genres.some(g => g.toLowerCase().includes(gNorm)));
    }
    return books;
  } catch {
    return [];
  }
}

async function fetchMangaDexBook(mangaId) {
  try {
    const [mangaRes, chapRes] = await Promise.all([
      fetch(`${MD_BASE}/manga/${mangaId}?includes[]=cover_art`),
      fetch(`${MD_BASE}/chapter?manga=${mangaId}&translatedLanguage[]=vi&order[chapter]=asc&limit=100`)
    ]);

    if (!mangaRes.ok) return null;
    const { data: m } = await mangaRes.json();
    const chapsJson = chapRes.ok ? await chapRes.json() : { data: [] };

    const coverRel = m.relationships?.find(r => r.type === 'cover_art');
    const cover = coverRel?.attributes?.fileName
      ? `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.512.jpg`
      : '';

    const titleObj = m.attributes.title || {};
    const title = titleObj.vi || titleObj.en || Object.values(titleObj)[0] || 'Truyện MangaDex';

    const descObj = m.attributes.description || {};
    const description = descObj.vi || descObj.en || Object.values(descObj)[0] || '';

    const tags = (m.attributes.tags || []).map(t => t.attributes?.name?.en).filter(Boolean);

    const chapters = (chapsJson.data || []).map((c, i) => {
      const num = c.attributes?.chapter || String(i + 1);
      const name = c.attributes?.title;
      return {
        id: c.id,
        chapterNum: num,
        title: name ? `Chương ${num}: ${name}` : `Chương ${num}`
      };
    });

    return {
      id: `md-${m.id}`,
      rawId: m.id,
      source: SOURCES.MD,
      sourceLabel: 'MangaDex',
      title,
      subtitle: 'MangaDex · Bản dịch Tiếng Việt',
      author: 'Cộng đồng dịch giả MangaDex',
      genres: tags.length ? tags : ['Manga'],
      cover,
      color: '#a9e6ce',
      description,
      chapters
    };
  } catch {
    return null;
  }
}

async function getOTruyenCatalog(query, genre) {
  try {
    const url = query
      ? `${OT_BASE}/tim-kiem?keyword=${encodeURIComponent(query)}`
      : `${OT_BASE}/danh-sach/truyen-moi?page=1`;

    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const items = json.data?.items || [];

    const books = items.map(item => ({
      id: `ot-${item.slug}`,
      rawId: item.slug,
      source: SOURCES.OT,
      sourceLabel: 'OTruyen',
      title: item.name,
      subtitle: 'OTruyen · Kho truyện tranh',
      author: (item.author && item.author[0]) || 'Đang cập nhật',
      genres: (item.category || []).map(c => c.name).slice(0, 3),
      cover: item.thumb_url ? `${OT_IMG}/${item.thumb_url}` : '',
      color: '#edbb97',
      description: 'Dữ liệu truyện từ kho OTruyen.',
      chaptersCount: `${item.chaptersLatest?.[0]?.chapter_name || 'Nhiều'} chương`,
      warning: 'Máy chủ ảnh chương OTruyen đang bảo trì'
    }));

    if (genre && genre !== 'Tất cả') {
      const gNorm = genre.toLowerCase();
      return books.filter(b => b.genres.some(g => g.toLowerCase().includes(gNorm)));
    }
    return books;
  } catch {
    return [];
  }
}

async function fetchOTruyenBook(slug) {
  try {
    const res = await fetch(`${OT_BASE}/truyen-tranh/${slug}`);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json.data?.item;
    if (!item) return null;

    const serverData = item.chapters?.[0]?.server_data || [];
    const chapters = serverData.map(c => ({
      id: c.chapter_name,
      chapterNum: c.chapter_name,
      title: `Chương ${c.chapter_name}${c.chapter_title ? ': ' + c.chapter_title : ''}`,
      apiData: c.chapter_api_data
    }));

    return {
      id: `ot-${item.slug}`,
      rawId: item.slug,
      source: SOURCES.OT,
      sourceLabel: 'OTruyen',
      title: item.name,
      subtitle: 'OTruyen · Kho truyện tranh',
      author: Array.isArray(item.author) ? item.author.join(', ') : (item.author || 'Đang cập nhật'),
      genres: (item.category || []).map(c => c.name),
      cover: item.thumb_url ? `${OT_IMG}/${item.thumb_url}` : '',
      color: '#edbb97',
      description: item.content ? item.content.replace(/<[^>]*>/g, '') : '',
      warning: 'Máy chủ ảnh chương của OTruyen (sv1.otruyencdn.com) hiện đang bảo trì/gián đoạn. Bạn có thể lưu vào thư viện hoặc xem trước thông tin.',
      chapters
    };
  } catch {
    return null;
  }
}
