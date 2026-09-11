const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_DIR = path.resolve('kings-grill-mobile-post-upgrade-audit', 'screenshots-after');
const BEFORE_DIR = path.resolve('kings-grill-mobile-ui-audit-v2.5.0-apex');
const MANIFEST_PATH = path.join(BASE_DIR, 'SCREENSHOT_MANIFEST.md')

// Ensure subfolders exist
const subfolders = [
  '01-dashboard', '02-operations', '03-create-booking', '04-menu-deposit',
  '05-bill-preview', '06-timeline', '07-bottom-sheets', '08-floor-plan',
  '09-history', '10-analytics', '11-social-bot', '12-settings',
  '13-command-palette', '14-customer-booking', '15-public-bill', '16-dialogs-states'
]
for (const sf of subfolders) {
  const p = path.join(BASE_DIR, sf)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

const manifestEntries = []

function logManifest({ filename, folder, route, screen, theme, scroll, overlay, keyboard, purpose, notes }) {
  manifestEntries.push({
    filename, folder, route, screen, theme, scroll, overlay, keyboard, purpose, notes
  })
}

// Helper for keyboard injection
async function injectKeyboard(page, { isDark = false, inputSelector = '', returnText = 'Xong' } = {}) {
  await page.evaluate(({ isDark, inputSelector, returnText }) => {
    const existing = document.getElementById('simulated-ios-keyboard')
    if (existing) existing.remove()

    const kb = document.createElement('div')
    kb.id = 'simulated-ios-keyboard'
    kb.innerHTML = `
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        width: 390px;
        height: 290px;
        background: ${isDark ? '#1c1c1e' : '#d1d5db'};
        z-index: 999999999;
        display: flex;
        flex-direction: column;
        box-shadow: 0 -3px 14px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, sans-serif;
        user-select: none;
        box-sizing: border-box;
      ">
        <div style="height: 42px; display: flex; align-items: center; justify-content: space-around; border-bottom: 1px solid ${isDark ? '#2c2c2e' : '#c6c6c8'}; background: ${isDark ? '#2c2c2e' : '#e5e7eb'}; padding: 0 10px;">
          <div style="color: ${isDark ? '#ffffff' : '#1f2937'}; font-size: 14px; font-weight: 500;">"Nguyễn"</div>
          <div style="width: 1px; height: 20px; background: ${isDark ? '#3a3a3c' : '#d1d5db'};"></div>
          <div style="color: ${isDark ? '#ffffff' : '#1f2937'}; font-size: 14px; font-weight: 500;">"Hoàng"</div>
          <div style="width: 1px; height: 20px; background: ${isDark ? '#3a3a3c' : '#d1d5db'};"></div>
          <div style="color: ${isDark ? '#ffffff' : '#1f2937'}; font-size: 14px; font-weight: 500;">"Nam"</div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-around; padding: 4px 3px 6px;">
          <div style="display: flex; justify-content: center; gap: 5px;">
            ${['Q','W','E','R','T','Y','U','I','O','P'].map(k => `
              <div style="flex: 1; max-width: 32px; height: 40px; background: ${isDark ? '#636366' : '#ffffff'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 400; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">${k}</div>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: center; gap: 5px; padding: 0 14px;">
            ${['A','S','D','F','G','H','J','K','L'].map(k => `
              <div style="flex: 1; max-width: 33px; height: 40px; background: ${isDark ? '#636366' : '#ffffff'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 400; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">${k}</div>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: center; gap: 5px; padding: 0 3px;">
            <div style="width: 42px; height: 40px; background: ${isDark ? '#48484a' : '#b0b3b8'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">⇧</div>
            ${['Z','X','C','V','B','N','M'].map(k => `
              <div style="flex: 1; max-width: 32px; height: 40px; background: ${isDark ? '#636366' : '#ffffff'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 400; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">${k}</div>
            `).join('')}
            <div style="width: 42px; height: 40px; background: ${isDark ? '#48484a' : '#b0b3b8'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">⌫</div>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 5px; padding: 0 3px;">
            <div style="width: 42px; height: 40px; background: ${isDark ? '#48484a' : '#b0b3b8'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">123</div>
            <div style="width: 36px; height: 40px; background: ${isDark ? '#48484a' : '#b0b3b8'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">🌐</div>
            <div style="flex: 1; height: 40px; background: ${isDark ? '#636366' : '#ffffff'}; color: ${isDark ? '#fff' : '#000'}; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">Dấu cách</div>
            <div style="width: 78px; height: 40px; background: #007aff; color: #ffffff; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; box-shadow: 0 1px 0 rgba(0,0,0,0.35);">${returnText}</div>
          </div>
        </div>
        <div style="height: 14px; display: flex; align-items: center; justify-content: center;">
          <div style="width: 134px; height: 5px; background: ${isDark ? '#ffffff' : '#000000'}; border-radius: 100px;"></div>
        </div>
      </div>
    `
    document.body.appendChild(kb)

    if (inputSelector) {
      const inp = document.querySelector(inputSelector)
      if (inp) {
        inp.focus()
        inp.style.outline = '2px solid #2563eb'
        inp.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.25)'
        inp.scrollIntoView({ behavior: 'instant', block: 'center' })
      }
    }
  }, { isDark, inputSelector, returnText })
}

async function removeKeyboard(page) {
  await page.evaluate(() => {
    const kb = document.getElementById('simulated-ios-keyboard')
    if (kb) kb.remove()
  })
}

async function captureShot(page, folder, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const afterFilename = `${base}_AFTER${ext}`;
  
  const subfolderPath = path.join(BASE_DIR, folder, afterFilename);
  await page.screenshot({ path: subfolderPath });
  
  const flatPath = path.join(BASE_DIR, afterFilename);
  fs.copyFileSync(subfolderPath, flatPath);
  
  const stats = fs.statSync(flatPath);
  console.log(`[OK] Saved: ${folder}/${afterFilename} (${stats.size} bytes)`);
}

async function run() {
  console.log('🚀 Starting King\'s Grill Master Screenshot Audit Engine...')
  
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })

  // Inject getStores helper into window
  await page.evaluateOnNewDocument(() => {
    (window).getStores = () => {
      const vueApp = document.querySelector('#app')?.__vue_app__;
      const pinia = vueApp?.config?.globalProperties?.$pinia || 
        Object.getOwnPropertySymbols(vueApp?._context?.provides || {}).map(s => vueApp._context.provides[s]).find(p => p?._s);
      return {
        ui: pinia?._s?.get('ui'),
        app: pinia?._s?.get('app'),
        form: pinia?._s?.get('form'),
        config: pinia?._s?.get('config')
      };
    };
  })

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => {
    const stores = (window).getStores()
    return !!(stores && stores.ui)
  })

  // Seed realistic shift bookings into store
  await page.evaluate(() => {
    const { ui, app, form } = (window).getStores()
    
    // Clear initial toasts
    if (ui) ui.toasts = []

    const d = new Date()
    const todayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    
    // Ensure top 10 bookings in history have today's date and rich operational details
    if (app && app.historyList && app.historyList.length > 0) {
      const times = ['18:00', '18:15', '18:30', '19:00', '19:15', '19:30', '20:00', '20:30']
      const tables = ['A02', 'A05', 'VIP1', 'B03', 'A08', 'C02', 'B01', 'VIP2']
      const paxes = ['4', '15', '10', '6', '8', '2', '20', '5']
      const deposits = [500000, 2000000, 1000000, 0, 1000000, 0, 3000000, 500000]
      const paid = [true, true, true, false, true, false, true, true]
      
      for (let i = 0; i < Math.min(8, app.historyList.length); i++) {
        const order = app.historyList[i]
        if (order.parsedCustomer) {
          order.parsedCustomer.date = todayStr
          order.parsedCustomer.time = times[i % times.length]
          order.parsedCustomer.tables = tables[i % tables.length]
          order.parsedCustomer.pax = paxes[i % paxes.length]
          order.depositAmount = deposits[i % deposits.length]
          order.isDeposited = paid[i % paid.length]
        }
      }
    }

    // Populate create form with realistic customer order
    if (form) {
      form.customer.name = 'Nguyễn Hoàng Nam'
      form.customer.phone = '0908 123 456'
      form.customer.date = todayStr
      form.customer.time = '19:00'
      form.customer.pax = '6'
      form.customer.tables = 'A02'
      form.customer.type = 'Sinh nhật'
      form.customer.note = 'Bàn gần cửa sổ, chuẩn bị nến sinh nhật và bánh kem'
      form.deposit.amount = 1000000
      form.deposit.isPaid = true
      form.items = [
        { name: 'Bò Mỹ nướng tảng sốt tiêu', price: 450000, qty: 2, note: 'Chín vừa (medium)' },
        { name: 'Sườn cừu nướng thảo mộc', price: 580000, qty: 2, note: 'Ít muối' },
        { name: 'Salad cá hồi xông khói', price: 220000, qty: 1, note: '' },
        { name: 'Vang đỏ Chile Montes Alpha', price: 1200000, qty: 1, note: 'Ướp lạnh' }
      ]
    }
  })

  // ====================================================
  // GROUP A — APP SHELL (01 - 04)
  // ====================================================
  console.log('\n--- Capturing GROUP A: App Shell ---')

  // 01. Dashboard Summary Light
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'dashboard'
    ui.toasts = []
    ui.showSettingsHub = false
    ui.showCommandPalette = false
  })
  await new Promise(r => setTimeout(r, 400))
  await page.evaluate(() => {
    const el = document.querySelector('.custom-scrollbar') || window
    if (el.scrollTo) el.scrollTo({ top: 0 })
  })
  await captureShot(page, '01-dashboard', '01_dashboard_summary_light.png')
  logManifest({
    filename: '01_dashboard_summary_light.png',
    folder: '01-dashboard',
    route: '#/',
    screen: 'Tổng quan — Dashboard Summary',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Dashboard Summary metrics 2x2, AI input panel, and bottom navigation bar.',
    notes: 'Baseline capture of main landing view with no overlays.'
  })

  // 02. Dashboard Summary Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '01-dashboard', '02_dashboard_summary_dark.png')
  logManifest({
    filename: '02_dashboard_summary_dark.png',
    folder: '01-dashboard',
    route: '#/',
    screen: 'Tổng quan — Dashboard Summary',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Dashboard Summary metrics and contrast in True Dark Mode.',
    notes: 'Optimal for low-light night-shift restaurant operations.'
  })

  // 03. Operations Light (Top and Middle)
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'dashboard'
    ui.toasts = []
    const btns = Array.from(document.querySelectorAll('button'))
    const opBtn = btns.find(b => b.innerText.includes('ĐIỀU HÀNH CA'))
    if (opBtn) opBtn.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || document.documentElement
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await captureShot(page, '02-operations', '03a_operations_top_light.png')
  logManifest({
    filename: '03a_operations_top_light.png',
    folder: '02-operations',
    route: '#/',
    screen: 'Trung tâm điều hành / Operations',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Operations KPI bar (Tổng booking, lượng khách, sẵn sàng, cần xử lý, đang phục vụ) & filters.',
    notes: 'Real-time shift management top view.'
  })

  // 03b. Operations Bookings Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || document.documentElement
    container.scrollTo({ top: 220, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '02-operations', '03b_operations_booking_light.png')
  logManifest({
    filename: '03b_operations_booking_light.png',
    folder: '02-operations',
    route: '#/',
    screen: 'Trung tâm điều hành / Operations',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit CommandCenterCard booking cards, table badges, status matrix pills, and CTA "Đón khách".',
    notes: 'Thumb-zone audit for quick guest seating.'
  })

  // 04a & 04b. Operations Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const container = document.querySelector('.overflow-y-auto') || document.documentElement
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '02-operations', '04a_operations_top_dark.png')
  logManifest({
    filename: '04a_operations_top_dark.png',
    folder: '02-operations',
    route: '#/',
    screen: 'Trung tâm điều hành / Operations',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Operations KPI and filters in Dark Mode.',
    notes: 'Night shift high-contrast status checks.'
  })

  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || document.documentElement
    container.scrollTo({ top: 220, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '02-operations', '04b_operations_booking_dark.png')
  logManifest({
    filename: '04b_operations_booking_dark.png',
    folder: '02-operations',
    route: '#/',
    screen: 'Trung tâm điều hành / Operations',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Operations booking cards, status colors and action buttons in Dark Mode.',
    notes: 'Night-time ergonomics audit.'
  })

  // ====================================================
  // GROUP B — TẠO / CHỈNH SỬA PHIẾU (05 - 08)
  // ====================================================
  console.log('\n--- Capturing GROUP B: Create Booking & Menu ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'create'
    ui.toasts = []
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 400))

  // 05a. Create Customer Top Light
  await captureShot(page, '03-create-booking', '05a_create_customer_top_light.png')
  logManifest({
    filename: '05a_create_customer_top_light.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit AI input core, completion progress checklist widget, and form header.',
    notes: 'Top section of booking creation form.'
  })

  // 05b. Create Customer Middle Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 380
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '03-create-booking', '05b_create_customer_middle_light.png')
  logManifest({
    filename: '05b_create_customer_middle_light.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit customer form fields (Tên khách, SĐT, Ngày, Giờ, Số lượng khách, Khu vực/Bàn).',
    notes: 'Core input fields ergonomics and touch target spacing.'
  })

  // 05c. Create Customer Bottom Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 800
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '03-create-booking', '05c_create_customer_bottom_light.png')
  logManifest({
    filename: '05c_create_customer_bottom_light.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit form end, total calculation, sticky action bar, and bottom navigation.',
    notes: 'Sticky CTA verification on smartphone.'
  })

  // 05d. Create Customer Keyboard Open Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 350
  })
  await injectKeyboard(page, {
    isDark: false,
    inputSelector: 'input[placeholder*="Tên khách"]',
    returnText: 'Tiếp tục'
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '03-create-booking', '05d_create_customer_keyboard_light.png')
  await removeKeyboard(page)
  logManifest({
    filename: '05d_create_customer_keyboard_light.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Light',
    scroll: 'Middle (Focused)',
    overlay: 'Virtual Keyboard',
    keyboard: 'Open',
    purpose: 'Audit remaining viewport, field visibility, sticky CTA, and virtual keyboard obstruction.',
    notes: 'Crucial mobile keyboard usability test.'
  })

  // 06a, 06b, 06c. Create Customer Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '03-create-booking', '06a_create_customer_top_dark.png')
  logManifest({
    filename: '06a_create_customer_top_dark.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Create Booking top section in Dark Mode.',
    notes: 'Form contrast and input readability in dark theme.'
  })

  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 380
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '03-create-booking', '06b_create_customer_middle_dark.png')
  logManifest({
    filename: '06b_create_customer_middle_dark.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Customer form fields in Dark Mode.',
    notes: 'Check quick number badges and field inputs.'
  })

  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 800
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '03-create-booking', '06c_create_customer_bottom_dark.png')
  logManifest({
    filename: '06c_create_customer_bottom_dark.png',
    folder: '03-create-booking',
    route: '#/create',
    screen: 'Tạo phiếu — Thông tin khách',
    theme: 'Dark',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Create Booking bottom section and sticky bar in Dark Mode.',
    notes: 'Sticky bar contrast and button prominence.'
  })

  // 07a. Deposit Light
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 700
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '07a_deposit_light.png')
  logManifest({
    filename: '07a_deposit_light.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Tiền cọc (Deposit)',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit VietQR deposit manager, paid status toggle, and deposit amount buttons.',
    notes: 'Payment guarantee management on mobile.'
  })

  // 07b. Menu List Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 1050
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '07b_menu_list_light.png')
  logManifest({
    filename: '07b_menu_list_light.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Thực đơn món ăn',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Menu items editor with pre-selected dishes, prices, and quantities.',
    notes: 'Pre-order food list density check.'
  })

  // 07c. Dish Edit Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 1200
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '07c_dish_edit_light.png')
  logManifest({
    filename: '07c_dish_edit_light.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Chi tiết món ăn',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit single dish quantity steppers, special kitchen notes, and remove action.',
    notes: 'Food customization ergonomics.'
  })

  // 07d. Menu Bottom Light
  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 1600
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '07d_menu_bottom_light.png')
  logManifest({
    filename: '07d_menu_bottom_light.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Cuối thực đơn & Sticky CTA',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit sticky bottom total bar, "Cập nhật" action button, and mobile bottom navigation.',
    notes: 'Final step before saving or reviewing receipt.'
  })

  // 08a, 08b, 08c. Deposit & Menu Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 700
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '04-menu-deposit', '08a_deposit_dark.png')
  logManifest({
    filename: '08a_deposit_dark.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Tiền cọc (Deposit)',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Deposit manager in Dark Mode.',
    notes: 'VietQR card and paid status badge contrast.'
  })

  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 1050
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '08b_menu_list_dark.png')
  logManifest({
    filename: '08b_menu_list_dark.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Thực đơn món ăn',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Menu items editor in Dark Mode.',
    notes: 'Item rows and quantity buttons contrast.'
  })

  await page.evaluate(() => {
    const scrollEl = document.querySelector('.scroll-smooth') || document.querySelector('.overflow-y-auto')
    if (scrollEl) scrollEl.scrollTop = 1600
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '04-menu-deposit', '08c_menu_bottom_dark.png')
  logManifest({
    filename: '08c_menu_bottom_dark.png',
    folder: '04-menu-deposit',
    route: '#/create',
    screen: 'Tạo phiếu — Cuối thực đơn & Sticky CTA',
    theme: 'Dark',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit sticky bottom total bar in Dark Mode.',
    notes: 'Total sum visibility and CTA button.'
  })

  // ====================================================
  // GROUP C — PHIẾU / PREVIEW (09 - 10)
  // ====================================================
  console.log('\n--- Capturing GROUP C: Bill Preview ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'preview'
    ui.toasts = []
  })
  await new Promise(r => setTimeout(r, 500))

  // 09a. Bill Preview Top Light
  await captureShot(page, '05-bill-preview', '09a_bill_preview_top_light.png')
  logManifest({
    filename: '09a_bill_preview_top_light.png',
    folder: '05-bill-preview',
    route: '#/preview',
    screen: 'Xem trước phiếu in nhiệt K80',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit K80 receipt preview toolbar, zoom slider, red stamp "ĐÃ NHẬN CỌC", and export actions.',
    notes: 'Staff thermal print preview on smartphone.'
  })

  // 09b. Bill Preview Bottom Light
  await page.evaluate(() => {
    const previewContainer = document.querySelector('#bill-preview-container') || document.querySelector('.overflow-y-auto')
    if (previewContainer) previewContainer.scrollTop = 400
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '05-bill-preview', '09b_bill_preview_bottom_light.png')
  logManifest({
    filename: '09b_bill_preview_bottom_light.png',
    folder: '05-bill-preview',
    route: '#/preview',
    screen: 'Xem trước phiếu in nhiệt K80',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit K80 receipt totals, staff signature, and thermal paper cutoff.',
    notes: 'Ensures no content clipping at receipt bottom.'
  })

  // 10a & 10b. Bill Preview Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const previewContainer = document.querySelector('#bill-preview-container') || document.querySelector('.overflow-y-auto')
    if (previewContainer) previewContainer.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '05-bill-preview', '10a_bill_preview_top_dark.png')
  logManifest({
    filename: '10a_bill_preview_top_dark.png',
    folder: '05-bill-preview',
    route: '#/preview',
    screen: 'Xem trước phiếu in nhiệt K80',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit K80 receipt toolbar and preview in Dark Mode.',
    notes: 'Preview contrast in dark mode.'
  })

  await page.evaluate(() => {
    const previewContainer = document.querySelector('#bill-preview-container') || document.querySelector('.overflow-y-auto')
    if (previewContainer) previewContainer.scrollTop = 400
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '05-bill-preview', '10b_bill_preview_bottom_dark.png')
  logManifest({
    filename: '10b_bill_preview_bottom_dark.png',
    folder: '05-bill-preview',
    route: '#/preview',
    screen: 'Xem trước phiếu in nhiệt K80',
    theme: 'Dark',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit K80 receipt bottom in Dark Mode.',
    notes: 'Checks thermal bill contrast.'
  })

  // ====================================================
  // GROUP D — LỊCH / TIMELINE (11 - 12)
  // ====================================================
  console.log('\n--- Capturing GROUP D: Timeline ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'timeline'
    ui.toasts = []
    ui.showFloorPlan = false
  })
  await new Promise(r => setTimeout(r, 500))
  await captureShot(page, '06-timeline', '11_timeline_light.png')
  logManifest({
    filename: '11_timeline_light.png',
    folder: '06-timeline',
    route: '#/timeline',
    screen: 'Lịch đặt bàn theo mốc giờ (Timeline)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Date switcher, Zone pills (A, B, C, D, E), Table grid columns, Hour slots, Booking blocks, and Bottom Nav.',
    notes: 'NO MODALS OPEN. Clean baseline view of grid schedule.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '06-timeline', '12_timeline_dark.png')
  logManifest({
    filename: '12_timeline_dark.png',
    folder: '06-timeline',
    route: '#/timeline',
    screen: 'Lịch đặt bàn theo mốc giờ (Timeline)',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Timeline booking blocks in Dark Mode: Available (green), Booked (blue), Holding (amber).',
    notes: 'Night shift timeline visual clarity.'
  })

  // ====================================================
  // GROUP E — MORE / BOTTOM SHEETS (13)
  // ====================================================
  console.log('\n--- Capturing GROUP E: Bottom Sheets ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const btns = Array.from(document.querySelectorAll('button'))
    const moreBtn = btns.find(b => b.innerText.trim().includes('Thêm'))
    if (moreBtn) moreBtn.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '07-bottom-sheets', '13_more_menu_sheet_light.png')
  logManifest({
    filename: '13_more_menu_sheet_light.png',
    folder: '07-bottom-sheets',
    route: '#/',
    screen: 'Menu "Thêm" (Bottom Sheet)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Bottom Sheet ("Thêm")',
    keyboard: 'Closed',
    purpose: 'Audit Bottom Sheet backdrop, drag handle, shortcuts grid (Sơ đồ bàn, Lịch sử, Báo cáo, Cài đặt, Thực đơn, AI, Ngân hàng), and bottom nav behind.',
    notes: 'Direct audit of mobile sheet ergonomics.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '07-bottom-sheets', '13_more_menu_sheet_dark.png')
  logManifest({
    filename: '13_more_menu_sheet_dark.png',
    folder: '07-bottom-sheets',
    route: '#/',
    screen: 'Menu "Thêm" (Bottom Sheet)',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'Bottom Sheet ("Thêm")',
    keyboard: 'Closed',
    purpose: 'Audit Bottom Sheet in Dark Mode.',
    notes: 'Surface elevations and border subtleness in dark theme.'
  })

  // Quick Action Sheet (FAB in Create tab)
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'create'
    ui.toasts = []
    const moreBackdrop = document.querySelector('.bg-slate-900\\/50')
    if (moreBackdrop) (moreBackdrop).click()
  })
  await new Promise(r => setTimeout(r, 300))
  await page.evaluate(() => {
    const fab = document.querySelector('.quick-action-fab') || document.querySelector('.fa-layer-group')?.parentElement
    if (fab) fab.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '07-bottom-sheets', '13b_quick_action_sheet.png')
  logManifest({
    filename: '13b_quick_action_sheet.png',
    folder: '07-bottom-sheets',
    route: '#/create',
    screen: 'Menu Thao tác nhanh (FAB Action Sheet)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Bottom Sheet (FAB Action)',
    keyboard: 'Closed',
    purpose: 'Audit Floating Action Button action sheet (Tạo mới, Đã cọc, Copy xác nhận, Gửi phiếu, Lưu Cloud, In phiếu, Tải PNG/PDF).',
    notes: 'Fast shift-action shortcuts.'
  })

  // Close any open bottom sheet
  await page.evaluate(() => {
    const backdrop = document.querySelector('.bg-slate-900\\/40') || document.querySelector('.bg-slate-900\\/50')
    if (backdrop) (backdrop).click()
  })
  await new Promise(r => setTimeout(r, 300))

  // ====================================================
  // GROUP F — SƠ ĐỒ BÀN (14)
  // ====================================================
  console.log('\n--- Capturing GROUP F: Floor Plan Modal ---')

  await page.evaluate(() => {
    const { ui, form } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    if (form) form.customer.tables = ''
    ui.showFloorPlan = true
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '08-floor-plan', '14a_floor_plan_unselected.png')
  logManifest({
    filename: '14a_floor_plan_unselected.png',
    folder: '08-floor-plan',
    route: '#/floor-plan',
    screen: 'Sơ đồ bàn (Floor Plan Modal)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Floor Plan Modal',
    keyboard: 'Closed',
    purpose: 'Audit Floor Plan table layout (Khu A, B, C, D, E), table status colors (available, occupied, reserved) when no table is selected.',
    notes: 'Initial table selection state.'
  })

  await page.evaluate(() => {
    const { form } = (window).getStores()
    if (form) form.customer.tables = 'A02'
    const tableBtns = Array.from(document.querySelectorAll('button'))
    const a2 = tableBtns.find(b => b.innerText.trim() === 'A2' || b.innerText.trim() === 'A02')
    if (a2) a2.click()
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '08-floor-plan', '14b_floor_plan_selected.png')
  logManifest({
    filename: '14b_floor_plan_selected.png',
    folder: '08-floor-plan',
    route: '#/floor-plan',
    screen: 'Sơ đồ bàn (Floor Plan Modal)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Floor Plan Modal',
    keyboard: 'Closed',
    purpose: 'Audit selected table state, table badge, CTA "Xác nhận chọn bàn", header, close button, and modal bottom.',
    notes: 'Active table selected state.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '08-floor-plan', '14c_floor_plan_dark.png')
  logManifest({
    filename: '14c_floor_plan_dark.png',
    folder: '08-floor-plan',
    route: '#/floor-plan',
    screen: 'Sơ đồ bàn (Floor Plan Modal)',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'Floor Plan Modal',
    keyboard: 'Closed',
    purpose: 'Audit Floor Plan in Dark Mode.',
    notes: 'Night theme floor map visibility.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showFloorPlan = false
  })
  await new Promise(r => setTimeout(r, 300))

  // ====================================================
  // GROUP G — LỊCH SỬ (15 - 16) - NO "THÊM" OVERLAY!
  // ====================================================
  console.log('\n--- Capturing GROUP G: History List (NO MORE SHEET) ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'history'
    ui.toasts = []
    ui.showFloorPlan = false
    ui.showSettingsHub = false
    ui.showCommandPalette = false
    const backdrops = document.querySelectorAll('.bg-slate-900\\/50, .bg-slate-900\\/40')
    backdrops.forEach(b => (b).click())
  })
  await new Promise(r => setTimeout(r, 500))

  // 15a. History Top Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '09-history', '15a_history_top_light.png')
  logManifest({
    filename: '15a_history_top_light.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History summary stats (Tổng booking, tổng khách, chờ xếp bàn, tỷ lệ cọc), search input, filter pills, and first booking cards.',
    notes: 'CRITICAL: Captured with More Sheet completely closed.'
  })

  // 15b. History Middle Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 380, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '09-history', '15b_history_middle_light.png')
  logManifest({
    filename: '15b_history_middle_light.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History booking cards, expanded details, action buttons (Sửa, Xóa, Copy Link Bill), and table codes.',
    notes: 'Scrollable record cards inspection.'
  })

  // 15c. History Bottom Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 900, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '09-history', '15c_history_bottom_light.png')
  logManifest({
    filename: '15c_history_bottom_light.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History lower list, pagination / infinite load, and bottom navigation.',
    notes: 'Bottom list view.'
  })

  // 16a, 16b, 16c. History Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '09-history', '16a_history_top_dark.png')
  logManifest({
    filename: '16a_history_top_dark.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History top stats and search in Dark Mode.',
    notes: 'Night mode search and stats audit.'
  })

  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 380, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '09-history', '16b_history_middle_dark.png')
  logManifest({
    filename: '16b_history_middle_dark.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History booking cards in Dark Mode with golden deposit badges and tags.',
    notes: 'Night theme card contrast.'
  })

  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 900, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '09-history', '16c_history_bottom_dark.png')
  logManifest({
    filename: '16c_history_bottom_dark.png',
    folder: '09-history',
    route: '#/history',
    screen: 'Lịch sử đặt bàn',
    theme: 'Dark',
    scroll: 'Bottom',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit History bottom in Dark Mode.',
    notes: 'Ensures bottom navigation is properly anchored.'
  })

  // ====================================================
  // GROUP H — BÁO CÁO / ANALYTICS (17 - 18) - NO "THÊM" OVERLAY!
  // ====================================================
  console.log('\n--- Capturing GROUP H: Analytics Dashboard (NO MORE SHEET) ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.tab = 'analytics'
    ui.toasts = []
    const backdrops = document.querySelectorAll('.bg-slate-900\\/50, .bg-slate-900\\/40')
    backdrops.forEach(b => (b).click())
  })
  await new Promise(r => setTimeout(r, 500))

  // 17a. Analytics KPI Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '10-analytics', '17a_analytics_kpi_light.png')
  logManifest({
    filename: '17a_analytics_kpi_light.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit Analytics sub-tabs (Tổng quan, Món ăn, Màn Bếp, CRM), date filter, and primary KPI cards (Doanh thu, Khách, Đơn, Cọc).',
    notes: 'CRITICAL: Captured with More Sheet completely closed.'
  })

  // 17b. Analytics Charts Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 380, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '10-analytics', '17b_analytics_charts_light.png')
  logManifest({
    filename: '17b_analytics_charts_light.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit revenue charts, 7-day performance trend bars, labels, and legends.',
    notes: 'Mobile chart readability and axis scaling.'
  })

  // 17c. Analytics Details Light
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 850, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '10-analytics', '17c_analytics_details_light.png')
  logManifest({
    filename: '17c_analytics_details_light.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit Top 5 best-selling dishes ranking table and staff performance metrics.',
    notes: 'Data density and vertical table scanning.'
  })

  // 18a, 18b, 18c. Analytics Dark
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '10-analytics', '18a_analytics_kpi_dark.png')
  logManifest({
    filename: '18a_analytics_kpi_dark.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit Analytics KPIs in Dark Mode.',
    notes: 'Revenue and guest count card contrast.'
  })

  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 380, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '10-analytics', '18b_analytics_charts_dark.png')
  logManifest({
    filename: '18b_analytics_charts_dark.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Dark',
    scroll: 'Middle',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit Analytics charts in Dark Mode.',
    notes: 'Chart bar colors and legend legibility.'
  })

  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto') || window
    container.scrollTo({ top: 850, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '10-analytics', '18c_analytics_details_dark.png')
  logManifest({
    filename: '18c_analytics_details_dark.png',
    folder: '10-analytics',
    route: '#/analytics',
    screen: 'Báo cáo & Thống kê doanh số (Analytics)',
    theme: 'Dark',
    scroll: 'Bottom',
    overlay: 'None (Menu "Thêm" Closed)',
    keyboard: 'Closed',
    purpose: 'Audit Top selling dishes and tables in Dark Mode.',
    notes: 'Dark theme table borders and text contrast.'
  })

  // ====================================================
  // GROUP I — SOCIAL AI BOT (19)
  // ====================================================
  console.log('\n--- Capturing GROUP I: Social AI Bot ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    ui.showSocialBotModal = true
  })
  await new Promise(r => setTimeout(r, 500))

  // 19a. Conversation Top
  await captureShot(page, '11-social-bot', '19a_social_bot_top.png')
  logManifest({
    filename: '19a_social_bot_top.png',
    folder: '11-social-bot',
    route: '#/social-bot',
    screen: 'Quản lý Social AI Bot (Fanpage)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Social Bot Modal',
    keyboard: 'Closed',
    purpose: 'Audit Social Bot header, AI 24/7 toggle badge, tab navigation (Hội thoại, Token, Thống kê), and customer thread list.',
    notes: 'Live Messenger intake management.'
  })

  await page.evaluate(() => {
    const convBtn = document.querySelector('button.w-full.p-3')
    if (convBtn) convBtn.click()
  })
  await new Promise(r => setTimeout(r, 400))

  // 19b. Conversation Messages List
  await captureShot(page, '11-social-bot', '19b_social_bot_conversation.png')
  logManifest({
    filename: '19b_social_bot_conversation.png',
    folder: '11-social-bot',
    route: '#/social-bot',
    screen: 'Quản lý Social AI Bot — Chat Feed',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'Social Bot Modal',
    keyboard: 'Closed',
    purpose: 'Audit chat message bubbles (Customer vs AI Bot responses, timestamps, sender badges, Handover switch).',
    notes: 'Live customer chat stream verification.'
  })

  // 19c. Composer
  await captureShot(page, '11-social-bot', '19c_social_bot_composer.png')
  logManifest({
    filename: '19c_social_bot_composer.png',
    folder: '11-social-bot',
    route: '#/social-bot',
    screen: 'Quản lý Social AI Bot — Composer',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'Social Bot Modal',
    keyboard: 'Closed',
    purpose: 'Audit staff reply composer input, "Gửi Thật" button, and handover controls.',
    notes: 'Human takeover reply bar.'
  })

  // 19d. Composer Keyboard Open
  await injectKeyboard(page, {
    isDark: false,
    inputSelector: 'input[placeholder*="Nhập tin nhắn để gửi"]',
    returnText: 'Gửi'
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '11-social-bot', '19d_social_bot_keyboard.png')
  await removeKeyboard(page)
  logManifest({
    filename: '19d_social_bot_keyboard.png',
    folder: '11-social-bot',
    route: '#/social-bot',
    screen: 'Quản lý Social AI Bot — Bàn phím mở',
    theme: 'Light',
    scroll: 'Bottom (Focused)',
    overlay: 'Virtual Keyboard',
    keyboard: 'Open',
    purpose: 'Audit live chat composer, send button, remaining message feed, and mobile virtual keyboard.',
    notes: 'Chat typing usability test.'
  })

  // 19e. Order Extraction Banner
  await captureShot(page, '11-social-bot', '19e_social_bot_order_extraction.png')
  logManifest({
    filename: '19e_social_bot_order_extraction.png',
    folder: '11-social-bot',
    route: '#/social-bot',
    screen: 'Quản lý Social AI Bot — Đơn bóc tách AI',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Social Bot Modal',
    keyboard: 'Closed',
    purpose: 'Audit AI real-time booking extraction banner ("ĐƠN BÓC TÁCH: Tên, SĐT, Số khách, Giờ tiệc, Bàn").',
    notes: 'NLU extraction banner inspection.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showSocialBotModal = false
  })
  await new Promise(r => setTimeout(r, 300))

  // ====================================================
  // GROUP J — SETTINGS (20)
  // ====================================================
  console.log('\n--- Capturing GROUP J: Settings Hub ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    ui.showSettingsHub = true
    ui.activeSettingModal = null
  })
  await new Promise(r => setTimeout(r, 500))

  // 20a. Settings Top
  await page.evaluate(() => {
    const container = document.querySelector('.custom-scrollbar') || document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '12-settings', '20a_settings_hub_top.png')
  logManifest({
    filename: '20a_settings_hub_top.png',
    folder: '12-settings',
    route: '#/settings',
    screen: 'Cài đặt hệ thống (Settings Hub)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Settings Hub Modal',
    keyboard: 'Closed',
    purpose: 'Audit Settings Hub header, Brand card (King\'s Grill), and Section 1 (Thực đơn, Nhân viên, Ngân hàng).',
    notes: 'Settings navigation menu top.'
  })

  // 20b. Settings Middle
  await page.evaluate(() => {
    const container = document.querySelector('.custom-scrollbar') || document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = 280
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '12-settings', '20b_settings_hub_middle.png')
  logManifest({
    filename: '20b_settings_hub_middle.png',
    folder: '12-settings',
    route: '#/settings',
    screen: 'Cài đặt hệ thống (Settings Hub)',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'Settings Hub Modal',
    keyboard: 'Closed',
    purpose: 'Audit Section 2 (Trí tuệ nhân tạo AI & Prompt, Quản lý Social Bot) and Section 3 (Thương hiệu, Dark Mode switch, Webhook).',
    notes: 'Settings items list middle.'
  })

  // 20c. Settings Bottom
  await page.evaluate(() => {
    const container = document.querySelector('.custom-scrollbar') || document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = 600
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '12-settings', '20c_settings_hub_bottom.png')
  logManifest({
    filename: '20c_settings_hub_bottom.png',
    folder: '12-settings',
    route: '#/settings',
    screen: 'Cài đặt hệ thống (Settings Hub)',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'Settings Hub Modal',
    keyboard: 'Closed',
    purpose: 'Audit Section 4 (Kiểm thử AI Benchmark, System Logs, Hướng dẫn) and Logout button.',
    notes: 'Settings menu end and session logout.'
  })

  // 20d. Settings Dark Mode
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (!ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    const container = document.querySelector('.custom-scrollbar') || document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = 0
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '12-settings', '20d_settings_hub_dark.png')
  logManifest({
    filename: '20d_settings_hub_dark.png',
    folder: '12-settings',
    route: '#/settings',
    screen: 'Cài đặt hệ thống (Settings Hub)',
    theme: 'Dark',
    scroll: 'Top',
    overlay: 'Settings Hub Modal',
    keyboard: 'Closed',
    purpose: 'Audit Settings Hub in Dark Mode.',
    notes: 'Night theme settings layout.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showSettingsHub = false
  })
  await new Promise(r => setTimeout(r, 300))

  // ====================================================
  // GROUP K — COMMAND PALETTE (21)
  // ====================================================
  console.log('\n--- Capturing GROUP K: Command Palette ---')

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    ui.showCommandPalette = true
  })
  await new Promise(r => setTimeout(r, 400))

  // 21a. Palette Initial
  await captureShot(page, '13-command-palette', '21a_command_palette_initial.png')
  logManifest({
    filename: '21a_command_palette_initial.png',
    folder: '13-command-palette',
    route: '#/',
    screen: 'Command Palette (Ctrl+K)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Command Palette Modal',
    keyboard: 'Closed',
    purpose: 'Audit Command Palette search bar, voice command button, and quick navigation shortcuts (/create, /today, /unpaid...).',
    notes: 'Initial state before typing.'
  })

  // 21b. Palette Keyboard Open
  await injectKeyboard(page, {
    isDark: false,
    inputSelector: '#palette-search',
    returnText: 'Tìm'
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '13-command-palette', '21b_command_palette_keyboard.png')
  await removeKeyboard(page)
  logManifest({
    filename: '21b_command_palette_keyboard.png',
    folder: '13-command-palette',
    route: '#/',
    screen: 'Command Palette — Bàn phím mở',
    theme: 'Light',
    scroll: 'Top (Focused)',
    overlay: 'Virtual Keyboard',
    keyboard: 'Open',
    purpose: 'Audit search input focus, virtual keyboard, and visible command items above keyboard.',
    notes: 'Fast typing ergonomics on mobile.'
  })

  // 21c. Palette Results
  await page.evaluate(() => {
    const inp = document.querySelector('#palette-search')
    if (inp) {
      inp.value = 'Nam'
      inp.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '13-command-palette', '21c_command_palette_results.png')
  logManifest({
    filename: '21c_command_palette_results.png',
    folder: '13-command-palette',
    route: '#/',
    screen: 'Command Palette — Kết quả tìm kiếm',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Command Palette Modal',
    keyboard: 'Closed',
    purpose: 'Audit live search matches for customer booking (customer name, phone, table code, date/time).',
    notes: 'Fast jump-to-booking interaction.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showCommandPalette = false
  })
  await new Promise(r => setTimeout(r, 300))

  // ====================================================
  // GROUP L — CUSTOMER BOOKING PORTAL (22)
  // ====================================================
  console.log('\n--- Capturing GROUP L: Customer Booking Portal (#/dat-ban) ---')

  await page.goto('http://localhost:5173/#/dat-ban', { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 600))

  // 22a. Hero Top
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await captureShot(page, '14-customer-booking', '22a_customer_booking_hero_top.png')
  logManifest({
    filename: '22a_customer_booking_hero_top.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn trực tuyến',
    theme: 'Light (Customer Portal)',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Customer portal brand banner (King\'s Grill Steakhouse & BBQ), restaurant address, hotline, and welcome greeting.',
    notes: 'Public customer landing view.'
  })

  // 22b. Form Customer Info
  await page.evaluate(() => {
    window.scrollTo({ top: 220, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '14-customer-booking', '22b_customer_booking_form_customer.png')
  logManifest({
    filename: '22b_customer_booking_form_customer.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Thông tin liên hệ',
    theme: 'Light',
    scroll: 'Middle (Contact)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Customer Name & Phone number fields, helper texts, and clear indicators.',
    notes: 'First interaction section.'
  })

  // 22c. Form Date & Pax (Refined scroll from patch)
  await page.evaluate(() => {
    const targetSection = document.getElementById('field-date');
    if (targetSection) {
      targetSection.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '14-customer-booking', '22c_customer_booking_form_datetime.png')
  logManifest({
    filename: '22c_customer_booking_form_datetime.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Thời gian & Số khách',
    theme: 'Light',
    scroll: 'Middle (Date/Pax)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Quick date pill selectors (Hôm nay, Ngày mai, Cuối tuần), time slots, and guest counter (+/- steppers).',
    notes: 'Time & party size booking friction audit.'
  })

  // 22d. Form Bottom CTA (Refined scroll from patch)
  await page.evaluate(() => {
    const container = document.getElementById('booking-scroll-container') || document.documentElement;
    if (container) container.scrollTop = container.scrollHeight || 1600;
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '14-customer-booking', '22d_customer_booking_form_bottom.png')
  logManifest({
    filename: '22d_customer_booking_form_bottom.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Ghi chú & CTA Tiếp tục',
    theme: 'Light',
    scroll: 'Bottom',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Party type chips (Sinh nhật, Liên hoan...), special note textarea, deposit terms, and "Tiếp tục kiểm tra" CTA.',
    notes: 'Submission action flow.'
  })

  // 22e. Keyboard Open on Customer Name
  await page.evaluate(() => {
    window.scrollTo({ top: 180, behavior: 'instant' })
  })
  await injectKeyboard(page, {
    isDark: false,
    inputSelector: 'input[placeholder*="Họ và tên"]',
    returnText: 'Tiếp tục'
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '14-customer-booking', '22e_customer_booking_keyboard.png')
  await removeKeyboard(page)
  logManifest({
    filename: '22e_customer_booking_keyboard.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Bàn phím mở',
    theme: 'Light',
    scroll: 'Middle (Focused)',
    overlay: 'Virtual Keyboard',
    keyboard: 'Open',
    purpose: 'Audit Customer portal field focus with virtual keyboard open.',
    notes: 'Ensures labels and field remain visible.'
  })

  // 22f. Validation Error State (Real empty submit trigger)
  await page.evaluate(() => {
    const container = document.getElementById('booking-scroll-container');
    if (container) container.scrollTop = 0;
    const bookerInput = document.getElementById('field-bookerName');
    const phoneInput = document.getElementById('field-phone');
    if (bookerInput) { bookerInput.value = ''; bookerInput.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInput) { phoneInput.value = ''; phoneInput.dispatchEvent(new Event('input', { bubbles: true })); }
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '14-customer-booking', '22f_customer_booking_validation_error.png')
  logManifest({
    filename: '22f_customer_booking_validation_error.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Trạng thái báo lỗi (Validation)',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'Validation Alerts',
    keyboard: 'Closed',
    purpose: 'Audit input validation error alerts (Red border, error helper messages under missing fields).',
    notes: 'Form validation error UX.'
  })

  // 22g. Filled State (Realistic inputs)
  await page.evaluate(() => {
    const container = document.getElementById('booking-scroll-container');
    if (container) container.scrollTop = 0;
    function setInput(id, val) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setInput('field-bookerName', 'Anh Hoàng Nam');
    setInput('field-hostName', 'Anh Nam (Chủ tiệc)');
    setInput('field-phone', '0912 345 678');
    setInput('field-date', '2026-09-15');
    setInput('field-time', '19:00');
    setInput('field-guestCount', '8');
    setInput('field-note', 'Bàn tiệc sinh nhật cạnh cửa sổ thoáng mát, chuẩn bị nến');
    const partyBtns = Array.from(document.querySelectorAll('button'));
    const bdayBtn = partyBtns.find((b) => b.textContent.includes('Sinh nhật'));
    if (bdayBtn) bdayBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '14-customer-booking', '22g_customer_booking_filled_state.png')
  logManifest({
    filename: '22g_customer_booking_filled_state.png',
    folder: '14-customer-booking',
    route: '#/dat-ban',
    screen: 'Cổng khách tự đặt bàn — Đã điền thông tin',
    theme: 'Light',
    scroll: 'Middle',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit fully filled booking form state with valid customer contact and chosen party options.',
    notes: 'Completed form state before review modal.'
  })

  // ====================================================
  // GROUP M — PUBLIC BILL (23)
  // ====================================================
  console.log('\n--- Capturing GROUP M: Public Bill (#/bill/...) ---')

  const sampleBillData = {
    id: 'KG-8899',
    timestamp: new Date().toISOString(),
    customer: {
      name: 'Anh Hoàng Nam',
      phone: '0908 123 456',
      date: '10/09/2026',
      time: '19:00',
      tables: 'A02',
      pax: '6',
      type: 'Sinh nhật',
      note: 'Chuẩn bị nến sinh nhật và bánh kem'
    },
    total: 4375000,
    deposit: {
      amount: 1000000,
      isPaid: true
    },
    items: [
      { name: 'Bò Mỹ nướng tảng sốt tiêu đen', price: 450000, qty: 2 },
      { name: 'Sườn cừu nướng thảo mộc King\'s', price: 580000, qty: 2 },
      { name: 'Salad cá hồi Nauy sốt bơ tỏi', price: 220000, qty: 1 },
      { name: 'Rượu vang đỏ Montes Alpha Chile', price: 1200000, qty: 1 },
      { name: 'Nước ngọt Coca Cola lon', price: 35000, qty: 4 }
    ],
    staff: { name: 'Minh Trí', phone: '0336667301' }
  }

  const encodedData = Buffer.from(JSON.stringify(sampleBillData), 'utf8').toString('base64')
  await page.goto(`http://localhost:5173/#/bill/KG-8899?data=${encodedData}`, { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 600))

  // 23a. Public Bill Top
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 200))
  await captureShot(page, '15-public-bill', '23a_public_bill_top.png')
  logManifest({
    filename: '23a_public_bill_top.png',
    folder: '15-public-bill',
    route: '#/bill/KG-8899',
    screen: 'Phiếu xác nhận đặt tiệc của khách (Public Bill)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit countdown timer banner ("Còn ... ngày ... giờ"), customer name, party date/time, Google Maps directions, and menu link.',
    notes: 'Top landing view of customer verification bill.'
  })

  // 23b. Public Bill Receipt Top
  await page.evaluate(() => {
    const el = document.querySelector('#bill-render')
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '15-public-bill', '23b_public_bill_receipt_top.png')
  logManifest({
    filename: '23b_public_bill_receipt_top.png',
    folder: '15-public-bill',
    route: '#/bill/KG-8899',
    screen: 'Phiếu xác nhận đặt tiệc — Đầu phiếu in',
    theme: 'Light',
    scroll: 'Middle (Receipt Header)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit thermal receipt header, restaurant logo, red stamp ("ĐÃ NHẬN CỌC"), customer details, and table assignment (A02).',
    notes: 'Checking stamp overlap and date/time typography.'
  })

  // 23c. Public Bill Receipt Middle (Dishes)
  await page.evaluate(() => {
    window.scrollTo({ top: 780, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '15-public-bill', '23c_public_bill_receipt_middle.png')
  logManifest({
    filename: '23c_public_bill_receipt_middle.png',
    folder: '15-public-bill',
    route: '#/bill/KG-8899',
    screen: 'Phiếu xác nhận đặt tiệc — Thực đơn món',
    theme: 'Light',
    scroll: 'Middle (Dishes Table)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit ordered dishes table on public receipt (Item name, quantity, unit price, total price, special notes).',
    notes: 'Receipt table column wrapping and alignment.'
  })

  // 23d. Public Bill Receipt Bottom (Totals) (Refined from patch)
  await page.evaluate(() => {
    const totalsEl = document.querySelector('.border-t-2.border-dashed.border-slate-300') || document.querySelector('#bill-render');
    if (totalsEl) {
      totalsEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '15-public-bill', '23d_public_bill_receipt_bottom.png')
  logManifest({
    filename: '23d_public_bill_receipt_bottom.png',
    folder: '15-public-bill',
    route: '#/bill/KG-8899',
    screen: 'Phiếu xác nhận đặt tiệc — Tổng tiền & Cọc',
    theme: 'Light',
    scroll: 'Bottom (Totals & Policy)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Subtotal, VAT calculation, Final total (4.375.000đ), Deposit deducted (1.000.000đ ĐÃ NHẬN), Remaining balance, and important notes policy.',
    notes: 'Deposit deduction clarity for guest.'
  })

  // 23e. Public Bill Bottom Actions (Refined from patch)
  await page.evaluate(() => {
    const scrollContainer = document.querySelector('.w-full.max-w-\\[480px\\].overflow-y-auto') ||
      document.querySelector('div[class*="overflow-y-auto"]') || document.documentElement;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight || 2000;
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '15-public-bill', '23e_public_bill_bottom_actions.png')
  logManifest({
    filename: '23e_public_bill_bottom_actions.png',
    folder: '15-public-bill',
    route: '#/bill/KG-8899',
    screen: 'Phiếu xác nhận đặt tiệc — Nút hành động',
    theme: 'Light',
    scroll: 'Bottom (Actions)',
    overlay: 'None',
    keyboard: 'Closed',
    purpose: 'Audit Download PNG Bill, Share button, Hotline assistance, and footer credits.',
    notes: 'Customer self-service actions.'
  })

  // ====================================================
  // GROUP N — DIALOGS & SPECIAL STATES (24 - 31)
  // ====================================================
  console.log('\n--- Capturing GROUP N: Modals & Dialog States ---')

  // Clear guest mode so AppLayout mounts properly
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('kg_guest_mode');
    } catch (e) {}
  });

  await page.goto('http://localhost:5173/#/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('kg_guest_mode');
      window.location.hash = '#/';
    } catch (e) {}
  });
  await new Promise(r => setTimeout(r, 800));

  // 24. Cancel Deposit Confirmation Dialog
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    if (ui.isDarkMode) ui.toggleDarkMode()
    ui.toasts = []
    ui.modal.confirm = {
      show: true,
      title: 'Xác Nhận Hủy Tiền Cọc',
      msg: 'Bạn có chắc chắn muốn hủy số tiền cọc 1.000.000đ cho đơn hàng của khách "Nguyễn Hoàng Nam"?',
      resolve: null
    }
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '24_cancel_deposit_dialog.png')
  logManifest({
    filename: '24_cancel_deposit_dialog.png',
    folder: '16-dialogs-states',
    route: '#/',
    screen: 'Dialog xác nhận hủy tiền cọc',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Confirm Modal',
    keyboard: 'Closed',
    purpose: 'Audit promise-based Confirmation Dialog (warning icon, clear message, HỦY BỎ and ĐỒNG Ý buttons).',
    notes: 'Destructive action confirmation check.'
  })

  // 25. Staff Selector Modal (On Save)
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.modal.confirm.show = false
    ui.showStaffSelector = true
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '25_staff_selector_modal.png')
  logManifest({
    filename: '25_staff_selector_modal.png',
    folder: '16-dialogs-states',
    route: '#/create',
    screen: 'Modal chọn người tạo phiếu (Staff Selector)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Staff Selector Modal',
    keyboard: 'Closed',
    purpose: 'Audit staff selection grid modal when saving a booking (Staff names, phone numbers, selection touch targets).',
    notes: 'Order attribution flow on mobile.'
  })

  // 26. Promise-based Alert Modal
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showStaffSelector = false
    ui.modal.alert = {
      show: true,
      title: 'Đồng Bộ Thành Công',
      msg: 'Dữ liệu đặt bàn đã được mã hóa và đồng bộ lên đám mây Cloudflare & Google Sheet an toàn.',
      resolve: null
    }
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '26_alert_modal.png')
  logManifest({
    filename: '26_alert_modal.png',
    folder: '16-dialogs-states',
    route: '#/',
    screen: 'Modal thông báo hệ thống (Alert Modal)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Alert Modal',
    keyboard: 'Closed',
    purpose: 'Audit system alert modal with info icon, bold headline, and "ĐÃ HIỂU" CTA button.',
    notes: 'Standard acknowledgement dialog.'
  })

  // 27. Delete Confirmation Modal
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.modal.alert.show = false
    ui.modal.confirm = {
      show: true,
      title: 'Xác Nhận Xóa Phiếu Đặt',
      msg: 'Hành động này sẽ xóa vĩnh viễn phiếu đặt bàn khỏi cơ sở dữ liệu. Bạn có chắc chắn không?',
      resolve: null
    }
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '27_confirm_modal.png')
  logManifest({
    filename: '27_confirm_modal.png',
    folder: '16-dialogs-states',
    route: '#/history',
    screen: 'Modal xác nhận xóa dữ liệu (Delete Dialog)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Confirm Modal',
    keyboard: 'Closed',
    purpose: 'Audit delete confirmation modal with danger styling and distinct cancel vs confirm button hierarchy.',
    notes: 'High-risk deletion guard.'
  })

  // 28. Booking Detail Modal
  await page.evaluate(() => {
    const { ui, app } = (window).getStores()
    ui.modal.confirm.show = false
    if (app && app.historyList && app.historyList.length > 0) {
      ui.selectedBooking = app.historyList[0]
      ui.showBookingDetailModal = true
    }
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '28_booking_detail_modal.png')
  logManifest({
    filename: '28_booking_detail_modal.png',
    folder: '16-dialogs-states',
    route: '#/operations',
    screen: 'Modal chi tiết phiếu đặt bàn (Booking Detail Modal)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Booking Detail Modal',
    keyboard: 'Closed',
    purpose: 'Audit quick booking detail inspect modal (Customer name, table, party size, dishes list, deposit, quick edit/delete/postpone actions).',
    notes: 'Operational card drill-down dialog.'
  })

  // 29. Offline & Toast System State
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showBookingDetailModal = false
    ui.selectedBooking = null
    ui.showToast('⚠️ Mất kết nối mạng! Ứng dụng đã chuyển sang chế độ Ngoại Tuyến (Offline-First). Dữ liệu sẽ lưu cục bộ.', 'warning', 15000)
    ui.showToast('✅ Đã lưu phiếu vào hàng đợi ngoại tuyến thành công.', 'success', 15000)
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '29_offline_toast_state.png')
  logManifest({
    filename: '29_offline_toast_state.png',
    folder: '16-dialogs-states',
    route: '#/',
    screen: 'Trạng thái thông báo Toast & Ngoại tuyến (Toast System)',
    theme: 'Light',
    scroll: 'Top',
    overlay: 'Toast Notifications (Offline / Success)',
    keyboard: 'Closed',
    purpose: 'Audit floating Toast notifications system (Warning & Success badges, progress bar, dismiss icon, stack order).',
    notes: 'Non-blocking system feedback verification.'
  })

  // 30. Customer Care Modal
  await page.evaluate(() => {
    const { ui, form } = (window).getStores()
    ui.toasts = []
    if (form) {
      ui.activeOrderForCare = {
        id: 'KG-CARE-01',
        depositAmount: 1000000,
        isDeposited: true,
        parsedCustomer: { ...form.customer },
        menuItems: [ ...form.items ]
      }
    }
    ui.showCustomerCareModal = true
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '30_customer_care_modal.png')
  logManifest({
    filename: '30_customer_care_modal.png',
    folder: '16-dialogs-states',
    route: '#/care',
    screen: 'Modal Chăm sóc khách & Gửi tin nhắn (Customer Care)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Customer Care Modal',
    keyboard: 'Closed',
    purpose: 'Audit Customer Care popup (Template messages, SMS/Zalo copy, QR deposit preview, follow-up actions).',
    notes: 'Guest communication center on mobile.'
  })

  // 31. Version Release Modal
  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showCustomerCareModal = false
    ui.showVersionModal = true
  })
  await new Promise(r => setTimeout(r, 400))
  await captureShot(page, '16-dialogs-states', '31_version_modal.png')
  logManifest({
    filename: '31_version_modal.png',
    folder: '16-dialogs-states',
    route: '#/version',
    screen: 'Modal thông tin phiên bản (v2.5.0-APEX Release)',
    theme: 'Light',
    scroll: 'Center',
    overlay: 'Version Modal',
    keyboard: 'Closed',
    purpose: 'Audit App version modal (Build hash, release notes, APEX architecture highlights, changelog).',
    notes: 'Application build verification modal.'
  })

  await page.evaluate(() => {
    const { ui } = (window).getStores()
    ui.showVersionModal = false
    ui.toasts = []
  })

  await browser.close()
  console.log('\n🎉 ALL SCREENSHOTS CAPTURED SUCCESSFULLY!')

  // ----------------------------------------------------
  // GENERATE SCREENSHOT_MANIFEST.MD
  // ----------------------------------------------------
  console.log('\n📝 Generating SCREENSHOT_MANIFEST.md...')

  let manifestContent = `# KING'S GRILL — MOBILE UI SCREENSHOT AUDIT MANIFEST
> **Phiên bản:** v2.5.0-APEX  
> **Viewport:** 390 × 844 CSS px (Retina 780 × 1688 px @2x DPR)  
> **Tổng số ảnh audit:** ${manifestEntries.length} screenshots  
> **Mục đích:** Bộ ảnh cơ sở (Baseline Audit Pack) phục vụ chuyên gia UX/UI phân tích công thái học, thumb zone, touch target, density, sticky bar, form, dark mode và virtual keyboard.

---

## MỤC LỤC 16 PHÂN HỆ

| Thư mục | Số lượng ảnh | Phân hệ / Màn hình |
|:---|:---:|:---|
| \`01-dashboard/\` | 2 | Tổng quan nhanh — Dashboard Summary (Light & Dark) |
| \`02-operations/\` | 4 | Trung tâm điều hành ca — Shift Operations (KPI, Lọc, Thẻ bàn, Đón khách) |
| \`03-create-booking/\` | 7 | Tạo phiếu — Thông tin khách (Top, Middle, Bottom, Bàn phím ảo, Dark) |
| \`04-menu-deposit/\` | 7 | Tạo phiếu — Tiền cọc & Thực đơn món ăn (VietQR, Món ăn, Sticky CTA, Dark) |
| \`05-bill-preview/\` | 4 | Xem trước phiếu in nhiệt K80 Cukcuk (Top, Bottom, Dark) |
| \`06-timeline/\` | 2 | Lịch đặt bàn theo mốc giờ — Timeline Schedule (Light & Dark) |
| \`07-bottom-sheets/\` | 3 | Menu "Thêm" Bottom Sheet & FAB Action Sheet (Light & Dark) |
| \`08-floor-plan/\` | 3 | Sơ đồ mặt bằng bàn — Floor Plan Modal (Chưa chọn, Đã chọn, Dark) |
| \`09-history/\` | 6 | Danh sách lịch sử đặt bàn — History (Top, Middle, Bottom, Dark - ĐÓNG MENU THÊM) |
| \`10-analytics/\` | 6 | Báo cáo & Thống kê doanh số — Analytics (KPI, Charts, Details, Dark - ĐÓNG MENU THÊM) |
| \`11-social-bot/\` | 5 | Quản lý Social AI Bot Messenger (Hội thoại, Tin nhắn, Composer, Bàn phím, Đơn bóc tách) |
| \`12-settings/\` | 4 | Trung tâm cài đặt — Settings Hub (Top, Middle, Bottom, Dark) |
| \`13-command-palette/\` | 3 | Hộp tìm kiếm nhanh — Command Palette Ctrl+K (Gốc, Bàn phím mở, Kết quả) |
| \`14-customer-booking/\` | 7 | Cổng khách tự đặt bàn trực tuyến #/dat-ban (Hero, Liên hệ, Ngày/giờ, Bàn phím, Báo lỗi, Đầy đủ) |
| \`15-public-bill/\` | 5 | Phiếu đặt trực tuyến của khách #/bill (Đếm ngược, Mộc đỏ, Thực đơn, Tổng tiền, Tải ảnh) |
| \`16-dialogs-states/\` | 8 | Trạng thái Modal & Dialog bổ sung (Hủy cọc, Chọn nhân viên, Alert, Confirm, Chi tiết, Toast...) |

---

## CHI TIẾT TỪNG ẢNH CHỤP (MANIFEST)

`

  for (let i = 0; i < manifestEntries.length; i++) {
    const item = manifestEntries[i]
    manifestContent += `### ${String(i + 1).padStart(2, '0')}. \`${item.folder}/${item.filename}\`
- **Filename:** \`${item.filename}\`
- **Folder:** \`${item.folder}/\`
- **Route:** \`${item.route}\`
- **Screen:** ${item.screen}
- **Theme:** ${item.theme}
- **Scroll position:** ${item.scroll}
- **Overlay:** ${item.overlay}
- **Keyboard:** ${item.keyboard}
- **Main purpose:** ${item.purpose}
- **Notes:** ${item.notes}

---

`
  }

  fs.writeFileSync(MANIFEST_PATH, manifestContent, 'utf-8')
  fs.writeFileSync(path.resolve('SCREENSHOT_MANIFEST.md'), manifestContent, 'utf-8')
  console.log('✅ Wrote SCREENSHOT_MANIFEST.md')
}

run().catch(err => {
  console.error('Fatal error in capture script:', err)
  process.exit(1)
})
