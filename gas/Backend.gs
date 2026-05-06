/**
 * KING'S GRILL MANAGER AI - BACKEND V3.6.0 (SMART INIT & SYNC SYNERGY)
 * ---------------------------------------------------------------------
 * AUTHOR: DMT - HTML (Principal Architect)
 * FEATURES: Hybrid-Cloud Menu, SSR PDF, Auto-Cleanup, Smart Parsing,
 *           Visual Calendar Sync, Config Persistence
 * 
 * [REQUIRED CONFIGURATION]
 * Services: Enable "Google Sheets API" (Sheets) & "Google Drive API" (Drive)
 */

const CONFIG = {
  FOLDER_ID: "1aiD98xKRX13ECLpw9wvI9hmLIKyGNE-_",
  SS_ID: "1TCVdHWwve9xHmBC89QYZnbrmhrhDsqin9S9jtZRj-r8",
  LINKED_CALENDAR_ID: '1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY',
  TEMPLATE_SHEET_NAME: '[RS]📅2025',
  ZONE_MAPPING: { 'A': 1, 'B': 3, 'C': 5, 'D': 7, 'E': 9, 'F': 11, 'G': 13 },
  SHEET_NAME_ORDERS: "Orders",
  SHEET_NAME_KEYS: "API_Keys",
  SHEET_NAME_CONFIG: "System_Config",
  ADMIN_PASS: null, // Loaded at runtime from Script Properties (see getAdminPass_())
  ORDER_HEADERS: [
    "Mã Phiếu (ID)", "Thời Gian Tạo", "Khách Hàng", "Số Điện Thoại",
    "Dữ Liệu Tổng Hợp (JSON)", "Tổng Tiền", "Mức Cọc", "Tình Trạng Cọc",
    "Link Ảnh Cọc (Drive)", "Link Phiếu Đặt (Drive)"
  ],
  KEY_HEADERS: ["Timestamp", "Provider", "Model", "Key", "Status"],
  CONFIG_HEADERS: ["Config_Key", "Config_Value"]
};

// --- PHẦN 0: HELPER ---
function initSheetIfNeeded_(ss, sheetName, headers, bgColor) {
  if (!ss) {
    if (typeof console !== 'undefined') console.error("LỖI: Tránh chạy trực tiếp hàm này vì thiếu Data!");
    return null;
  }
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight("bold").setBackground(bgColor || "#f3f4f6").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    let isMismatch = false;
    for (let i = 0; i < headers.length; i++) {
      if (currentHeaders[i] !== headers[i]) { isMismatch = true; break; }
    }
    if (isMismatch) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
           .setFontWeight("bold").setBackground(bgColor || "#f3f4f6").setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/** Get admin password — tries Script Properties first, falls back to hardcoded default */
function getAdminPass_() {
  try {
    const pass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
    if (pass) return pass;
  } catch(e) { /* Script Properties not available, use default */ }
  return 'ADMINDMT';
}

// --- PHẦN 1: ROUTING ---
function doGet(e) {
  if (!e || !e.parameter) return HtmlService.createHtmlOutput("King's Grill Backend V3.6.0 Active.");
  const action = e.parameter.action;
  if (action === "getMenu") return jsonResponse(getMenuData(e.parameter.sheetName));
  if (action === "getMenuSheets") return jsonResponse(getMenuSheets());
  if (action === "getHistory") return jsonResponse(getHistoryData());
  if (action === "getOrder") return jsonResponse(getOrderById(e.parameter.id));
  return HtmlService.createHtmlOutput("Backend Ready.");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonResponse({ok: false, message: "Server busy, try again."});
  try {
    if (!e || !e.postData) return jsonResponse({ok: false, message: "No post data"});
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result = {};
    switch (action) {
      case "saveOrder": result = saveOrder(data.data); break;
      case "deleteOrder": result = deleteOrder(data.id, data.password); break;
      case "getHistory": result = getHistoryData(); break;
      case "getMenuSheets": result = getMenuSheets(); break;
      case "getMenu": result = getMenuData(data.sheetName); break;
      case "createMenu": result = createNewMenuSheet(data.name, data.rawText, data.password); break;
      case "deleteMenu": result = deleteMenuSheet(data.name, data.password); break;
      case "uploadMenuImage": result = uploadMenuImage(data.sheetName, data.base64, data.password); break;
      case "uploadDishImage": result = uploadDishImage(data.dishId, data.base64, data.password); break;
      case "saveConfig": result = saveSystemConfig(data, data.password); break;
      case "getConfig": result = getSystemConfig(); break;
      case "renderPreview": result = renderPreview(data.data); break;
      case "saveApiKey": result = saveApiKey(data.provider, data.model, data.key, data.password); break;
      case "saveApiKeys": result = saveApiKeys(data.keys, data.password); break;
      case "borrowApiKeys": result = getSharedApiKeys(data.password); break;
      default: result = { ok: false, message: "Unknown Action" };
    }
    return jsonResponse({ok: true, ...result});
  } catch (err) {
    return jsonResponse({ok: false, message: err.toString()});
  } finally {
    lock.releaseLock();
  }
}

// --- PHẦN 2: MENU ---
function getMenuSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const menuSheets = ss.getSheets().map(s => s.getName()).filter(n => n.toLowerCase().includes("menu"));
  return { ok: true, sheets: menuSheets };
}

function getMenuData(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  let target = sheetName;
  if (!target) {
    const firstMenu = ss.getSheets().find(s => s.getName().toLowerCase().includes("menu"));
    target = firstMenu ? firstMenu.getName() : "Menu";
  }
  const sheet = ss.getSheetByName(target);
  if (!sheet) return { ok: false, message: "Sheet not found", data: [] };
  try {
    const rows = sheet.getRange("A2:E").getValues().filter(r => r[0]);
    const menu = rows.map(r => ({
      name: r[0], price: Number(r[1]) || 0, acronym: r[2], cleanName: r[3], desc: r[4] || ""
    }));
    return { ok: true, data: menu };
  } catch (e) {
    return { ok: false, message: "Lỗi tải Menu: " + e.message, data: [] };
  }
}

function createNewMenuSheet(name, rawText, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để tạo Menu." };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheetName = name.toLowerCase().includes("menu") ? name : `Menu - ${name}`;
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) { sheet.clear(); } else { sheet = ss.insertSheet(sheetName); }
  const menuHeaders = ["Name", "Price", "Acronym", "CleanName", "Description"];
  sheet.getRange(1, 1, 1, 5).setValues([menuHeaders]);
  sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#bbf7d0").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  const rows = parseMenuRawData(rawText);
  if (rows.length > 0) { sheet.getRange(2, 1, rows.length, 5).setValues(rows); }
  return { ok: true, message: "Menu Updated Successfully", sheetName: sheetName };
}

function deleteMenuSheet(name, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để xóa Menu." };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) return { ok: false, message: "Không tìm thấy sheet Menu này." };
  
  const menuSheets = ss.getSheets().filter(s => s.getName().toLowerCase().includes("menu"));
  if (menuSheets.length <= 1) {
    return { ok: false, message: "Không thể xóa Menu cuối cùng của hệ thống." };
  }
  
  ss.deleteSheet(sheet);
  return { ok: true, message: "Xóa Menu thành công." };
}

function uploadMenuImage(sheetName, base64, password) {
  if (password !== getAdminPass_()) return { ok: false, message: "Từ chối truy cập!" };
  const img = uploadImageToDrive(base64, `Menu_${sheetName}_${Date.now()}.jpg`);
  if (!img.url) return { ok: false, message: "Lỗi upload ảnh" };
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CONFIG, CONFIG.CONFIG_HEADERS, "#e9d5ff");
  const key = `menuImage_${sheetName}`;
  const rows = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) { sheet.getRange(i + 1, 2).setValue(img.url); found = true; break; }
  }
  if (!found) { sheet.appendRow([key, img.url]); }
  
  return { ok: true, url: img.url, message: "Upload ảnh Menu thành công!" };
}

function uploadDishImage(dishId, base64, password) {
  if (password !== getAdminPass_()) return { ok: false, message: "Từ chối truy cập!" };
  const img = uploadImageToDrive(base64, `Dish_${dishId}_${Date.now()}.jpg`);
  if (!img.url) return { ok: false, message: "Lỗi upload ảnh" };
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CONFIG, CONFIG.CONFIG_HEADERS, "#e9d5ff");
  const key = `dishImage_${dishId}`;
  const rows = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) { sheet.getRange(i + 1, 2).setValue(img.url); found = true; break; }
  }
  if (!found) { sheet.appendRow([key, img.url]); }
  
  return { ok: true, url: img.url, message: "Upload ảnh món thành công!" };
}

function parseMenuRawData(text) {
  let cleanText = text.replace(/\|/g, '\n');
  const lines = cleanText.split('\n').map(s => s.trim()).filter(s => s && s.length > 0);
  const rows = [];
  let currentItem = null;
  const itemRegex = /^(.*?)[\s\-](\d{1,3}(?:[.,]\d{3})*|\d+)\s*(k|vnd|đ)?$/i;
  lines.forEach(line => {
    const match = line.match(itemRegex);
    if (match) {
      if (currentItem) {
        rows.push([currentItem.name, currentItem.price, getAcronym(currentItem.name), getCleanName(currentItem.name), currentItem.desc.trim()]);
      }
      let name = match[1].replace(/[-:]+$/, '').trim();
      let priceRaw = parseInt(match[2].replace(/[.,]/g, ''));
      if (priceRaw < 1000) priceRaw *= 1000;
      currentItem = { name: name, price: priceRaw, desc: '' };
    } else {
      if (currentItem) { currentItem.desc += (currentItem.desc ? '\n' : '') + line; }
    }
  });
  if (currentItem) {
    rows.push([currentItem.name, currentItem.price, getAcronym(currentItem.name), getCleanName(currentItem.name), currentItem.desc.trim()]);
  }
  return rows;
}

// --- PHẦN 3: ORDERS ---
function saveOrder(p) {
  // --- BACKEND VALIDATION ---
  if (!p || !p.customer || !p.customer.name || !p.customer.phone) {
    throw new Error("Lỗ hổng: Dữ liệu khách hàng không hợp lệ!");
  }
  
  const total = Number(p.total) || 0;
  const itemsCount = (p.items && Array.isArray(p.items)) ? p.items.length : 0;
  
  if (itemsCount > 0 && total < 10000) {
    throw new Error("Lỗ hổng: Đơn hàng có món nhưng tổng tiền < 10.000 VNĐ!");
  } else if (total < 0) {
    throw new Error("Lỗ hổng: Tổng tiền âm không hợp lệ!");
  }
  // --------------------------
  if (p.oldBillFileId) { try { Drive.Files.update({trashed: true}, p.oldBillFileId); } catch(e) {} }
  let billUrl = p.billImage || "";
  if (p.htmlContent) {
    const pdf = renderPreview({htmlContent: p.htmlContent, name: p.customer.name});
    if(pdf.downloadUrl) billUrl = pdf.downloadUrl;
  } else if (p.billImage && p.billImage.includes("base64")) {
    const img = uploadImageToDrive(p.billImage, `Bill_${p.customer.name}_${Date.now()}.jpg`);
    if(img.url) billUrl = img.url;
  }
  let transferUrl = p.deposit.image || "";
  if (transferUrl && transferUrl.includes("base64")) {
    const img = uploadImageToDrive(transferUrl, `CK_${p.customer.name}_${Date.now()}.jpg`);
    if(img.url) transferUrl = img.url;
  }
  p.billUrl = billUrl;
  if(transferUrl) p.deposit.image = transferUrl;
  const unifiedData = {
    customer: p.customer, items: p.items, staff: p.staff, deposit: p.deposit,
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ORDERS, CONFIG.ORDER_HEADERS, "#dbeafe");
  const row = [
    p.id || Utilities.getUuid(), new Date().toISOString(), p.customer.name,
    "'" + p.customer.phone, JSON.stringify(unifiedData), p.total,
    p.deposit.amount, p.deposit.isPaid ? "YES" : "NO", transferUrl, billUrl
  ];
  sheet.appendRow(row);
  try { syncToCalendar(p); } catch(e) { console.log("Calendar Sync Failed: " + e.message); }
  try { sendNotification_(p, row[0], billUrl); } catch(e) { console.log("Notification Failed: " + e.message); }
  return { message: "Order Saved (V3.6.0)", id: row[0], billUrl: billUrl };
}

function syncToCalendar(data) {
  const ss = SpreadsheetApp.openById(CONFIG.LINKED_CALENDAR_ID);
  const dateStr = data.customer.date;
  if (!dateStr) return;
  const sheetName = '📅' + dateStr;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const tpl = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
    if (!tpl) return;
    sheet = tpl.copyTo(ss).setName(sheetName);
    sheet.showSheet();
  }
  const tableStr = data.customer.tables || "";
  const zoneChar = tableStr.charAt(0).toUpperCase();
  const startCol = CONFIG.ZONE_MAPPING[zoneChar];
  if (!startCol) return;
  const infoCol = startCol + 1;
  const maxRow = 150;
  const values = sheet.getRange(3, infoCol, maxRow, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < values.length - 6; i+=6) {
    if (!values[i][0]) { targetRow = i + 3; break; }
  }
  if (targetRow === -1) return;
  const rawName = data.customer.name || "Khách";
  const safeName = rawName.replace(/"/g, '""');
  const row1 = data.billUrl ? `=HYPERLINK("${data.billUrl}";"${safeName}")` : rawName;
  const paxNum = (data.customer.pax || "0").toString().replace(/\D/g, '');
  let timeStr = data.customer.time || "";
  if (timeStr.includes(':')) { let parts = timeStr.split(':'); timeStr = `${parts[0]}h${parts[1] === '00' ? '' : parts[1]}`; }
  const row2 = `${paxNum}ng - ${timeStr}`;
  const phone = data.customer.phone || "";
  const phoneSimple = phone.replace(/\D/g, '');
  const row3 = phoneSimple ? `=HYPERLINK("https://zalo.me/${phoneSimple}";"${phone}")` : phone;
  const row4 = data.customer.type || "";
  const staffName = data.staff.name || "Admin";
  const staffPhone = data.staff.phone ? data.staff.phone.replace(/\D/g, '') : "";
  let staffShort = staffName;
  if (staffName.toUpperCase().includes("ĐÀO MINH TRÍ")) { staffShort = "DMT"; }
  else { const parts = staffName.trim().split(' '); staffShort = parts[parts.length - 1]; }
  const labelStaff = `Nhận: ${staffShort}`;
  const row5 = staffPhone ? `=HYPERLINK("https://zalo.me/${staffPhone}";"${labelStaff}")` : labelStaff;
  let depositInfo = "";
  const depositAmount = Number(data.deposit.amount) || 0;
  const isPaid = data.deposit.isPaid;
  if (depositAmount > 0 || isPaid) {
    let moneyStr = "";
    if (depositAmount > 0) {
      moneyStr = depositAmount >= 1000000 ? (depositAmount / 1000000).toString().replace('.', ',') + "TR" : (depositAmount / 1000).toString() + "K";
      moneyStr = "CỌC " + moneyStr;
    } else { moneyStr = "CỌC 0Đ"; }
    depositInfo = ` [${moneyStr}${isPaid ? "|Y" : "|N"}]`;
  }
  let menuText = "";
  if (data.items && data.items.length > 0) {
    const menuItemsStr = data.items.map((item, idx) => {
      let displayStr = `${idx + 1}. ${item.name} (x${item.qty})`;
      if (item.note) { displayStr += item.note.includes('\n') ? `\n${item.note}` : ` (${item.note})`; }
      return displayStr;
    }).join('\n');
    menuText = `\n📋 *THỰC ĐƠN ĐÃ CHỌN:*\n${menuItemsStr}`;
  }
  const row6 = `${data.customer.note || ""}${depositInfo}${menuText}`;
  const blockData = [[row1], [row2], [row3], [row4], [row5], [row6]];
  sheet.getRange(targetRow, startCol).setValue(data.customer.tables).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  const infoRange = sheet.getRange(targetRow, infoCol, 6, 1);
  infoRange.setValues(blockData);
  infoRange.setWrap(true);
  sheet.getRange(targetRow, infoCol).setFontWeight("bold");
}

function getHistoryData() {
  try {
    const range = `'${CONFIG.SHEET_NAME_ORDERS}'!A2:Q`;
    const response = Sheets.Spreadsheets.Values.get(CONFIG.SS_ID, range);
    if (!response.values) return { ok: true, data: [] };
    const history = response.values.reverse().map(r => {
      const safeGet = (idx) => r[idx] !== undefined ? r[idx] : "";
      const safeJSON = (s) => { try { return JSON.parse(s); } catch(e) { return null; } };
      const extractFileId = (url) => url ? (url.match(/id=([^&]+)/) || [])[1] : null;
      const colE = safeGet(4);
      let isNewFormat = typeof colE === 'string' && colE.trim().startsWith('{');
      if (isNewFormat) {
        const coreData = safeJSON(colE) || {};
        const customer = coreData.customer || {};
        const items = coreData.items || [];
        const staff = coreData.staff || {};
        const deposit = coreData.deposit || {};
        return {
          id: safeGet(0), timestamp: safeGet(1),
          parsedCustomer: { name: customer.name || safeGet(2), phone: customer.phone || safeGet(3), date: customer.date, time: customer.time, pax: customer.pax, tables: customer.tables, type: customer.type, note: customer.note },
          totalAmount: Number(safeGet(5)) || 0, depositAmount: Number(safeGet(6)) || 0,
          isDeposited: safeGet(7) === "YES", transferImage: deposit.image || safeGet(8),
          billUrl: safeGet(9), menuItems: items, staff: staff, deposit: deposit,
          billFileId: extractFileId(safeGet(9)), _format: 'v3.0'
        };
      } else {
        return {
          id: safeGet(0), timestamp: safeGet(1),
          parsedCustomer: { name: safeGet(2), phone: safeGet(3), date: safeGet(4), time: safeGet(5), pax: safeGet(6), note: safeGet(13), type: safeGet(14), tables: safeGet(16) },
          totalAmount: Number(safeGet(7)) || 0, depositAmount: Number(safeGet(8)) || 0,
          isDeposited: safeGet(9) === "YES", menuItems: safeJSON(safeGet(10)) || [],
          billUrl: safeGet(11), transferImage: safeGet(12), staff: safeJSON(safeGet(15)) || {},
          billFileId: extractFileId(safeGet(11)), _format: 'legacy'
        };
      }
    });
    return { ok: true, data: history };
  } catch(e) { return { ok: false, message: "Lỗi tải lịch sử: " + e.message }; }
}

function deleteOrder(id, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để xóa đơn." };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) { sheet.deleteRow(i + 1); return { message: "Order Deleted" }; }
  }
  return { message: "Order Not Found" };
}

// --- PHẦN 4: UTILS ---
function renderPreview(data) {
  try {
    const htmlContent = data.htmlContent;
    const fileName = `Bill-${data.name || 'Khach'}-${Date.now()}`;
    if (!htmlContent) throw new Error("No HTML content");
    const htmlBlob = Utilities.newBlob(htmlContent, MimeType.HTML, fileName + ".html");
    const pdfBlob = htmlBlob.getAs(MimeType.PDF);
    pdfBlob.setName(fileName + ".pdf");
    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const file = folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { message: "Render successful", downloadUrl: file.getDownloadUrl(), fileId: file.getId() };
  } catch (e) { return { ok: false, message: "SSR Error: " + e.toString() }; }
}

function uploadImageToDrive(base64Data, fileName) {
  try {
    if (!base64Data || !base64Data.includes(",")) return { url: base64Data || "" };
    const split = base64Data.split(',');
    const type = split[0].split(':')[1].split(';')[0];
    const bytes = Utilities.base64Decode(split[1]);
    const blob = Utilities.newBlob(bytes, type, fileName);
    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    return { url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`, fileId: fileId };
  } catch (e) { return { url: "", error: e.toString() }; }
}

function getAcronym(str) { return removeAccents(str).toLowerCase().split(/\s+/).map(w => w[0]).join('').toUpperCase(); }
function getCleanName(str) { return removeAccents(str).toLowerCase(); }
function removeAccents(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D"); }

// --- API KEYS ---
function saveApiKey(provider, model, key, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để lưu Key." };
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_KEYS, CONFIG.KEY_HEADERS, "#fef08a");
  const data = sheet.getDataRange().getValues();
  const exists = data.some(row => row[1] === provider && row[3] === key);
  if (!exists) {
    sheet.appendRow([new Date(), provider, model || "default", key, "Active"]);
    return { ok: true, message: "Key saved successfully" };
  }
  return { ok: false, message: "Key đã có sẵn trên Cloud, bỏ qua lưu trùng." };
}

function saveApiKeys(keysData, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để lưu Keys." };
  }

  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_KEYS, CONFIG.KEY_HEADERS, "#fef08a");
  const data = sheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < data.length; i++) { existingKeys.add(data[i][1] + '_' + data[i][3]); }
  let addedCount = 0;
  if (typeof keysData === 'object' && keysData !== null) {
    for (const provider in keysData) {
      const keyList = keysData[provider];
      if (Array.isArray(keyList)) {
        keyList.forEach(key => {
          if (!key) return;
          const cleanKey = key.toString().trim();
          if (cleanKey === "") return;
          const uniqueId = provider + '_' + cleanKey;
          if (!existingKeys.has(uniqueId)) {
            sheet.appendRow([new Date(), provider, "default", cleanKey, "Active"]);
            existingKeys.add(uniqueId); addedCount++;
          }
        });
      }
    }
  }
  return { ok: true, message: `Đã đồng bộ & lưu thành công ${addedCount} API Keys mới!` };
}

function getSharedApiKeys(password) {
  if (password !== getAdminPass_()) return { ok: false, message: "Sai mật khẩu Admin!" };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_KEYS, CONFIG.KEY_HEADERS, "#fef08a");
  const rows = sheet.getDataRange().getValues();
  const keys = [];
  for(let i = 1; i < rows.length; i++) {
    if(rows[i][4] === "Active") {
      let provider = String(rows[i][1]).toLowerCase();
      if (provider === 'gemini') provider = 'google';
      keys.push({ provider: provider, model: rows[i][2], key: rows[i][3] });
    }
  }
  return { ok: true, keys: keys };
}

// --- PHẦN 5: SYSTEM CONFIG ---
function saveSystemConfig(data, password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để ghi dữ liệu cấu hình." };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CONFIG, CONFIG.CONFIG_HEADERS, "#e9d5ff");
  const keysToSave = ['bankList', 'staffList', 'webhookUrl', 'telegramChatId'];
  const rows = sheet.getDataRange().getValues();
  keysToSave.forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === key) { sheet.getRange(i + 1, 2).setValue(data[key]); found = true; break; }
      }
      if (!found) { sheet.appendRow([key, data[key]]); }
    }
  });
  return { ok: true, message: "Config Saved" };
}

function getSystemConfig() {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CONFIG, CONFIG.CONFIG_HEADERS, "#e9d5ff");
  const config = {};
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) { config[rows[i][0]] = rows[i][1]; }
  return { ok: true, data: config };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// --- PHẦN 6: PUBLIC ORDER (SHAREABLE BILL) ---
function getOrderById(id) {
  if (!id) return { ok: false, message: "Missing order ID" };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
  if (!sheet) return { ok: false, message: "Orders sheet not found" };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      const safeGet = (idx) => data[i][idx] !== undefined ? data[i][idx] : "";
      const colE = safeGet(4);
      if (typeof colE === 'string' && colE.trim().startsWith('{')) {
        const coreData = JSON.parse(colE);
        return {
          ok: true, data: {
            id: safeGet(0), timestamp: safeGet(1),
            customer: coreData.customer || {}, items: coreData.items || [],
            staff: coreData.staff || {}, deposit: coreData.deposit || {},
            totalAmount: Number(safeGet(5)) || 0,
            depositAmount: Number(safeGet(6)) || 0,
            isDeposited: safeGet(7) === "YES",
            billUrl: safeGet(9)
          }
        };
      }
      return { ok: false, message: "Format not supported" };
    }
  }
  return { ok: false, message: "Order not found" };
}

// --- PHẦN 7: TELEGRAM / WEBHOOK NOTIFICATION ---
function sendNotification_(orderData, orderId, billUrl) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const configSheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
  if (!configSheet) return;
  const rows = configSheet.getDataRange().getValues();
  const cfg = {};
  for (let i = 1; i < rows.length; i++) { cfg[rows[i][0]] = rows[i][1]; }
  const webhookUrl = cfg['webhookUrl'];
  if (!webhookUrl) return;

  const c = orderData.customer || {};
  const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
  const dep = orderData.deposit || {};
  const depStatus = dep.isPaid ? '✅ ĐÃ CỌC' : '⏳ CHỜ CỌC';
  const itemCount = (orderData.items || []).length;
  const shareUrl = 'https://kg-booking.pages.dev/#/bill/' + orderId;

  const msg = '🔔 *ĐƠN MỚI — KING\'S GRILL*\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    '👤 ' + (c.name || 'N/A') + '\n' +
    '📱 ' + (c.phone || 'N/A') + '\n' +
    '📅 ' + (c.date || '?') + ' | ⏰ ' + (c.time || '?') + '\n' +
    '👥 ' + (c.pax || '?') + ' khách | 🪑 Bàn ' + (c.tables || '?') + '\n' +
    '🍽️ ' + itemCount + ' món | 💰 ' + fmt(orderData.total) + '\n' +
    depStatus + (dep.amount ? ' (' + fmt(dep.amount) + ')' : '') + '\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🔗 ' + shareUrl;

  if (webhookUrl.includes('api.telegram.org')) {
    const chatId = cfg['telegramChatId'];
    if (!chatId) return;
    UrlFetchApp.fetch(webhookUrl, {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
      muteHttpExceptions: true
    });
  } else {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify({ text: msg, content: msg, message: msg }),
      muteHttpExceptions: true
    });
  }
}

