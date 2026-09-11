const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve('scripts/capture_master.js'), 'utf8');

// 1. Convert ESM to CJS header
let code = src.replace("import puppeteer from 'puppeteer-core'\nimport fs from 'fs'\nimport path from 'path'", 
`const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');`);

// 2. Point BASE_DIR to kings-grill-mobile-post-upgrade-audit/screenshots-after
code = code.replace("const BASE_DIR = path.resolve('kings-grill-mobile-ui-audit-v2.5.0-apex')",
`const BASE_DIR = path.resolve('kings-grill-mobile-post-upgrade-audit', 'screenshots-after');
const BEFORE_DIR = path.resolve('kings-grill-mobile-ui-audit-v2.5.0-apex');`);

// 3. Update captureShot function
const oldCaptureShot = `async function captureShot(page, folder, filename) {
  const targetPath = path.join(BASE_DIR, folder, filename)
  await page.screenshot({ path: targetPath })
  console.log(\`[OK] Saved: \${folder}/\${filename}\`)
}`;

const newCaptureShot = `async function captureShot(page, folder, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const afterFilename = \`\${base}_AFTER\${ext}\`;
  
  const subfolderPath = path.join(BASE_DIR, folder, afterFilename);
  await page.screenshot({ path: subfolderPath });
  
  const flatPath = path.join(BASE_DIR, afterFilename);
  fs.copyFileSync(subfolderPath, flatPath);
  
  const stats = fs.statSync(flatPath);
  console.log(\`[OK] Saved: \${folder}/\${afterFilename} (\${stats.size} bytes)\`);
}`;

code = code.replace(oldCaptureShot, newCaptureShot);

// 4. Update 22c & 22d scrolling
const old22c_22d = `  // 22c. Form Date & Pax
  await page.evaluate(() => {
    window.scrollTo({ top: 580, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
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

  // 22d. Form Bottom CTA
  await page.evaluate(() => {
    window.scrollTo({ top: 1200, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '14-customer-booking', '22d_customer_booking_form_bottom.png')`;

const new22c_22d = `  // 22c. Form Date & Pax (Refined scroll from patch)
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
  await captureShot(page, '14-customer-booking', '22d_customer_booking_form_bottom.png')`;

code = code.replace(old22c_22d, new22c_22d);

// 5. Update 22f & 22g
const old22f_22g = `  // 22f. Validation Error State
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tiếp tục'))
    if (submitBtn) submitBtn.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await page.evaluate(() => {
    window.scrollTo({ top: 220, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 200))
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

  // 22g. Filled State
  await page.evaluate(() => {
    const nameInp = document.querySelector('input[placeholder*="Họ và tên"]')
    const phoneInp = document.querySelector('input[placeholder*="Số điện thoại"]')
    if (nameInp) {
      nameInp.value = 'Chị Kim Hằng'
      nameInp.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (phoneInp) {
      phoneInp.value = '0988 776 655'
      phoneInp.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const quickDate = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Ngày mai'))
    if (quickDate) quickDate.click()

    window.scrollTo({ top: 200, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '14-customer-booking', '22g_customer_booking_filled_state.png')`;

const new22f_22g = `  // 22f. Validation Error State (Real empty submit trigger)
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
  await captureShot(page, '14-customer-booking', '22g_customer_booking_filled_state.png')`;

code = code.replace(old22f_22g, new22f_22g);

// 6. Update 23d & 23e scroll
const old23d_23e = `  // 23d. Public Bill Receipt Bottom (Totals)
  await page.evaluate(() => {
    window.scrollTo({ top: 1200, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
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

  // 23e. Public Bill Bottom Actions
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 300))
  await captureShot(page, '15-public-bill', '23e_public_bill_bottom_actions.png')`;

const new23d_23e = `  // 23d. Public Bill Receipt Bottom (Totals) (Refined from patch)
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
    const scrollContainer = document.querySelector('.w-full.max-w-\\\\[480px\\\\].overflow-y-auto') ||
      document.querySelector('div[class*="overflow-y-auto"]') || document.documentElement;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight || 2000;
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await captureShot(page, '15-public-bill', '23e_public_bill_bottom_actions.png')`;

code = code.replace(old23d_23e, new23d_23e);

// 7. Update Dialogs 24 - 31 transition from Public Bill back to App
const oldDialogsIntro = `  // ====================================================
  // GROUP N — DIALOGS & SPECIAL STATES (24 - 31)
  // ====================================================
  console.log('\\n--- Capturing GROUP N: Modals & Dialog States ---')

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 400))`;

const newDialogsIntro = `  // ====================================================
  // GROUP N — DIALOGS & SPECIAL STATES (24 - 31)
  // ====================================================
  console.log('\\n--- Capturing GROUP N: Modals & Dialog States ---')

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
  await new Promise(r => setTimeout(r, 800));`;

code = code.replace(oldDialogsIntro, newDialogsIntro);

// 8. Output file path
fs.writeFileSync(path.resolve('scripts/capture_after_matrix.cjs'), code, 'utf8');
console.log('✅ Generated scripts/capture_after_matrix.cjs successfully!');
