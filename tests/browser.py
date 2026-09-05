"""Run against preview_start fuumanga: python -X utf8 tests/browser.py."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5173'
OUT = Path(__file__).parent / 'evidence'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1050}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def go(route='/'):
        page.goto(BASE + '/#' + route)
        page.wait_for_load_state('networkidle')
    def count(n):
        expect(page.locator('.book-card')).to_have_count(n)
    go()
    count(6)
    search = page.get_by_role('searchbox', name='Tìm truyện theo tên')
    for query in ['Người giữ', 'NGUOI GIU', 'người GIỮ']:
        search.fill(query)
        count(1)
    page.get_by_role('button', name='Tình cảm', exact=True).click()
    count(0)
    page.get_by_role('button', name='Xóa bộ lọc').click()
    count(6)
    go('/library')
    expect(page.get_by_text('Kệ sách đang chờ bạn')).to_be_visible()
    go('/book/nguoi-giu-sao')
    page.get_by_role('button', name='Lưu vào thư viện').click()
    page.reload()
    expect(page.get_by_role('button', name='Đã lưu truyện')).to_have_attribute('aria-pressed','true')
    go('/library')
    count(1)
    go('/book/nguoi-giu-sao')
    page.get_by_role('button', name='Đã lưu truyện').click()
    go('/library')
    count(0)
    go('/book/hem-nho-mua-ha')
    expect(page.locator('a[href^="#/read/"]')).to_have_count(0)
    for chapter in range(1,4):
        go(f'/read/nguoi-giu-sao/{chapter}')
        expect(page.locator('.manga-page')).to_have_count(3)
        if chapter == 1:
            expect(page.get_by_role('button',name='← Chương trước')).to_be_disabled()
        page.locator('.manga-page').nth(2).scroll_into_view_if_needed()
        page.wait_for_function("JSON.parse(localStorage.getItem('fuumanga.v1')).history['nguoi-giu-sao'].page === 2")
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.locator('.reader-page')).to_have_text('Trang 3 / 3')
    assert page.locator('.manga-page').nth(2).bounding_box()['y'] < 600
    go()
    page.locator('.continue-card').click()
    expect(page.locator('select')).to_have_value('3')
    page.get_by_label('Chọn chương').select_option('2')
    expect(page.locator('select')).to_have_value('2')
    page.go_back()
    expect(page.locator('select')).to_have_value('3')
    page.go_forward()
    expect(page.locator('select')).to_have_value('2')
    for route in ['/read/nguoi-giu-sao/0','/read/nguoi-giu-sao/4','/%E0%A4%A','/book/missing']:
        go(route)
        expect(page.get_by_text('Đường dẫn hoặc chương truyện không hợp lệ.')).to_be_visible()
    go()
    page.get_by_role('button',name='Chuyển sang giao diện sáng').click()
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-theme','light')
    for theme in ['light','dark']:
        if theme == 'dark': page.get_by_role('button',name='Chuyển sang giao diện tối').click()
        for width in [375,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            for route,name in [('/','home'),('/book/nguoi-giu-sao','detail'),('/read/nguoi-giu-sao/1','reader'),('/library','library')]:
                go(route)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (theme,width,name)
                if name == 'home':
                    page.screenshot(path=str(OUT/f'{name}-{theme}-{width}.png'),full_page=True)
            print(f'PASS {theme} {width}: home/detail/reader/library overflow')
    go()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.keyboard.press('Tab')
    expect(page.locator('.skip-link')).to_be_focused()
    page.keyboard.press('Enter')
    expect(page.locator('main')).to_be_focused()
    assert page.evaluate("getComputedStyle(document.documentElement).scrollBehavior") == 'auto'
    assert page.evaluate("getComputedStyle(document.querySelector('.hero-cover')).animationName") == 'none'
    page.evaluate("localStorage.setItem('fuumanga.v1', '{broken')")
    page.reload()
    expect(page.locator('.storage-warning')).to_be_visible()
    blocked = browser.new_context()
    blocked.add_init_script("Object.defineProperty(window, 'localStorage', {get(){throw new Error('blocked')}})")
    broken = blocked.new_page()
    broken.goto(BASE)
    expect(broken.locator('.storage-warning')).to_be_visible()
    broken.get_by_role('link',name='Khám phá câu chuyện').click()
    broken.get_by_role('button',name='Lưu vào thư viện').click()
    expect(broken.get_by_role('button',name='Đã lưu truyện')).to_be_visible()
    blocked.close()
    image_context = browser.new_context()
    image_context.route('**/art/cover-1.svg',lambda route: route.abort())
    fallback = image_context.new_page()
    fallback.goto(BASE)
    expect(fallback.locator('.hero-cover .art-fallback')).to_be_visible()
    image_context.close()
    assert not errors, errors
    browser.close()
    print('PASS search, filters, library persistence/removal, unavailable concepts, 3 chapters, page resume, history, Back/Forward, invalid routes, themes, keyboard, reduced motion, corrupt/blocked storage, image fallback; no page errors')
