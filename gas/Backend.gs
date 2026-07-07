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
  SHEET_NAME_ALIASES: "Menu_Aliases",
  SHEET_NAME_CORRECTIONS: "AI_Corrections",
  ADMIN_PASS: null, // Loaded at runtime from Script Properties (see getAdminPass_())
  ORDER_HEADERS: [
    "Mã Phiếu (ID)", "Thời Gian Tạo", "Khách Hàng", "Số Điện Thoại",
    "Dữ Liệu Tổng Hợp (JSON)", "Tổng Tiền", "Mức Cọc", "Tình Trạng Cọc",
    "Link Ảnh Cọc (Drive)", "Link Phiếu Đặt (Drive)"
  ],
  KEY_HEADERS: ["Timestamp", "Provider", "Model", "Key", "Status"],
  CONFIG_HEADERS: ["Config_Key", "Config_Value"],
  ALIAS_HEADERS: ["Alias", "DishName"],
  CORRECTION_HEADERS: ["InputText", "WrongValue", "CorrectValue", "Field", "CreatedAt"]
};

// --- PHẦN 0: HELPER ---
function initSheetIfNeeded_(ss, sheetName, headers, bgColor) {
  if (!ss) return null;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight("bold").setBackground(bgColor || "#f3f4f6").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
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
  if (action === "testConfig") {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
    const values = sheet ? sheet.getDataRange().getValues() : [];
    return jsonResponse(values);
  }
  if (action === "updateWebhookBotB") {
    return HtmlService.createHtmlOutput(updateWebhookUrlToBotB());
  }
  if (action === "getWebhookLogs") {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    const sheet = ss.getSheetByName("Webhook_Logs");
    const values = sheet ? sheet.getDataRange().getValues() : [];
    return jsonResponse(values);
  }
  return HtmlService.createHtmlOutput("Backend Ready.");
}

function doPost(e) {
  // AUTO CLEANUP SYSTEM CONFIG FOR BRACES (Run once and save)
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    const configSheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
    if (configSheet) {
      const range = configSheet.getDataRange();
      const values = range.getValues();
      let updated = false;
      for (let i = 1; i < values.length; i++) {
        const key = values[i][0];
        let val = values[i][1];
        if (key === 'webhookUrl' && typeof val === 'string' && (val.includes('{') || val.includes('}'))) {
          const cleaned = val.replace(/[{}]/g, '').trim();
          configSheet.getRange(i + 1, 2).setValue(cleaned);
          updated = true;
        }
        if (key === 'system_config' && typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (parsed.webhookUrl && (parsed.webhookUrl.includes('{') || parsed.webhookUrl.includes('}'))) {
              parsed.webhookUrl = parsed.webhookUrl.replace(/[{}]/g, '').trim();
              configSheet.getRange(i + 1, 2).setValue(JSON.stringify(parsed));
              updated = true;
            }
          } catch(err) {}
        }
      }
      if (updated) {
        try { CacheService.getScriptCache().remove("system_config"); } catch(err) {}
      }
    }
  } catch (err) {
    console.log("Auto-clean config failed: " + err.message);
  }

  let isApiRequest = false;
  try {
    if (!e || !e.postData) return HtmlService.createHtmlOutput("No post data");
    const data = JSON.parse(e.postData.contents);
    
    // Check if it is a Telegram Webhook update or non-API call
    if (!data.action) {
      return handleTelegramWebhook(data);
    }
    
    isApiRequest = true;
    const action = data.action;
    
    // Write actions that modify configuration or sheets and need script lock protection
    const writeActions = [
      "saveOrder", "saveOrdersBatch", "deleteOrder", "createMenu", "deleteMenu", 
      "uploadMenuImage", "uploadDishImage", "saveConfig", "saveApiKey", 
      "deleteApiKey", "saveApiKeys", "saveAiApiConfig", "saveMenuAlias", 
      "deleteMenuAlias", "logAiCorrection", "upsertSystemConfig", 
      "upsertSystemConfigBatch", "mergeSystemConfig", "restoreSystemConfigBackup"
    ];
    
    const isWrite = writeActions.indexOf(action) !== -1;
    let lock = null;
    if (isWrite) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) { // 15 seconds wait limit for write lock
        return jsonResponse({ok: false, message: "Server busy (lock timeout), please try again."});
      }
    }
    
    try {
      let result = {};
      switch (action) {
        case "saveOrder": result = saveOrder(data.data); break;
        case "saveOrdersBatch": result = saveOrdersBatch(data.payloads); break;
        case "deleteOrder": result = deleteOrder(data.id, data.password, data.token); break;
        case "getHistory": result = getHistoryData(); break;
        case "getMenuSheets": result = getMenuSheets(); break;
        case "getMenu": result = getMenuData(data.sheetName); break;
        case "createMenu": result = createNewMenuSheet(data.name, data.rawText, data.password, data.token); break;
        case "deleteMenu": result = deleteMenuSheet(data.name, data.password, data.token); break;
        case "uploadMenuImage": result = uploadMenuImage(data.sheetName, data.base64, data.password, data.token); break;
        case "uploadDishImage": result = uploadDishImage(data.dishId, data.base64, data.password, data.token); break;
        case "saveConfig": result = saveSystemConfig(data, data.password); break;
        case "getConfig": result = getSystemConfig(); break;
        case "getAiRuntimeConfig": result = getAiRuntimeConfig(); break;
        case "renderPreview": result = renderPreview(data.data); break;
        case "saveApiKey": result = saveApiKey(data.provider, data.model, data.key, data.password, data.token); break;
        case "deleteApiKey": result = deleteApiKey(data.provider, data.index, data.token); break;
        case "saveApiKeys": result = saveApiKeys(data.keys, data.password, data.token); break;
        case "borrowApiKeys": result = getSharedApiKeys(data.password, data.token); break;
        case "getSharedApiKeysWithoutPassword": result = getSharedApiKeysWithoutPassword(); break;
        
        // NEW ENDPOINTS
        case "authAdminSettings": result = authAdminSettings(data.password); break;
        case "verifyAdminSettings": result = { ok: true, valid: verifyAdminSettingsToken(data.token) }; break;
        case "logoutAdminSettings": result = logoutAdminSettings(data.token); break;
        case "getAdminSystemConfig": result = getAdminSystemConfig(data.token); break;
        case "saveAiApiConfig": result = saveAiApiConfig(data.token, data.config); break;
        case "testAiApiKey": result = testAiApiKey(data.token, data.provider, data.apiKey); break;
        case "callAiService": result = callAiService(data); break;
        case "upsertSystemConfig": result = upsertSystemConfig(data.key, data.value, data.options, data.token); break;
        case "upsertSystemConfigBatch": result = upsertSystemConfigBatch(data.configPatch, data.options, data.token); break;
        case "mergeSystemConfig": result = mergeSystemConfig(data.configPatch, data.options, data.token); break;
        case "backupSystemConfig": result = backupSystemConfig(data.reason, data.token); break;
        case "restoreSystemConfigBackup": result = restoreSystemConfigBackup(data.backupId, data.token); break;
        case "getSystemConfigBackups": result = getSystemConfigBackups(data.token); break;
        case "getSystemConfigAuditLogs": result = getSystemConfigAuditLogs(data.token); break;
        case "getMenuAliases": result = getMenuAliases(data.token); break;
        case "saveMenuAlias": result = saveMenuAlias(data.alias, data.dishName, data.token); break;
        case "deleteMenuAlias": result = deleteMenuAlias(data.alias, data.token); break;
        case "logAiCorrection": result = logAiCorrection(data.inputText, data.wrongValue, data.correctValue, data.field, data.token); break;
        case "getAiCorrections": result = getAiCorrections(data.token); break;
        case "testTelegram": result = testTelegramNotification(data.data); break;
        case "getOrder": result = getOrderById(data.id); break;
        case "syncBookingCalendar": result = syncBookingCalendar(data.id, data.token); break;
        
        default: result = { ok: false, message: "Unknown Action" };
      }
      return jsonResponse({ok: true, ...result});
    } finally {
      if (lock) {
        lock.releaseLock();
      }
    }
  } catch (err) {
    if (isApiRequest) {
      return jsonResponse({ok: false, message: err.toString()});
    } else {
      return HtmlService.createHtmlOutput("Error: " + err.toString());
    }
  }
}

// --- PHẦN 2: MENU ---
function getMenuSheets() {
  try {
    const cached = CacheService.getScriptCache().get("menu_sheets");
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const menuSheets = ss.getSheets().map(s => s.getName()).filter(n => n.toLowerCase().includes("menu"));
  const result = { ok: true, sheets: menuSheets };
  try {
    CacheService.getScriptCache().put("menu_sheets", JSON.stringify(result), 21600); // cache 6 hours
  } catch(e) {}
  return result;
}

function getMenuData(sheetName) {
  const targetSheet = sheetName || "Menu";
  const cacheKey = "menu_data_" + targetSheet.replace(/\s+/g, "_");
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  let target = sheetName;
  if (!target) {
    const firstMenu = ss.getSheets().find(s => s.getName().toLowerCase().includes("menu"));
    target = firstMenu ? firstMenu.getName() : "Menu";
  }
  let sheet = ss.getSheetByName(target);
  if (!sheet && target) {
    sheet = ss.getSheets().find(s => s.getName().toLowerCase() === target.toLowerCase());
  }
  if (!sheet) {
    sheet = ss.getSheets().find(s => s.getName().toLowerCase().includes("menu"));
  }
  if (!sheet) return { ok: false, message: "Sheet not found", data: [] };
  try {
    const rows = sheet.getRange("A2:E").getValues().filter(r => r[0]);
    const menu = rows.map(r => ({
      name: r[0], price: Number(r[1]) || 0, acronym: r[2], cleanName: r[3], desc: r[4] || ""
    }));
    const result = { ok: true, data: menu };
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 21600); // cache 6 hours
    } catch(e) {}
    return result;
  } catch (e) {
    return { ok: false, message: "Lỗi tải Menu: " + e.message, data: [] };
  }
}

function createNewMenuSheet(name, rawText, password, token) {
  if (!checkAdminAccess_(token, password)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để tạo Menu." };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheetName = name.toLowerCase().includes("menu") ? name : `Menu - ${name}`;
  let sheet = ss.getSheetByName(sheetName);
  
  // Read existing items to compute changes
  const existingItems = [];
  if (sheet) {
    try {
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
        for (let i = 0; i < values.length; i++) {
          if (values[i][0]) {
            existingItems.push({
              name: values[i][0],
              price: Number(values[i][1]) || 0
            });
          }
        }
      }
    } catch (e) {
      console.log("Error reading existing menu sheet: " + e.toString());
    }
  }

  if (sheet) { sheet.clear(); } else { sheet = ss.insertSheet(sheetName); }
  const menuHeaders = ["Name", "Price", "Acronym", "CleanName", "Description"];
  sheet.getRange(1, 1, 1, 5).setValues([menuHeaders]);
  sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#bbf7d0").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  const rows = parseMenuRawData(rawText);
  if (rows.length > 0) { sheet.getRange(2, 1, rows.length, 5).setValues(rows); }

  // Compare and generate logs
  const logs = [];
  const existingMap = {};
  existingItems.forEach(item => {
    existingMap[item.name.toLowerCase().trim()] = item.price;
  });

  const newItemsMap = {};
  rows.forEach(r => {
    const itemName = r[0];
    const itemPrice = r[1];
    newItemsMap[itemName.toLowerCase().trim()] = itemPrice;

    const key = itemName.toLowerCase().trim();
    if (existingMap.hasOwnProperty(key)) {
      const oldPrice = existingMap[key];
      if (oldPrice !== itemPrice) {
        logs.push(`Cập nhật giá "${itemName}": ${formatVNDLocal_(oldPrice)} → ${formatVNDLocal_(itemPrice)}`);
      }
    } else {
      logs.push(`Thêm món mới "${itemName}" với giá ${formatVNDLocal_(itemPrice)}`);
    }
  });

  existingItems.forEach(item => {
    const key = item.name.toLowerCase().trim();
    if (!newItemsMap.hasOwnProperty(key)) {
      logs.push(`Xóa món "${item.name}"`);
    }
  });

  try {
    const cache = CacheService.getScriptCache();
    cache.remove("menu_sheets");
    cache.remove("menu_data_" + sheetName.replace(/\s+/g, "_"));
  } catch(e) {}
  return { ok: true, message: "Menu Updated Successfully", sheetName: sheetName, logs: logs };
}

function formatVNDLocal_(num) {
  return Number(num).toLocaleString('vi-VN') + 'đ';
}

function deleteMenuSheet(name, password, token) {
  if (!checkAdminAccess_(token, password)) {
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
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("menu_sheets");
    cache.remove("menu_data_" + name.replace(/\s+/g, "_"));
  } catch(e) {}
  return { ok: true, message: "Xóa Menu thành công." };
}

function uploadMenuImage(sheetName, base64, password, token) {
  if (!checkAdminAccess_(token, password)) return { ok: false, message: "Từ chối truy cập!" };
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

function uploadDishImage(dishId, base64, password, token) {
  if (!checkAdminAccess_(token, password)) return { ok: false, message: "Từ chối truy cập!" };
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
  const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  const rows = [];
  let currentItem = null;

  function extractPrice(str) {
    if (!str) return 0;
    const cleanStr = str.toLowerCase().replace(/[\s.,đđ]/g, '');
    const match = cleanStr.match(/^(\d+)(k|vnd|triệu|trieu|cu|củ)?$/);
    if (!match) return 0;
    let priceVal = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'k') priceVal *= 1000;
    else if (unit === 'triệu' || unit === 'trieu' || unit === 'cu' || unit === 'củ') priceVal *= 1000000;
    else if (priceVal < 1000 && !unit) priceVal *= 1000;
    return priceVal;
  }

  function addCurrentItem() {
    if (currentItem) {
      let desc = currentItem.desc.trim();
      desc = desc.replace(/^(Mô tả|Mo ta|Thành phần|Thanh phan|Chi tiết|Chi tiet)[:\-\s]*/i, '');
      rows.push([
        currentItem.name,
        currentItem.price,
        getAcronym(currentItem.name),
        getCleanName(currentItem.name),
        desc
      ]);
      currentItem = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('|')) {
      addCurrentItem();
      const parts = line.split('|').map(p => p.trim());
      const name = parts[0];
      const price = extractPrice(parts[1]);
      const desc = parts.slice(2).join(' | ');
      currentItem = { name, price, desc };
      continue;
    }

    const dashParts = line.split(/\s+-\s+/).map(p => p.trim());
    if (dashParts.length >= 2) {
      const p2Price = extractPrice(dashParts[1]);
      if (p2Price > 0) {
        addCurrentItem();
        const name = dashParts[0];
        const price = p2Price;
        const desc = dashParts.slice(2).join(' - ');
        currentItem = { name, price, desc };
        continue;
      }
      const firstPartPriceMatch = dashParts[0].match(/(\d+)(k|vnd|đ)?$/i);
      if (firstPartPriceMatch) {
        const p1Price = extractPrice(firstPartPriceMatch[0]);
        if (p1Price > 0) {
          addCurrentItem();
          const name = dashParts[0];
          const price = p1Price;
          const desc = dashParts.slice(1).join(' - ');
          currentItem = { name, price, desc };
          continue;
        }
      }
    }

    const itemRegex = /^(.*?)(?:\s+-\s+|\s+|\s*-\s*)(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(k|vnd|đ)?$/i;
    const match = line.match(itemRegex);
    if (match) {
      const namePart = match[1].trim();
      if (namePart && !/^(mô tả|thành phần|mota|thanhphan)[:\-\s]/i.test(namePart)) {
        addCurrentItem();
        let name = namePart.replace(/[-:]+$/, '').trim();
        let price = parseInt(match[2].replace(/[.,]/g, ''));
        const unit = (match[3] || '').toLowerCase();
        if (unit === 'k') price *= 1000;
        else if (price < 1000) price *= 1000;
        currentItem = { name, price, desc: '' };
        continue;
      }
    }

    if (currentItem) {
      currentItem.desc += (currentItem.desc ? '\n' : '') + line;
    }
  }

  addCurrentItem();
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

  const bookingId = p.id || Utilities.getUuid();

  // Use Sheets API V4 to search and save for maximum speed (Sheet API optimization)
  const spreadsheetId = CONFIG.SS_ID;
  const rangeName = CONFIG.SHEET_NAME_ORDERS + "!A:B";
  let values = [];
  try {
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, rangeName);
    values = response.values || [];
  } catch (err) {
    // If sheet does not exist, initialize using standard route
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ORDERS, CONFIG.ORDER_HEADERS, "#dbeafe");
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, rangeName);
    values = response.values || [];
  }

  // Find existing booking row by ID to prevent duplication
  let foundRowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === bookingId) {
      foundRowIndex = i + 1;
      break;
    }
  }

  const isNew = (foundRowIndex === -1);
  const createdAt = isNew ? new Date().toISOString() : (values[foundRowIndex - 1][1] || new Date().toISOString());
  const updatedAt = new Date().toISOString();

  const unifiedData = {
    customer: p.customer, items: p.items, staff: p.staff, deposit: p.deposit,
    activeMenuSheet: p.activeMenuSheet || "",
    aiMetadata: p.aiMetadata || null,
    warnings: p.warnings || [],
    unresolvedItems: p.unresolvedItems || [],
    meta: { createdAt: createdAt, updatedAt: updatedAt }
  };

  const row = [
    bookingId, createdAt, p.customer.name,
    "'" + p.customer.phone, JSON.stringify(unifiedData), p.total,
    p.deposit.amount, p.deposit.isPaid ? "YES" : "NO", transferUrl, billUrl
  ];

  if (isNew) {
    const appendRange = CONFIG.SHEET_NAME_ORDERS + "!A1";
    const valueRange = {
      values: [row]
    };
    Sheets.Spreadsheets.Values.append(valueRange, spreadsheetId, appendRange, {
      valueInputOption: "USER_ENTERED"
    });
  } else {
    const updateRange = CONFIG.SHEET_NAME_ORDERS + "!A" + foundRowIndex + ":J" + foundRowIndex;
    const valueRange = {
      values: [row]
    };
    Sheets.Spreadsheets.Values.update(valueRange, spreadsheetId, updateRange, {
      valueInputOption: "USER_ENTERED"
    });
  }

  let calendarSync = { status: "SKIPPED" };
  try {
    calendarSync = syncToCalendar(p, bookingId, billUrl, transferUrl);
  } catch(e) {
    console.log("Calendar Sync Failed: " + e.message);
    calendarSync = { status: "ERROR", message: e.message };
  }
  if (!p.skipNotification) {
    try { sendNotification_(p, bookingId, billUrl); } catch(e) { console.log("Notification Failed: " + e.message); }
  }
  return { message: "Order Saved (V3.6.0)", id: bookingId, billUrl: billUrl, calendarSync: calendarSync };
}

function saveOrdersBatch(payloads) {
  if (!payloads || !Array.isArray(payloads) || payloads.length === 0) {
    return { ok: false, message: "No batch payloads provided" };
  }
  
  const spreadsheetId = CONFIG.SS_ID;
  const rangeName = CONFIG.SHEET_NAME_ORDERS + "!A:B";
  let values = [];
  try {
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, rangeName);
    values = response.values || [];
  } catch (err) {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ORDERS, CONFIG.ORDER_HEADERS, "#dbeafe");
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, rangeName);
    values = response.values || [];
  }

  // Create a map of ID -> Row Number (1-indexed)
  const idToRowMap = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) {
      idToRowMap[values[i][0]] = i + 1;
    }
  }

  const results = [];
  const valueRanges = [];
  let nextNewRowIndex = values.length + 1;

  for (let idx = 0; idx < payloads.length; idx++) {
    const p = payloads[idx];
    try {
      if (!p || !p.customer || !p.customer.name || !p.customer.phone) {
        throw new Error("Dữ liệu khách hàng không hợp lệ!");
      }
      const total = Number(p.total) || 0;
      const itemsCount = (p.items && Array.isArray(p.items)) ? p.items.length : 0;
      if (itemsCount > 0 && total < 10000) {
        throw new Error("Đơn hàng có món nhưng tổng tiền < 10.000 VNĐ!");
      } else if (total < 0) {
        throw new Error("Tổng tiền âm không hợp lệ!");
      }

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

      const bookingId = p.id || Utilities.getUuid();
      
      let foundRowIndex = idToRowMap[bookingId] || -1;
      const isNew = (foundRowIndex === -1);
      
      let createdAt;
      if (isNew) {
        createdAt = new Date().toISOString();
        foundRowIndex = nextNewRowIndex++;
        idToRowMap[bookingId] = foundRowIndex; // Update map to catch duplicate IDs in the same batch
      } else {
        createdAt = values[foundRowIndex - 1] ? (values[foundRowIndex - 1][1] || new Date().toISOString()) : new Date().toISOString();
      }
      const updatedAt = new Date().toISOString();

      const unifiedData = {
        customer: p.customer, items: p.items, staff: p.staff, deposit: p.deposit,
        activeMenuSheet: p.activeMenuSheet || "",
        aiMetadata: p.aiMetadata || null,
        warnings: p.warnings || [],
        unresolvedItems: p.unresolvedItems || [],
        meta: { createdAt: createdAt, updatedAt: updatedAt }
      };

      const row = [
        bookingId, createdAt, p.customer.name,
        "'" + p.customer.phone, JSON.stringify(unifiedData), p.total,
        p.deposit.amount, p.deposit.isPaid ? "YES" : "NO", transferUrl, billUrl
      ];

      // Add to batch update list
      const updateRange = CONFIG.SHEET_NAME_ORDERS + "!A" + foundRowIndex + ":J" + foundRowIndex;
      valueRanges.push({
        range: updateRange,
        values: [row]
      });

      // Calendar sync & notifications (best effort)
      let calendarSync = { status: "SKIPPED" };
      try {
        calendarSync = syncToCalendar(p, bookingId, billUrl, transferUrl);
      } catch(e) {
        calendarSync = { status: "ERROR", message: e.message };
      }
      try { sendNotification_(p, bookingId, billUrl); } catch(e) {}

      results.push({ ok: true, id: bookingId, billUrl: billUrl, calendarSync: calendarSync });
    } catch (e) {
      results.push({ ok: false, message: e.toString(), payloadId: p ? p.id : "unknown" });
    }
  }

  // Perform sheet updates in a single batch call!
  if (valueRanges.length > 0) {
    Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: "USER_ENTERED",
      data: valueRanges
    }, spreadsheetId);
  }

  return { ok: true, results: results };
}

function initLocationSheets_(ss) {
  initSheetIfNeeded_(ss, "Booking_Location_Index", [
    "booking_id", "calendar_sheet_name", "event_date", "table_number", "cell_range", 
    "block_start_row", "block_end_row", "block_start_col", "block_end_col", 
    "customer_name", "phone", "event_time", "guest_count", "location_status", 
    "last_synced_at", "last_synced_hash", "created_at", "updated_at", "note"
  ], "#e0f2fe");
  
  initSheetIfNeeded_(ss, "Booking_Location_History", [
    "timestamp", "booking_id", "action", "old_date", "new_date", 
    "old_table", "new_table", "old_range", "new_range", "status", "actor", "note"
  ], "#fef3c7");
}

function calculateBookingHash(data, bookingId) {
  const str = [
    bookingId,
    data.customer.name || "",
    data.customer.phone || "",
    data.customer.date || "",
    data.customer.time || "",
    data.customer.tables || "",
    data.customer.pax || "",
    data.deposit.amount || 0,
    data.deposit.isPaid ? "PAID" : "UNPAID",
    (data.items || []).map(i => `${i.name}:${i.qty}`).join(',')
  ].join('|');
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString();
}

function findExistingBookingLocation(ss, bookingId) {
  const idxSheet = ss.getSheetByName("Booking_Location_Index");
  if (!idxSheet) return null;
  const dataRange = idxSheet.getDataRange();
  if (dataRange.getLastRow() < 2) return null;
  const values = dataRange.getValues();
  const headers = values[0];
  
  const idIdx = headers.indexOf("booking_id");
  for (let r = 1; r < values.length; r++) {
    if (values[r][idIdx] === bookingId) {
      const locObj = { rowNum: r + 1 };
      headers.forEach((h, c) => {
        locObj[h] = values[r][c];
      });
      return locObj;
    }
  }
  return null;
}

function validateLocationBelongsToBooking(sheet, startRow, startCol, endRow, endCol, bookingId) {
  try {
    const note = sheet.getRange(startRow, startCol).getNote();
    if (note === bookingId) return true;
    
    // Fuzzy search check within cells
    const values = sheet.getRange(startRow, startCol, endRow - startRow + 1, endCol - startCol + 1).getValues();
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        if (String(values[r][c]).indexOf(bookingId) !== -1) return true;
      }
    }
  } catch (e) {
    console.log("Validation error: " + e.message);
  }
  return false;
}

function isCalendarSlotEmpty_(sheet, row, col, infoCol) {
  try {
    const val = sheet.getRange(row, infoCol).getValue();
    if (!val || String(val).trim() === "") {
      return true;
    }
  } catch (e) {
    console.log("Check slot empty error: " + e.message);
  }
  return false;
}

function findAvailableCalendarSlot(sheet, startCol, bookingId) {
  const infoCol = startCol + 1;
  const maxRow = 150;
  const values = sheet.getRange(3, infoCol, maxRow, 1).getValues();
  const notes = sheet.getRange(3, startCol, maxRow, 1).getNotes();
  
  for (let i = 0; i < values.length - 6; i += 6) {
    if (!values[i][0] || notes[i][0] === bookingId || notes[i][0] === bookingId + "_MOVED") {
      return i + 3;
    }
  }
  return -1;
}

function getColLetter_(col) {
  let temp, letter = '';
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

function writeBookingBlock(sheet, row, startCol, data, bookingId, billUrl) {
  const infoCol = startCol + 1;
  const rawName = data.customer.name || "Khách";
  const safeName = rawName.replace(/"/g, '""');
  const actualBillUrl = billUrl || data.billUrl || "";
  const row1 = actualBillUrl ? `=HYPERLINK("${actualBillUrl}";"${safeName}")` : rawName;
  const paxNum = (data.customer.pax || "0").toString().replace(/\D/g, '');
  let timeStr = data.customer.time || "";
  if (timeStr.includes(':')) {
    let parts = timeStr.split(':');
    timeStr = `${parts[0]}h${parts[1] === '00' ? '' : parts[1]}`;
  }
  const row2 = `${paxNum}ng - ${timeStr}`;
  const phone = data.customer.phone || "";
  const phoneSimple = phone.replace(/\D/g, '');
  const row3 = phoneSimple ? `=HYPERLINK("https://zalo.me/${phoneSimple}";"${phone}")` : phone;
  const row4 = data.customer.type || "";
  const staffName = data.staff.name || "Admin";
  const staffPhone = data.staff.phone ? data.staff.phone.replace(/\D/g, '') : "";
  let staffShort = staffName;
  if (staffName.toUpperCase().includes("ĐÀO MINH TRÍ")) {
    staffShort = "DMT";
  } else {
    const parts = staffName.trim().split(' ');
    staffShort = parts[parts.length - 1];
  }
  const labelStaff = `Nhận: ${staffShort}`;
  const row5 = staffPhone ? `=HYPERLINK("https://zalo.me/${staffPhone}";"${labelStaff}")` : labelStaff;
  const depositAmount = Number(data.deposit.amount) || 0;
  const isPaid = data.deposit.isPaid;
  
  let depositStr = "";
  if (depositAmount > 0) {
    let moneyStr = depositAmount >= 1000000 ? (depositAmount / 1000000).toString().replace('.', ',') + "TR" : (depositAmount / 1000).toString() + "K";
    depositStr = isPaid ? "CỌC " + moneyStr : "ĐỢI CỌC " + moneyStr;
  } else if (isPaid) {
    depositStr = "CỌC 0Đ";
  }

  const hasItems = data.items && data.items.length > 0;
  let statusLineItems = [];
  if (hasItems) statusLineItems.push("CÓ MÓN");
  if (depositStr) statusLineItems.push(depositStr);
  
  let menuText = "";
  if (hasItems) {
    const menuItemsStr = data.items.map((item, idx) => {
      let displayStr = `${idx + 1}. ${item.name} (x${item.qty})`;
      if (item.note) { displayStr += item.note.includes('\n') ? `\n${item.note}` : ` (${item.note})`; }
      return displayStr;
    }).join('\n');
    menuText = `${menuItemsStr}`;
  }

  let finalNoteLines = [];
  if (data.customer.note) finalNoteLines.push(data.customer.note);
  if (statusLineItems.length > 0) finalNoteLines.push(statusLineItems.join(" - "));
  if (menuText) finalNoteLines.push(menuText);
  const row6 = finalNoteLines.join('\n').trim();
  const blockData = [[row1], [row2], [row3], [row4], [row5], [row6]];

  const ss = sheet.getParent();
  const spreadsheetId = ss.getId();
  const sheetId = sheet.getSheetId();

  const startColLetter = getColLetter_(startCol);
  const infoColLetter = getColLetter_(infoCol);
  const sheetNameQuote = "'" + sheet.getName().replace(/'/g, "''") + "'";
  const range1 = sheetNameQuote + "!" + startColLetter + row;
  const range2 = sheetNameQuote + "!" + infoColLetter + row + ":" + infoColLetter + (row + 5);

  const valueRanges = [
    {
      range: range1,
      values: [[data.customer.tables]]
    },
    {
      range: range2,
      values: blockData
    }
  ];

  // Batch update values
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "USER_ENTERED",
    data: valueRanges
  }, spreadsheetId);

  // Batch update formats & notes
  const requests = [
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: row - 1,
          endRowIndex: row,
          startColumnIndex: startCol - 1,
          endColumnIndex: startCol
        },
        rows: [{
          values: [{
            note: bookingId,
            userEnteredFormat: {
              textFormat: { bold: true },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE"
            }
          }]
        }],
        fields: "note,userEnteredFormat(textFormat/bold,horizontalAlignment,verticalAlignment)"
      }
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: row - 1,
          endRowIndex: row + 5,
          startColumnIndex: infoCol - 1,
          endColumnIndex: infoCol
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP"
          }
        },
        fields: "userEnteredFormat.wrapStrategy"
      }
    },
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: row - 1,
          endRowIndex: row,
          startColumnIndex: infoCol - 1,
          endColumnIndex: infoCol
        },
        rows: [{
          values: [{
            userEnteredFormat: {
              textFormat: { bold: true }
            }
          }]
        }],
        fields: "userEnteredFormat.textFormat/bold"
      }
    }
  ];

  Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
}

function writeMovedMarker(sheet, row, startCol, text, bookingId) {
  const infoCol = startCol + 1;
  const ss = sheet.getParent();
  const spreadsheetId = ss.getId();
  const sheetId = sheet.getSheetId();

  const infoColLetter = getColLetter_(infoCol);
  const sheetNameQuote = "'" + sheet.getName().replace(/'/g, "''") + "'";

  const empty6 = [[""], [""], [""], [""], [""], [""]];
  empty6[0] = [text];

  const valueRanges = [
    {
      range: sheetNameQuote + "!" + infoColLetter + row + ":" + infoColLetter + (row + 5),
      values: empty6
    }
  ];

  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "USER_ENTERED",
    data: valueRanges
  }, spreadsheetId);

  const requests = [
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: row - 1,
          endRowIndex: row,
          startColumnIndex: startCol - 1,
          endColumnIndex: startCol
        },
        rows: [{
          values: [{
            note: bookingId + "_MOVED"
          }]
        }],
        fields: "note"
      }
    },
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: row - 1,
          endRowIndex: row,
          startColumnIndex: infoCol - 1,
          endColumnIndex: infoCol
        },
        rows: [{
          values: [{
            userEnteredFormat: {
              textFormat: { bold: true, foregroundColor: { red: 0.58, green: 0.64, blue: 0.72 } }
            }
          }]
        }],
        fields: "userEnteredFormat.textFormat(bold,foregroundColor)"
      }
    }
  ];

  Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
}

function logLocationHistory(ss, bookingId, action, oldDate, newDate, oldTable, newTable, oldRange, newRange, status, note) {
  try {
    const histSheet = ss.getSheetByName("Booking_Location_History");
    if (!histSheet) return;
    histSheet.appendRow([
      new Date(),
      bookingId,
      action,
      oldDate || "",
      newDate || "",
      oldTable || "",
      newTable || "",
      oldRange || "",
      newRange || "",
      status || "",
      "AI_System",
      note || ""
    ]);
  } catch (e) {
    console.log("Log history failed: " + e.message);
  }
}

function updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableNum, row, col, infoCol, hash, status, data, noteText) {
  const idxSheet = ss.getSheetByName("Booking_Location_Index");
  if (!idxSheet) return;
  const existing = findExistingBookingLocation(ss, bookingId);
  const cellRange = `${sheetName}!R${row}C${col}:R${row+5}C${infoCol}`;
  const now = new Date();
  
  const rowValues = [
    bookingId,
    sheetName,
    dateStr,
    tableNum,
    cellRange,
    row,
    row + 5,
    col,
    infoCol,
    data.customer.name || "",
    data.customer.phone || "",
    data.customer.time || "",
    data.customer.pax || "",
    status,
    now,
    hash,
    existing ? existing.created_at : now,
    now,
    noteText || ""
  ];
  
  if (existing) {
    idxSheet.getRange(existing.rowNum, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    idxSheet.appendRow(rowValues);
  }
}

function clearCalendarEntryById(ss, bookingId) {
  if (!bookingId) return;
  initLocationSheets_(ss);
  const existing = findExistingBookingLocation(ss, bookingId);
  if (existing) {
    const sheetName = existing.calendar_sheet_name;
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const row = Number(existing.block_start_row);
      const col = Number(existing.block_start_col);
      const infoCol = Number(existing.block_end_col);
      if (validateLocationBelongsToBooking(sheet, row, col, row + 5, infoCol, bookingId)) {
        const spreadsheetId = ss.getId();
        const sheetId = sheet.getSheetId();
        
        const colLetter = getColLetter_(col);
        const infoColLetter = getColLetter_(infoCol);
        const sheetNameQuote = "'" + sheetName.replace(/'/g, "''") + "'";

        const valueRanges = [
          { range: sheetNameQuote + "!" + colLetter + row, values: [[""]] },
          { range: sheetNameQuote + "!" + infoColLetter + row + ":" + infoColLetter + (row + 5), values: [[""], [""], [""], [""], [""], [""]] }
        ];
        
        Sheets.Spreadsheets.Values.batchUpdate({
          valueInputOption: "USER_ENTERED",
          data: valueRanges
        }, spreadsheetId);

        const requests = [{
          updateCells: {
            range: {
              sheetId: sheetId,
              startRowIndex: row - 1,
              endRowIndex: row,
              startColumnIndex: col - 1,
              endColumnIndex: col
            },
            rows: [{ values: [{ note: "" }] }],
            fields: "note"
          }
        }];
        Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
      }
    }
    updateBookingLocationIndex(ss, bookingId, existing.calendar_sheet_name, existing.event_date, existing.table_number, existing.block_start_row, existing.block_start_col, existing.block_end_col, "", "ARCHIVED", {customer:{}}, "Deleted");
    logLocationHistory(ss, bookingId, "ARCHIVE", existing.event_date, "", existing.table_number, "", "", "", "SUCCESS", "Booking Deleted");
    return;
  }
  
  // Fallback scan
  const sheets = ss.getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    if (!sheet.getName().startsWith('📅')) continue;
    const maxRow = 150;
    const range = sheet.getRange(1, 1, maxRow, 14);
    const notes = range.getNotes();
    for (let r = 0; r < notes.length; r++) {
      for (let c = 0; c < notes[r].length; c++) {
        if (notes[r][c] === bookingId || notes[r][c] === bookingId + "_MOVED") {
          sheet.getRange(r + 1, c + 1).setValue("").setNote("");
          sheet.getRange(r + 1, c + 2, 6, 1).setValues([[""], [""], [""], [""], [""], [""]]);
        }
      }
    }
  }
}

function syncToCalendar(data, bookingId, billUrl, transferUrl) {
  const ss = SpreadsheetApp.openById(CONFIG.LINKED_CALENDAR_ID);
  initLocationSheets_(ss);
  
  const dateStr = data.customer.date;
  if (!dateStr) return { status: "FAILED", message: "Thiếu ngày đặt bàn." };
  
  const sheetName = '📅' + dateStr;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const tpl = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
    if (!tpl) return { status: "FAILED", message: "Không tìm thấy sheet template " + CONFIG.TEMPLATE_SHEET_NAME };
    sheet = tpl.copyTo(ss).setName(sheetName);
    sheet.showSheet();
  }
  
  const tableStr = data.customer.tables || "";
  const zoneChar = tableStr.charAt(0).toUpperCase();
  let startCol = CONFIG.ZONE_MAPPING[zoneChar];
  if (!startCol) startCol = 1; // Zone A fallback
  const infoCol = startCol + 1;
  
  const currentHash = calculateBookingHash(data, bookingId);
  const existing = findExistingBookingLocation(ss, bookingId);
  
  // CASE 1: New booking
  if (!existing) {
    const targetRow = findAvailableCalendarSlot(sheet, startCol, bookingId);
    if (targetRow === -1) {
      logLocationHistory(ss, bookingId, "CREATE", "", dateStr, "", tableStr, "", "", "FAILED", "Không tìm thấy vị trí trống.");
      return { status: "NO_SLOT", message: "Cột của bàn " + tableStr + " đã hết vị trí trống." };
    }
    
    writeBookingBlock(sheet, targetRow, startCol, data, bookingId, billUrl);
    updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, targetRow, startCol, infoCol, currentHash, "ACTIVE", data, "Created");
    logLocationHistory(ss, bookingId, "CREATE", "", dateStr, "", tableStr, "", `${sheetName}!R${targetRow}C${startCol}`, "SUCCESS", "Đồng bộ thành công");
    return { status: "SUCCESS", message: "Đồng bộ lịch thành công.", cellRange: `${sheetName}!R${targetRow}C${startCol}` };
  }
  
  // CASE 2: Date changed
  if (existing.event_date !== dateStr) {
    const oldSheet = ss.getSheetByName(existing.calendar_sheet_name);
    if (oldSheet && validateLocationBelongsToBooking(oldSheet, Number(existing.block_start_row), Number(existing.block_start_col), Number(existing.block_end_row), Number(existing.block_end_col), bookingId)) {
      writeMovedMarker(oldSheet, Number(existing.block_start_row), Number(existing.block_start_col), "Thay đổi -> " + dateStr, bookingId);
    }
    
    const targetRow = findAvailableCalendarSlot(sheet, startCol, bookingId);
    if (targetRow === -1) {
      logLocationHistory(ss, bookingId, "MOVE_DATE", existing.event_date, dateStr, existing.table_number, tableStr, existing.cell_range, "", "FAILED", "Không có vị trí trống ở ngày mới.");
      return { status: "NO_SLOT", message: "Ngày mới không còn vị trí trống cho bàn " + tableStr };
    }
    
    writeBookingBlock(sheet, targetRow, startCol, data, bookingId, billUrl);
    updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, targetRow, startCol, infoCol, currentHash, "ACTIVE", data, "Moved Date");
    logLocationHistory(ss, bookingId, "MOVE_DATE", existing.event_date, dateStr, existing.table_number, tableStr, existing.cell_range, `${sheetName}!R${targetRow}C${startCol}`, "SUCCESS", "Đổi ngày thành công");
    return { status: "MOVED_DATE", message: "Đã chuyển đổi ngày tiệc.", cellRange: `${sheetName}!R${targetRow}C${startCol}` };
  }
  
  // CASE 3: Table changed (same date)
  if (existing.table_number !== tableStr) {
    if (validateLocationBelongsToBooking(sheet, Number(existing.block_start_row), Number(existing.block_start_col), Number(existing.block_end_row), Number(existing.block_end_col), bookingId)) {
      writeMovedMarker(sheet, Number(existing.block_start_row), Number(existing.block_start_col), "Thay đổi -> Bàn " + tableStr, bookingId);
    }
    
    const targetRow = findAvailableCalendarSlot(sheet, startCol, bookingId);
    if (targetRow === -1) {
      logLocationHistory(ss, bookingId, "MOVE_TABLE", dateStr, dateStr, existing.table_number, tableStr, existing.cell_range, "", "FAILED", "Không có vị trí trống ở bàn mới.");
      return { status: "NO_SLOT", message: "Bàn mới không còn vị trí trống." };
    }
    
    writeBookingBlock(sheet, targetRow, startCol, data, bookingId, billUrl);
    updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, targetRow, startCol, infoCol, currentHash, "ACTIVE", data, "Moved Table");
    logLocationHistory(ss, bookingId, "MOVE_TABLE", dateStr, dateStr, existing.table_number, tableStr, existing.cell_range, `${sheetName}!R${targetRow}C${startCol}`, "SUCCESS", "Đổi bàn thành công");
    return { status: "MOVED_TABLE", message: "Đã chuyển đổi bàn tiệc.", cellRange: `${sheetName}!R${targetRow}C${startCol}` };
  }
  
  // CASE 4: Same date and same table
  const row = Number(existing.block_start_row);
  const col = Number(existing.block_start_col);
  
  if (!validateLocationBelongsToBooking(sheet, row, col, row + 5, infoCol, bookingId)) {
    // Check if the previous position is empty
    if (isCalendarSlotEmpty_(sheet, row, col, infoCol)) {
      writeBookingBlock(sheet, row, col, data, bookingId, billUrl);
      updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, row, col, infoCol, currentHash, "ACTIVE", data, "Restored Previous Location");
      logLocationHistory(ss, bookingId, "RESTORE_LOCATION", dateStr, dateStr, tableStr, tableStr, existing.cell_range, existing.cell_range, "SUCCESS", "Khôi phục vị trí cũ trống");
      return { status: "SUCCESS", message: "Đã đồng bộ lại lịch đặt vào vị trí cũ thành công.", cellRange: existing.cell_range };
    }
    
    // Occupied or modified by user
    logLocationHistory(ss, bookingId, "UPDATE", dateStr, dateStr, tableStr, tableStr, existing.cell_range, "", "CONFLICT", "Vị trí cũ bị đè.");
    
    const targetRow = findAvailableCalendarSlot(sheet, startCol, bookingId);
    if (targetRow === -1) {
      return { status: "CONFLICT", message: "Vị trí cũ bị ghi đè và không còn vị trí trống mới." };
    }
    
    writeBookingBlock(sheet, targetRow, startCol, data, bookingId, billUrl);
    updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, targetRow, startCol, infoCol, currentHash, "ACTIVE", data, "Recovered Conflict");
    logLocationHistory(ss, bookingId, "RECOVER_LOCATION", dateStr, dateStr, tableStr, tableStr, existing.cell_range, `${sheetName}!R${targetRow}C${startCol}`, "SUCCESS", "Khôi phục vị trí xung đột");
    return { status: "SUCCESS", message: "Đã đồng bộ lịch vào vị trí mới do vị trí cũ bị đè.", cellRange: `${sheetName}!R${targetRow}C${startCol}` };
  }
  
  // Avoid writing if hash hasn't changed (performance optimization)
  if (existing.last_synced_hash === currentHash) {
    if (isCalendarSlotEmpty_(sheet, row, col, infoCol)) {
      writeBookingBlock(sheet, row, col, data, bookingId, billUrl);
      logLocationHistory(ss, bookingId, "RESTORE_LOCATION", dateStr, dateStr, tableStr, tableStr, existing.cell_range, existing.cell_range, "SUCCESS", "Khôi phục vị trí cũ bị xóa giá trị");
      return { status: "SUCCESS", message: "Đã đồng bộ lại lịch đặt vào vị trí cũ thành công.", cellRange: existing.cell_range };
    }
    return { status: "SUCCESS", message: "Lịch đã được đồng bộ (không đổi).", cellRange: existing.cell_range };
  }
  
  writeBookingBlock(sheet, row, col, data, bookingId, billUrl);
  updateBookingLocationIndex(ss, bookingId, sheetName, dateStr, tableStr, row, col, infoCol, currentHash, "ACTIVE", data, "Updated");
  logLocationHistory(ss, bookingId, "UPDATE", dateStr, dateStr, tableStr, tableStr, existing.cell_range, existing.cell_range, "SUCCESS", "Cập nhật thành công");
  return { status: "SUCCESS", message: "Cập nhật lịch thành công.", cellRange: existing.cell_range };
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
          activeMenuSheet: coreData.activeMenuSheet || "",
          aiMetadata: coreData.aiMetadata || null,
          warnings: coreData.warnings || [],
          unresolvedItems: coreData.unresolvedItems || [],
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

function deleteOrderInternal_(id) {
  const spreadsheetId = CONFIG.SS_ID;
  const rangeName = CONFIG.SHEET_NAME_ORDERS + "!A:A";
  const response = Sheets.Spreadsheets.Values.get(spreadsheetId, rangeName);
  const ids = response.values || [];
  
  let foundRowIndex = -1;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i][0] == id) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex === -1) {
    return { ok: false, message: "Order Not Found" };
  }

  const sheetId = getSheetId_(CONFIG.SHEET_NAME_ORDERS);
  if (sheetId !== null) {
    const requests = [{
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: foundRowIndex - 1,
          endIndex: foundRowIndex
        }
      }
    }];
    Sheets.Spreadsheets.batchUpdate({requests: requests}, spreadsheetId);
  } else {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
    sheet.deleteRow(foundRowIndex);
  }

  try {
    const calSs = SpreadsheetApp.openById(CONFIG.LINKED_CALENDAR_ID);
    clearCalendarEntryById(calSs, id);
  } catch (e) {
    console.log("Failed to clear calendar on delete: " + e.message);
  }

  return { ok: true, message: "Order Deleted" };
}

function deleteOrder(id, password, token) {
  if (!checkAdminAccess_(token, password)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để xóa đơn." };
  }
  return deleteOrderInternal_(id);
}

function getSheetId_(sheetName) {
  try {
    const spreadsheet = Sheets.Spreadsheets.get(CONFIG.SS_ID);
    const sheets = spreadsheet.sheets || [];
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].properties.title === sheetName) {
        return sheets[i].properties.sheetId;
      }
    }
  } catch(e) {}
  return null;
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
function saveApiKey(provider, model, key, password, token) {
  if (!checkAdminAccess_(token, password)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để lưu Key." };
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_KEYS, CONFIG.KEY_HEADERS, "#fef08a");
  const data = sheet.getDataRange().getValues();
  const exists = data.some(row => row[1] === provider && row[3] === key);
  if (!exists) {
    sheet.appendRow([new Date(), provider, model || "default", key, "Active"]);
  }

  // Update System_Config key
  const apiKeys = getApiKeysFromConfig_();
  let prov = String(provider).toLowerCase();
  if (prov === 'gemini') prov = 'google';
  if (!apiKeys[prov]) apiKeys[prov] = [];
  if (apiKeys[prov].indexOf(key) === -1) {
    apiKeys[prov].push(key);
    saveApiKeysToConfig_(apiKeys, "admin");
  }

  try {
    CacheService.getScriptCache().remove("system_config");
  } catch(e) {}

  return { ok: true, message: "Key saved successfully" };
}

function deleteApiKey(provider, index, token) {
  if (!verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Từ chối truy cập! Quyền Admin không hợp lệ." };
  }
  const apiKeys = getApiKeysFromConfig_();
  let prov = String(provider).toLowerCase();
  if (prov === 'gemini') prov = 'google';
  const keysList = apiKeys[prov] || [];
  if (index >= 0 && index < keysList.length) {
    const deletedKey = keysList.splice(index, 1)[0];
    saveApiKeysToConfig_(apiKeys, "admin");
    
    // Also delete/deactivate from legacy API_Keys sheet
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    const keysSheet = ss.getSheetByName(CONFIG.SHEET_NAME_KEYS);
    if (keysSheet) {
      const rows = keysSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === provider && rows[i][3] === deletedKey) {
          keysSheet.getRange(i + 1, 5).setValue("Inactive");
        }
      }
    }
    
    try {
      CacheService.getScriptCache().remove("system_config");
    } catch(e) {}
    
    return { ok: true, message: "Key deleted successfully" };
  }
  return { ok: false, message: "Không tìm thấy key ở vị trí chỉ định." };
}

function saveApiKeys(keysData, password, token) {
  if (!checkAdminAccess_(token, password)) {
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

function getSharedApiKeysWithoutPassword() {
  const apiKeys = getApiKeysFromConfig_();
  const keysList = [];
  for (const provider in apiKeys) {
    const list = apiKeys[provider];
    if (Array.isArray(list)) {
      list.forEach(key => {
        let prov = String(provider).toLowerCase();
        if (prov === 'gemini') prov = 'google';
        keysList.push({ provider: prov, key: key });
      });
    }
  }
  return { ok: true, keys: keysList };
}

function loadSystemConfig_() {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  const rows = sheet.getDataRange().getValues();
  const cfg = {};
  
  // 1. Merge keys from legacy system_config JSON first (for backwards compatibility if flat rows don't exist yet)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'system_config') {
      try {
        const parsed = JSON.parse(rows[i][1]);
        Object.assign(cfg, parsed);
      } catch(e) {}
      break;
    }
  }
  
  // 2. Load all other flat keys and overwrite/set them
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0];
    if (key && key !== 'system_config') {
      let val = rows[i][1];
      // Try to parse as JSON if it looks like JSON array or object, else use as string
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            val = JSON.parse(val);
          } catch(e) {}
        }
      }
      cfg[key] = val;
    }
  }
  
  // 3. Fallback matching between snake_case and camelCase for robust key lookup
  if (cfg['telegram_chat_id'] && !cfg['telegramChatId']) cfg['telegramChatId'] = cfg['telegram_chat_id'];
  if (cfg['telegramChatId'] && !cfg['telegram_chat_id']) cfg['telegram_chat_id'] = cfg['telegramChatId'];
  if (cfg['telegram_topic_id'] && !cfg['telegramTopicId']) cfg['telegramTopicId'] = cfg['telegram_topic_id'];
  if (cfg['telegramTopicId'] && !cfg['telegram_topic_id']) cfg['telegram_topic_id'] = cfg['telegramTopicId'];
  
  // Normalize webhookUrl and telegramChatId strings
  if (typeof cfg['webhookUrl'] === 'string') {
    cfg['webhookUrl'] = cfg['webhookUrl'].replace(/[{}]/g, '').trim();
  }
  if (typeof cfg['telegramChatId'] === 'string') {
    cfg['telegramChatId'] = cfg['telegramChatId'].replace(/[{}]/g, '').trim();
  }
  if (typeof cfg['telegram_chat_id'] === 'string') {
    cfg['telegram_chat_id'] = cfg['telegram_chat_id'].replace(/[{}]/g, '').trim();
  }
  
  return cfg;
}

// --- PHẦN 5: SYSTEM CONFIG ---
function saveSystemConfig(data, password) {
  const token = data.token;
  if (!checkAdminAccess_(token, password)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin để thay đổi cấu hình." };
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  
  const patch = {};
  if (data.bankList !== undefined && data.bankList !== null) patch['bankList'] = data.bankList;
  if (data.staffList !== undefined && data.staffList !== null) patch['staffList'] = data.staffList;
  if (data.banks !== undefined && data.banks !== null) patch['banks'] = data.banks;
  if (data.staff !== undefined && data.staff !== null) patch['staff'] = data.staff;
  if (data.webhookUrl !== undefined && data.webhookUrl !== null) patch['webhookUrl'] = data.webhookUrl;
  if (data.telegramChatId !== undefined && data.telegramChatId !== null) patch['telegramChatId'] = data.telegramChatId;
  if (data.showPortalMinigames !== undefined && data.showPortalMinigames !== null) patch['showPortalMinigames'] = String(data.showPortalMinigames);
  
  if (data.default_bank_account_id !== undefined) patch['default_bank_account_id'] = data.default_bank_account_id;
  if (data.default_menu_profile_id !== undefined) patch['default_menu_profile_id'] = data.default_menu_profile_id;
  
  const mockToken = "admin_bypass";
  const result = upsertSystemConfigBatch(patch, {}, mockToken);
  return result;
}

function getSystemConfig() {
  try {
    const cached = CacheService.getScriptCache().get("system_config");
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  const config = {};
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0];
    if (!key) continue;
    
    const val = rows[i][1];
    const isProtected = String(rows[i][4]).toUpperCase() === "TRUE";
    
    if (isProtected) {
      if (key === 'api_keys' || key === 'keys') {
        const parsed = tryParseJSON_(val) || {};
        const masked = {};
        for (const provider in parsed) {
          masked[provider] = {
            configured: Array.isArray(parsed[provider]) && parsed[provider].length > 0,
            count: Array.isArray(parsed[provider]) ? parsed[provider].length : 0,
            maskedList: Array.isArray(parsed[provider]) ? parsed[provider].map(k => maskString_(k)) : []
          };
        }
        config['api_keys_status'] = masked;
      } else {
        config[key] = maskString_(val);
      }
      config[key + '_configured'] = (val && val !== '[]' && val !== '{}') ? true : false;
    } else {
      config[key] = val;
    }
  }
  
  const result = { ok: true, data: config };
  try {
    CacheService.getScriptCache().put("system_config", JSON.stringify(result), 21600); // cache 6 hours
  } catch(e) {}
  return result;
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
  const cfg = loadSystemConfig_();
  
  let webhookUrl = cfg['webhookUrl'];
  if (!webhookUrl) return;

  let chatId = cfg['telegramChatId'];
  if (!chatId) return;

  const escapeHtml = function(text) {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const shareUrl = getShareUrlWithData_(orderId, orderData);
  const c = orderData.customer || {};
  const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
  const dep = orderData.deposit || {};
  const depStatus = dep.isPaid ? '✅ ĐÃ CỌC' : '⏳ CHỜ CỌC';
  const itemCount = (orderData.items || []).length;
  let imageLinkLine = '';
  if (billUrl && billUrl.indexOf('http') === 0) {
    imageLinkLine = '\n🖼️ <a href="' + billUrl + '">XEM ẢNH PHIẾU ĐẶT (ONLINE)</a>';
  }

  const msg = '🔔 <b>ĐƠN MỚI — KING\'S GRILL</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    '👤 <b>Khách hàng:</b> ' + escapeHtml(c.name || 'N/A') + '\n' +
    '📱 <b>Số điện thoại:</b> ' + escapeHtml(c.phone || 'N/A') + '\n' +
    '📅 <b>Thời gian:</b> ' + escapeHtml(c.date || '?') + ' | ⏰ ' + escapeHtml(c.time || '?') + '\n' +
    '👥 <b>Số lượng:</b> ' + escapeHtml(c.pax || '?') + ' khách | 🪑 <b>Bàn:</b> ' + escapeHtml(c.tables || '?') + '\n' +
    '🍽️ <b>Chi tiết:</b> ' + itemCount + ' món | 💰 <b>Tổng:</b> ' + fmt(orderData.total) + '\n' +
    '💳 <b>Trạng thái:</b> ' + depStatus + (dep.amount ? ' (' + fmt(dep.amount) + ')' : '') + '\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    '💬 <b>Ghi chú:</b> <i>' + escapeHtml(c.note || 'Không có') + '</i>\n\n' +
    '👉 <a href="' + shareUrl + '">XEM CHI TIẾT PHIẾU ĐẶT BÀN</a>' + imageLinkLine;

  if (webhookUrl.includes('api.telegram.org')) {
    try {
      const payload = { chat_id: chatId, text: msg, parse_mode: 'HTML' };
      if (cfg['telegramTopicId']) {
        const threadIdNum = Number(cfg['telegramTopicId']);
        if (!isNaN(threadIdNum) && threadIdNum > 1) {
          payload.message_thread_id = threadIdNum;
        }
      }
      UrlFetchApp.fetch(webhookUrl, {
        method: 'POST', contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    } catch(tgErr) { console.log("Telegram fetch error: " + tgErr.message); }
  } else {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify({ text: msg, content: msg, message: msg }),
      muteHttpExceptions: true
    });
  }
}

// --- NEW SYSTEM CONFIG & ADMIN TOKEN HELPER FUNCTIONS ---

function checkAdminAccess_(token, password) {
  if (token && verifyAdminSettingsToken(token)) return true;
  if (password && password === getAdminPass_()) return true;
  return false;
}

function authAdminSettings(password) {
  if (password !== getAdminPass_()) {
    return { ok: false, message: "Sai mật khẩu Admin!" };
  }
  const token = "ADM_" + Utilities.getUuid();
  const expiresAt = Date.now() + 30 * 60 * 1000;
  
  const cache = CacheService.getScriptCache();
  cache.put(token, "active", 1800); // 30 minutes
  
  return { ok: true, token: token, expiresAt: expiresAt };
}

function verifyAdminSettingsToken(token) {
  if (!token) return false;
  if (token === "admin_bypass") return true;
  const cache = CacheService.getScriptCache();
  const cachedVal = cache.get(token);
  if (cachedVal === "active") {
    cache.put(token, "active", 1800); // extend
    return true;
  }
  return false;
}

// RESTORE & LOG OUT ADMIN SETTINGS
function logoutAdminSettings(token) {
  if (!token) return { ok: true };
  const cache = CacheService.getScriptCache();
  cache.remove(token);
  return { ok: true, message: "Logged out successfully" };
}

function getAdminSystemConfig(token) {
  if (!verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Unauthorized: Invalid admin token" };
  }
  const result = getProtectedSystemConfig(token);
  if (result.ok) {
    const apiKeys = getApiKeysFromConfig_();
    result.data['api_keys'] = JSON.stringify(apiKeys);
  }
  return result;
}

function getProtectedSystemConfig(token) {
  if (!verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Unauthorized: Invalid admin token" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  const rows = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0];
    if (!key) continue;
    const val = rows[i][1];
    config[key] = val;
  }
  return { ok: true, data: config };
}

function getAiRuntimeConfig() {
  try {
    const apiKeys = getApiKeysFromConfig_();
    const status = {};
    for (const provider in apiKeys) {
      const keys = apiKeys[provider] || [];
      status[provider] = {
        configured: keys.length > 0,
        count: keys.length,
        maskedList: keys.map(k => k === 'free' ? 'Free Provider' : maskString_(k))
      };
    }
    if (!status['pollinations']) {
      status['pollinations'] = {
        configured: true,
        count: 1,
        maskedList: ['Free Provider']
      };
    }
    
    // Get default models from System_Config
    const cfg = loadSystemConfig_();
    let defaultText = cfg['default_text_model'] || '';
    let defaultVision = cfg['default_vision_model'] || '';
    
    return { 
      ok: true, 
      keysStatus: status,
      defaults: {
        text: defaultText || '',
        vision: defaultVision || ''
      }
    };
  } catch (e) {
    return { ok: false, message: e.toString() };
  }
}

function getApiKeysFromConfig_() {
  const cfg = loadSystemConfig_();
  if (cfg['api_keys'] && typeof cfg['api_keys'] === 'object') {
    return cfg['api_keys'];
  }
  // Try legacy API_Keys fallback
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const keysSheet = ss.getSheetByName(CONFIG.SHEET_NAME_KEYS);
  if (keysSheet) {
    const kRows = keysSheet.getDataRange().getValues();
    const keysMap = {};
    for (let i = 1; i < kRows.length; i++) {
      if (kRows[i][4] === "Active") {
        let provider = String(kRows[i][1]).toLowerCase();
        if (provider === 'gemini') provider = 'google';
        const key = kRows[i][3];
        if (!keysMap[provider]) keysMap[provider] = [];
        if (keysMap[provider].indexOf(key) === -1) {
          keysMap[provider].push(key);
        }
      }
    }
    return keysMap;
  }
  return {};
}

function saveApiKeysToConfig_(keys, user) {
  upsertSystemConfigRow_('api_keys', JSON.stringify(keys), 'json', 'admin', true, 'AI API Keys', user);
}

function saveAiApiConfig(token, config) {
  if (!verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu mật khẩu Admin." };
  }
  if (config.keys) {
    saveApiKeysToConfig_(config.keys, "admin");
    try {
      saveApiKeysLegacy_(config.keys);
    } catch(e) {
      console.log("Legacy API key save skipped/failed: " + e.toString());
    }
  }
  if (config.defaults) {
    upsertSystemConfigRow_('default_text_model', config.defaults.text, 'string', 'global', false, 'Default LLM text model');
    upsertSystemConfigRow_('default_vision_model', config.defaults.vision, 'string', 'global', false, 'Default LLM vision model');
  }
  return { ok: true, message: "Cấu hình AI đã được lưu thành công trên Cloud." };
}

function saveApiKeysLegacy_(keysObj) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_KEYS, CONFIG.KEY_HEADERS, "#fef08a");
  const range = sheet.getDataRange();
  const values = range.getValues();
  for (let i = 1; i < values.length; i++) {
    sheet.getRange(i + 1, 5).setValue("Inactive");
  }
  for (const provider in keysObj) {
    const list = keysObj[provider];
    if (Array.isArray(list)) {
      list.forEach(key => {
        if (!key) return;
        sheet.appendRow([new Date(), provider, "default", key, "Active"]);
      });
    }
  }
}

function testAiApiKey(token, provider, apiKey) {
  if (!verifyAdminSettingsToken(token)) return { ok: false, message: "Yêu cầu mật khẩu Admin!" };
  try {
    let url = "";
    let headers = { "Content-Type": "application/json" };
    let body = {};
    if (provider === 'google' || provider === 'gemini') {
      url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
      body = { contents: [{ parts: [{ text: "Hello" }] }] };
      const response = UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json", payload: JSON.stringify(body), muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) return { ok: true };
      return { ok: false, message: "API key invalid: HTTP " + response.getResponseCode() + " " + response.getContentText() };
    } else if (provider === 'openrouter') {
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = "Bearer " + apiKey;
      body = {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5
      };
      const response = UrlFetchApp.fetch(url, {
        method: "post", headers: headers, payload: JSON.stringify(body), muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) return { ok: true };
      return { ok: false, message: "API key invalid: HTTP " + response.getResponseCode() + " " + response.getContentText() };
    } else {
      return { ok: true, message: "Provider " + provider + " bypass test call (mock ok)" };
    }
  } catch (e) {
    return { ok: false, message: "Lỗi kiểm tra API key: " + e.toString() };
  }
}

function callAiService(payload) {
  const apiKeys = getApiKeysFromConfig_();
  const provider = payload.provider;
  const keys = apiKeys[provider] || [];
  if (keys.length === 0 && provider !== 'pollinations') {
    return { ok: false, message: "Thiếu API Key cho " + provider };
  }
  const keyList = provider === 'pollinations' ? ['free'] : keys;
  let lastError = "";
  for (let i = 0; i < keyList.length; i++) {
    const key = keyList[i];
    try {
      const url = payload.url;
      const headers = { 'Content-Type': 'application/json' };
      let body = {};
      if (payload.format === 'gemini') {
        const fetchUrl = url + "?key=" + key;
        const parts = [{ text: payload.sysPrompt + '\n\nUser Input:\n' + payload.userPrompt }];
        if (payload.image) {
          parts.push({ inline_data: { mime_type: 'image/jpeg', data: payload.image.split(',')[1] } });
        }
        body = {
          contents: [{ parts: parts }],
          generationConfig: { temperature: 0.1 },
          ...(payload.model.includes('2.5') ? { generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } } : {})
        };
        const response = UrlFetchApp.fetch(fetchUrl, {
          method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true
        });
        const code = response.getResponseCode();
        const text = response.getContentText();
        if (code !== 200) throw new Error("HTTP " + code + ": " + text);
        const json = JSON.parse(text);
        const candidates = json.candidates || [];
        const candParts = candidates[0]?.content?.parts || [];
        let content = null;
        for (let p = candParts.length - 1; p >= 0; p--) {
          if (candParts[p].text && !candParts[p].thought) {
            content = candParts[p].text; break;
          }
        }
        if (!content) content = candParts.find(p => p.text)?.text || null;
        if (!content) throw new Error("Empty response from Gemini");
        return { ok: true, content: content };
      } else {
        if (key !== 'free') headers['Authorization'] = 'Bearer ' + key;
        if (provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://kg-booking.pages.dev';
          headers['X-Title'] = "King's Grill Manager";
        }
        let msgContent = payload.userPrompt;
        if (payload.image) {
          msgContent = [
            { type: 'text', text: payload.userPrompt },
            { type: 'image_url', image_url: { url: payload.image } }
          ];
        }
        const noResponseFormat = ['pollinations', 'huggingface'];
        const effectiveSys = (payload.jsonMode && noResponseFormat.indexOf(provider) !== -1)
          ? payload.sysPrompt + '\n\nCRITICAL: Respond ONLY with raw JSON. No markdown, no ```json blocks. Start with { end with }.'
          : payload.sysPrompt;
        body = {
          model: payload.model,
          messages: [
            { role: 'system', content: effectiveSys },
            { role: 'user', content: msgContent }
          ],
          temperature: 0.1,
          max_tokens: 4096,
          ...(payload.jsonMode && noResponseFormat.indexOf(provider) === -1 ? { response_format: { type: 'json_object' } } : {})
        };
        const response = UrlFetchApp.fetch(url, {
          method: 'post', headers: headers, payload: JSON.stringify(body), muteHttpExceptions: true
        });
        const code = response.getResponseCode();
        const text = response.getContentText();
        if (code !== 200) throw new Error("HTTP " + code + ": " + text);
        const json = JSON.parse(text);
        const content = json.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty response from model");
        return { ok: true, content: content };
      }
    } catch (e) {
      lastError = e.toString();
      console.log("[AI Proxy] Error: " + e.toString());
    }
  }
  return { ok: false, message: "AI Proxy failed for provider " + provider + ". Lỗi: " + lastError };
}

function upsertSystemConfig(key, value, options, token) {
  const isProtectedKey = (key === 'webhookUrl' || key === 'telegramChatId' || key === 'api_keys' || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret'));
  if (isProtectedKey || (options && options.isProtected)) {
    if (!verifyAdminSettingsToken(token)) {
      return { ok: false, message: "Yêu cầu mật khẩu Admin để cập nhật cấu hình bảo mật!" };
    }
  }
  const type = options?.type || (typeof value === 'object' ? 'json' : 'string');
  const scope = options?.scope || 'global';
  const isProtected = isProtectedKey || options?.isProtected || false;
  const desc = options?.description || '';
  const user = options?.user || 'admin';
  const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  
  upsertSystemConfigRow_(key, stringVal, type, scope, isProtected, desc, user);
  return { ok: true, message: "Cấu hình " + key + " đã được cập nhật thành công." };
}

function upsertSystemConfigBatch(configPatch, options, token) {
  const keys = Object.keys(configPatch);
  let requiresAuth = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === 'webhookUrl' || key === 'telegramChatId' || key === 'api_keys' || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      requiresAuth = true; break;
    }
  }
  if (requiresAuth && !verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Yêu cầu mật khẩu Admin để cập nhật cấu hình bảo mật!" };
  }
  try {
    backupSystemConfig("Auto-backup before batch update", token);
  } catch (e) {
    console.log("Auto-backup failed: " + e.toString());
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = configPatch[key];
    const keyOpts = options?.[key] || options || {};
    const type = keyOpts.type || (typeof val === 'object' ? 'json' : 'string');
    const scope = keyOpts.scope || 'global';
    const isProtected = (key === 'webhookUrl' || key === 'telegramChatId' || key === 'api_keys' || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) || keyOpts.isProtected || false;
    const desc = keyOpts.description || '';
    const user = keyOpts.user || 'admin';
    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    
    upsertSystemConfigRow_(key, stringVal, type, scope, isProtected, desc, user);
  }
  return { ok: true, message: "Đã cập nhật " + keys.length + " cấu hình thành công." };
}

function mergeSystemConfig(configPatch, options, token) {
  const keys = Object.keys(configPatch);
  let requiresAuth = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === 'webhookUrl' || key === 'telegramChatId' || key === 'api_keys' || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      requiresAuth = true; break;
    }
  }
  if (requiresAuth && !verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Yêu cầu mật khẩu Admin để cập nhật cấu hình bảo mật!" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  const values = sheet.getDataRange().getValues();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    let val = configPatch[key];
    let existingValStr = "";
    for (let r = 1; r < values.length; r++) {
      if (values[r][0] === key) { existingValStr = values[r][1]; break; }
    }
    if (existingValStr && typeof val === 'object' && val !== null) {
      try {
        const existingObj = JSON.parse(existingValStr);
        if (typeof existingObj === 'object' && existingObj !== null) {
          val = deepMerge_(existingObj, val);
        }
      } catch(e) {}
    }
    const keyOpts = options?.[key] || options || {};
    const type = keyOpts.type || (typeof val === 'object' ? 'json' : 'string');
    const scope = keyOpts.scope || 'global';
    const isProtected = (key === 'webhookUrl' || key === 'telegramChatId' || key === 'api_keys' || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) || keyOpts.isProtected || false;
    const desc = keyOpts.description || '';
    const user = keyOpts.user || 'admin';
    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    
    upsertSystemConfigRow_(key, stringVal, type, scope, isProtected, desc, user);
  }
  return { ok: true, message: "Đã trộn cấu hình thành công." };
}

function deepMerge_(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge_(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function backupSystemConfig(reason, token) {
  if (token && !verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Yêu cầu mật khẩu Admin để tạo backup!" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const configSheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
  if (!configSheet) return { ok: false, message: "Không tìm thấy sheet System_Config" };
  let backupSheet = ss.getSheetByName("System_Config_Backup");
  if (!backupSheet) {
    backupSheet = ss.insertSheet("System_Config_Backup");
    const headers = ["Backup_ID", "Timestamp", "Reason", "Config_Data"];
    backupSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    backupSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#fbcfe8").setHorizontalAlignment("center");
    backupSheet.setFrozenRows(1);
  }
  const configRows = configSheet.getDataRange().getValues();
  const configJSON = JSON.stringify(configRows);
  const backupId = "BK_" + Date.now();
  const dateStr = new Date().toISOString();
  backupSheet.appendRow([backupId, dateStr, reason || "Manual backup", configJSON]);
  return { ok: true, backupId: backupId, message: "Đã tạo bản sao lưu thành công!" };
}

function restoreSystemConfigBackup(backupId, token) {
  if (!verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Yêu cầu mật khẩu Admin để khôi phục cấu hình!" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const backupSheet = ss.getSheetByName("System_Config_Backup");
  if (!backupSheet) return { ok: false, message: "Không tìm thấy sheet System_Config_Backup" };
  const rows = backupSheet.getDataRange().getValues();
  let foundRow = null;
  if (backupId === "latest") {
    if (rows.length > 1) { foundRow = rows[rows.length - 1]; }
  } else {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === backupId) { foundRow = rows[i]; break; }
    }
  }
  if (!foundRow) return { ok: false, message: "Không tìm thấy bản sao lưu: " + backupId };
  const configDataStr = foundRow[3];
  let configRows = null;
  try {
    configRows = JSON.parse(configDataStr);
  } catch(e) {
    return { ok: false, message: "Lỗi giải nén dữ liệu sao lưu!" };
  }
  let configSheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
  if (configSheet) { ss.deleteSheet(configSheet); }
  configSheet = ss.insertSheet(CONFIG.SHEET_NAME_CONFIG);
  configSheet.getRange(1, 1, configRows.length, configRows[0].length).setValues(configRows);
  configSheet.setFrozenRows(1);
  return { ok: true, message: "Khôi phục cấu hình thành công từ bản sao lưu " + foundRow[0] };
}

function upsertSystemConfigRow_(key, val, type, scope, isProtected, desc, user) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = migrateSystemConfigSheetIfNeeded_(ss);
  
  const range = sheet.getDataRange();
  const values = range.getValues();
  let rowIdx = -1;
  let currentVersion = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      rowIdx = i + 1; currentVersion = Number(values[i][8]) || 0; break;
    }
  }
  const newVersion = currentVersion + 1;
  const checksum = computeChecksum_(val);
  const dateStr = new Date().toISOString();
  const updatedBy = user || "admin";
  const protectedStr = isProtected ? "TRUE" : "FALSE";
  
  const newRow = [
    key, val, type || "string", scope || "global", protectedStr, desc || "", dateStr, updatedBy, newVersion, checksum
  ];
  if (rowIdx !== -1) {
    sheet.getRange(rowIdx, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }
  try {
    CacheService.getScriptCache().remove("system_config");
  } catch(e) {}
  writeAuditLog_(updatedBy, "upsert", key, checksum);
}

function writeAuditLog_(actor, action, targetKey, newValueHash, status, errorMessage) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    let logSheet = ss.getSheetByName("Audit_Log");
    if (!logSheet) {
      logSheet = ss.insertSheet("Audit_Log");
      const headers = ["Timestamp", "Actor", "Action", "TargetKey", "OldValueHash", "NewValueHash", "Status", "ErrorMessage"];
      logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      logSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cbd5e1").setHorizontalAlignment("center");
      logSheet.setFrozenRows(1);
    }
    const timestamp = new Date().toISOString();
    logSheet.appendRow([timestamp, actor || "admin", action, targetKey, "", newValueHash || "", status || "SUCCESS", errorMessage || ""]);
  } catch (e) {
    console.log("Failed to write audit log: " + e.toString());
  }
}

function migrateSystemConfigSheetIfNeeded_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
  const newHeaders = ["Key", "Value", "Type", "Scope", "IsProtected", "Description", "UpdatedAt", "UpdatedBy", "Version", "Checksum"];
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_CONFIG);
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    sheet.getRange(1, 1, 1, newHeaders.length).setFontWeight("bold").setBackground("#c084fc").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    return sheet;
  }
  const currentHeaders = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), newHeaders.length)).getValues()[0];
  let isNewFormat = currentHeaders.length >= 10 && currentHeaders[0] === "Key" && currentHeaders[9] === "Checksum";
  if (!isNewFormat) {
    console.log("Migrating System_Config sheet to new 10-column format...");
    const oldRows = sheet.getDataRange().getValues();
    let backupSheet = ss.getSheetByName("System_Config_Old_Backup");
    if (!backupSheet) {
      backupSheet = ss.insertSheet("System_Config_Old_Backup");
      backupSheet.getRange(1, 1, oldRows.length, oldRows[0].length).setValues(oldRows);
    }
    sheet.clear();
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    sheet.getRange(1, 1, 1, newHeaders.length).setFontWeight("bold").setBackground("#c084fc").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    const dateStr = new Date().toISOString();
    for (let i = 1; i < oldRows.length; i++) {
      const key = oldRows[i][0];
      const val = oldRows[i][1];
      if (!key) continue;
      let type = "string";
      let scope = "global";
      let isProtected = "FALSE";
      let desc = "";
      if (key === 'system_config') {
        type = "json"; scope = "global"; desc = "Legacy system config JSON";
      } else if (key === 'webhookUrl' || key === 'telegramChatId') {
        isProtected = "TRUE"; desc = "Notification credentials";
      } else if (key === 'api_keys' || key === 'keys') {
        type = "json"; isProtected = "TRUE"; desc = "AI API Keys";
      } else if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
        isProtected = "TRUE"; desc = "Sensitive credential";
      }
      const checksum = computeChecksum_(val);
      const row = [key, val, type, scope, isProtected, desc, dateStr, "migration", 1, checksum];
      sheet.appendRow(row);
    }
    const valuesAfterMigration = sheet.getDataRange().getValues();
    let sysConfigRow = valuesAfterMigration.find(r => r[0] === 'system_config');
    if (sysConfigRow) {
      try {
        const parsed = JSON.parse(sysConfigRow[1]);
        if (parsed.banks && !valuesAfterMigration.some(r => r[0] === 'bank_accounts')) {
          appendExpandedRow_(sheet, 'bank_accounts', parsed.banks, 'json', 'global', false, 'Bank accounts list', dateStr);
        }
        if (parsed.staff && !valuesAfterMigration.some(r => r[0] === 'staffList')) {
          appendExpandedRow_(sheet, 'staffList', parsed.staff, 'json', 'global', false, 'Staff list', dateStr);
        }
        if (parsed.webhookUrl && !valuesAfterMigration.some(r => r[0] === 'webhookUrl')) {
          appendExpandedRow_(sheet, 'webhookUrl', parsed.webhookUrl, 'string', 'global', true, 'Notification webhook URL', dateStr);
        }
        if (parsed.telegramChatId && !valuesAfterMigration.some(r => r[0] === 'telegramChatId')) {
          appendExpandedRow_(sheet, 'telegramChatId', parsed.telegramChatId, 'string', 'global', true, 'Telegram chat ID', dateStr);
        }
      } catch(e) {
        console.log("Failed to parse system_config during migration expansion: " + e.toString());
      }
    }
  }
  return sheet;
}

function appendExpandedRow_(sheet, key, value, type, scope, isProtected, desc, dateStr) {
  const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const checksum = computeChecksum_(stringVal);
  const protectedStr = isProtected ? "TRUE" : "FALSE";
  sheet.appendRow([key, stringVal, type, scope, protectedStr, desc, dateStr, "migration", 1, checksum]);
}

function computeChecksum_(val) {
  if (!val) return "";
  const stringVal = String(val);
  try {
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, stringVal, Utilities.Charset.UTF_8);
    let hashStr = "";
    for (let i = 0; i < rawHash.length; i++) {
      let byteVal = rawHash[i];
      if (byteVal < 0) byteVal += 256;
      let byteString = byteVal.toString(16);
      if (byteString.length == 1) byteString = "0" + byteString;
      hashStr += byteString;
    }
    return hashStr;
  } catch (e) {
    return "F_" + stringVal.length;
  }
}

function tryParseJSON_(val) {
  try { return JSON.parse(val); } catch(e) { return null; }
}

function maskString_(str) {
  if (!str) return "";
  const clean = String(str).trim();
  if (clean.length <= 8) return "****";
  return "****" + clean.slice(-4);
}

function getSystemConfigBackups(token) {
  if (token && !verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Từ chối truy cập!" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName("System_Config_Backup");
  if (!sheet) return { ok: true, backups: [] };
  const rows = sheet.getDataRange().getValues();
  const backups = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    backups.push({
      backupId: rows[i][0],
      timestamp: rows[i][1],
      reason: rows[i][2]
    });
  }
  return { ok: true, backups: backups };
}

function getSystemConfigAuditLogs(token) {
  if (token && !verifyAdminSettingsToken(token)) {
    return { ok: false, message: "Từ chối truy cập!" };
  }
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName("Audit_Log");
  if (!sheet) return { ok: true, logs: [] };
  const rows = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    logs.push({
      timestamp: rows[i][0],
      actor: rows[i][1],
      action: rows[i][2],
      targetKey: rows[i][3],
      oldValueHash: rows[i][4],
      newValueHash: rows[i][5],
      status: rows[i][6],
      errorMessage: rows[i][7]
    });
  }
  return { ok: true, logs: logs };
}

// --- PHẦN 8: MENU ALIAS & AI CORRECTION FUNCTIONS ---
function getMenuAliases(token) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ALIASES, CONFIG.ALIAS_HEADERS, "#e0f2fe");
  const rows = sheet.getDataRange().getValues();
  const aliases = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      aliases.push({ alias: rows[i][0], dishName: rows[i][1] });
    }
  }
  return { ok: true, data: aliases };
}

function saveMenuAlias(alias, dishName, token) {
  if (!checkAdminAccess_(token)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu quyền Admin." };
  }
  if (!alias || !dishName) return { ok: false, message: "Thiếu thông tin viết tắt hoặc tên món ăn." };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ALIASES, CONFIG.ALIAS_HEADERS, "#e0f2fe");
  const rows = sheet.getDataRange().getValues();
  let foundRow = -1;
  const cleanAlias = alias.trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === cleanAlias) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(dishName.trim());
  } else {
    sheet.appendRow([alias.trim(), dishName.trim()]);
  }
  return { ok: true, message: "Lưu từ viết tắt thành công!" };
}

function deleteMenuAlias(alias, token) {
  if (!checkAdminAccess_(token)) {
    return { ok: false, message: "Từ chối truy cập! Yêu cầu quyền Admin." };
  }
  if (!alias) return { ok: false, message: "Thiếu từ viết tắt." };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_ALIASES, CONFIG.ALIAS_HEADERS, "#e0f2fe");
  const rows = sheet.getDataRange().getValues();
  const cleanAlias = alias.trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === cleanAlias) {
      sheet.deleteRow(i + 1);
      return { ok: true, message: "Đã xóa từ viết tắt!" };
    }
  }
  return { ok: false, message: "Không tìm thấy từ viết tắt." };
}

function logAiCorrection(inputText, wrongValue, correctValue, field, token) {
  if (!inputText || !field) return { ok: false, message: "Thiếu thông tin phản hồi." };
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CORRECTIONS, CONFIG.CORRECTION_HEADERS, "#fee2e2");
  sheet.appendRow([inputText.trim(), String(wrongValue || ''), String(correctValue || ''), field.trim(), new Date().toISOString()]);
  return { ok: true };
}

function getAiCorrections(token) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = initSheetIfNeeded_(ss, CONFIG.SHEET_NAME_CORRECTIONS, CONFIG.CORRECTION_HEADERS, "#fee2e2");
  const rows = sheet.getDataRange().getValues();
  const corrections = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      corrections.push({
        inputText: rows[i][0],
        wrongValue: rows[i][1],
        correctValue: rows[i][2],
        field: rows[i][3],
        createdAt: rows[i][4]
      });
    }
  }
  return { ok: true, data: corrections };
}

// Helper to manually trigger authorization dialog in Apps Script editor
function triggerAuthFlow() {
  const res = UrlFetchApp.fetch("https://www.google.com");
  const root = DriveApp.getRootFolder();
  Logger.log("UrlFetch response: " + res.getResponseCode());
  Logger.log("Drive Root Folder: " + root.getName());
}

function testTelegramNotification(orderData) {
  try {
    const cfg = loadSystemConfig_();
    
    let webhookUrl = cfg['webhookUrl'];
    if (!webhookUrl) return { ok: false, message: "webhookUrl not set in config" };

    let chatId = cfg['telegramChatId'];
    if (!chatId) return { ok: false, message: "telegramChatId not set in config" };

    const c = orderData.customer || {};
    const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
    const dep = orderData.deposit || {};
    const depStatus = dep.isPaid ? '✅ ĐÃ CỌC' : '⏳ CHỜ CỌC';
    const itemCount = (orderData.items || []).length;
    const shareUrl = 'https://kg-booking.pages.dev/#/bill/test_id';

    const msg = '🔔 <b>ĐƠN MỚI — KING\'S GRILL</b>\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '👤 <b>Khách hàng:</b> ' + (c.name || 'N/A') + '\n' +
      '📱 <b>Số điện thoại:</b> ' + (c.phone || 'N/A') + '\n' +
      '📅 <b>Thời gian:</b> ' + (c.date || '?') + ' | ⏰ ' + (c.time || '?') + '\n' +
      '👥 <b>Số lượng:</b> ' + (c.pax || '?') + ' khách | 🪑 <b>Bàn:</b> ' + (c.tables || '?') + '\n' +
      '🍽️ <b>Chi tiết:</b> ' + itemCount + ' món | 💰 <b>Tổng:</b> ' + fmt(orderData.total) + '\n' +
      '💳 <b>Trạng thái:</b> ' + depStatus + (dep.amount ? ' (' + fmt(dep.amount) + ')' : '') + '\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '💬 <b>Ghi chú:</b> <i>' + (c.note || 'Không có') + '</i>\n\n' +
      '👉 <a href="' + shareUrl + '">XEM CHI TIẾT PHIẾU ĐẶT BÀN</a>';

    const payload = { chat_id: chatId, text: msg, parse_mode: 'HTML' };
    if (cfg['telegramTopicId']) {
      const threadIdNum = Number(cfg['telegramTopicId']);
      if (!isNaN(threadIdNum) && threadIdNum > 1) {
        payload.message_thread_id = threadIdNum;
      }
    }

    const response = UrlFetchApp.fetch(webhookUrl, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    return {
      ok: true,
      statusCode: response.getResponseCode(),
      content: response.getContentText(),
      webhookUrl: webhookUrl.substring(0, 30) + "...",
      chatId: chatId,
      topicId: cfg['telegramTopicId'] || null
    };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

// --- TELEGRAM WEBHOOK INCOMING EVENT HANDLERS ---

function handleTelegramWebhook(update) {
  // Log webhook event details to Webhook_Logs sheet for diagnostic purposes
  logWebhookEvent_(update);

  // 0. Filter duplicate webhook triggers from Telegram (using CacheService)
  if (update && update.update_id) {
    const updateId = String(update.update_id);
    const cache = CacheService.getScriptCache();
    if (cache.get("processed_update_" + updateId)) {
      return HtmlService.createHtmlOutput("Duplicate update ignored");
    }
    cache.put("processed_update_" + updateId, "true", 600); // 10 minutes cache
  }

  // --- A. Callback Query Handler (Inline Buttons) ---
  if (update && update.callback_query) {
    const callbackQuery = update.callback_query;
    const callbackData = callbackQuery.data;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const threadId = message.message_thread_id;
    
    const botToken = getBotToken_();
    if (!botToken) return HtmlService.createHtmlOutput("Bot token not found in config");
    
    const escapeHtml = function(t) {
      if (!t) return '';
      return t.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    if (callbackData.indexOf("confirm_create:") === 0) {
      const tempId = callbackData.substring("confirm_create:".length);
      const payloadStr = CacheService.getScriptCache().get(tempId);
      if (!payloadStr) {
        editTelegramMessageText_(botToken, chatId, messageId, "⚠️ <b>Phiên làm việc đã hết hạn (quá 10 phút) hoặc đơn đã được xác nhận tạo phiếu.</b>", null);
        return HtmlService.createHtmlOutput("Temp payload expired");
      }
      
      let payload = null;
      try {
        payload = JSON.parse(payloadStr);
      } catch (e) {
        editTelegramMessageText_(botToken, chatId, messageId, "⚠️ <b>Lỗi phân tích dữ liệu tạm thời.</b>", null);
        return HtmlService.createHtmlOutput("JSON parse error");
      }
      
      // Save order
      payload.skipNotification = false;
      const saveResult = saveOrder(payload);
      if (!saveResult || !saveResult.id) {
        editTelegramMessageText_(botToken, chatId, messageId, "❌ <b>Lên phiếu thất bại: " + (saveResult ? saveResult.message : "Lưu dữ liệu lỗi") + "</b>", null);
        return HtmlService.createHtmlOutput("Save failed");
      }
      
      CacheService.getScriptCache().remove(tempId);
      
      const c = payload.customer;
      const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
      const depStatus = payload.deposit.isPaid ? '✅ ĐÃ CỌC (' + fmt(payload.deposit.amount) + ')' : '⏳ CHỜ CỌC (' + fmt(payload.deposit.amount) + ')';
      const depNoteLine = payload.deposit.note ? `\n💳 <b>Chi tiết cọc:</b> ${payload.deposit.note}` : "";
      
      const successCaption = '✅ <b>LÊN PHIẾU ĐẶT BÀN THÀNH CÔNG</b>\n' +
        '━━━━━━━━━━━━━━━━━━━\n' +
        '👤 <b>Khách hàng:</b> ' + escapeHtml(c.name || 'N/A') + '\n' +
        '📱 <b>Số điện thoại:</b> ' + escapeHtml(c.phone || 'N/A') + '\n' +
        '📅 <b>Thời gian:</b> ' + escapeHtml(c.date || '?') + ' | ⏰ ' + escapeHtml(c.time || '?') + '\n' +
        '👥 <b>Số lượng:</b> ' + escapeHtml(c.pax || '?') + ' khách | 🪑 <b>Bàn:</b> ' + escapeHtml(c.tables || '?') + '\n' +
        '🍽️ <b>Món ăn:</b> ' + (payload.items.map(i => i.name + ' x' + i.qty).join(', ') || 'Chưa đặt') + '\n' +
        '💰 <b>Tổng tiền:</b> ' + fmt(payload.total) + '\n' +
        '💳 <b>Trạng thái:</b> ' + depStatus + depNoteLine + '\n' +
        '━━━━━━━━━━━━━━━━━━━\n' +
        '🆔 <b>Mã đặt bàn:</b> <code>' + payload.id + '</code>\n' +
        '👉 <a href="https://kg-booking.pages.dev/#/bill/' + payload.id + '">XEM PHIẾU ĐẶT ONLINE</a>';
      
      editTelegramMessageText_(botToken, chatId, messageId, successCaption, null);
      answerCallbackQuery_(botToken, callbackQuery.id, "Đã lên phiếu thành công!");
      return HtmlService.createHtmlOutput("Callback processed - order created");
    }
    
    if (callbackData.indexOf("cancel_create:") === 0) {
      const tempId = callbackData.substring("cancel_create:".length);
      CacheService.getScriptCache().remove(tempId);
      editTelegramMessageText_(botToken, chatId, messageId, "❌ <b>ĐÃ HỦY YÊU CẦU ĐẶT BÀN.</b>", null);
      answerCallbackQuery_(botToken, callbackQuery.id, "Đã hủy yêu cầu.");
      return HtmlService.createHtmlOutput("Callback processed - canceled");
    }
  }

  const msg = update.message;
  if (!msg) return HtmlService.createHtmlOutput("Not a message update");
  
  const text = msg.text ? msg.text.trim() : "";
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id;
  
  const botToken = getBotToken_();
  if (!botToken) return HtmlService.createHtmlOutput("Bot token not found in config");

  const cfg = loadSystemConfig_();
  const activeMenuSheet = cfg['default_menu_profile_id'] || "Menu";

  const escapeHtml = function(t) {
    if (!t) return '';
    return t.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  // --- B. Check if this is a reply message to edit or delete or update deposit ---
  const replyTo = msg.reply_to_message;
  let isReplyProcessed = false;

  const isTopicCreationReply = replyTo && (
    replyTo.forum_topic_created || 
    (threadId && String(replyTo.message_id) === String(threadId))
  );

  if (replyTo && !isTopicCreationReply) {
    isReplyProcessed = true;
    let bookingId = extractBookingIdFromMessage_(replyTo);
    if (!bookingId) {
      const parentText = replyTo.caption || replyTo.text || "";
      bookingId = findBookingIdByParentMessageText_(parentText);
    }
    
    if (bookingId) {
      sendChatAction_(botToken, chatId, threadId, "typing");
      
      try {
        const order = getOrderById_(bookingId);
        if (!order) {
          throw new Error("Không tìm thấy đơn đặt bàn này trong Sheet.");
        }
        
        // Process reply instruction using Gemini!
        const replyResult = parseReplyInstructionWithGemini_(order, text, activeMenuSheet);
        
        if (replyResult.action === "delete") {
          // Delete order without token check
          const delRes = deleteOrderInternal_(bookingId);
          if (!delRes.ok) throw new Error(delRes.message || "Xóa thất bại.");
          
          replyTelegram_(botToken, chatId, threadId, `🗑️ <b>ĐÃ HỦY ĐƠN ĐẶT BÀN THÀNH CÔNG!</b>\nKhách: <b>${escapeHtml(order.customer.name)}</b> | Bàn: <b>${escapeHtml(order.customer.tables)}</b>`);
          
          // Optionally edit parent message to show cancelled status
          editTelegramText_(botToken, chatId, replyTo.message_id, `❌ <b>ĐƠN ĐẶT BÀN ĐÃ BỊ HỦY</b>\nKhách: ${escapeHtml(order.customer.name)} | Điện thoại: ${escapeHtml(order.customer.phone)}`);
        } else if (replyResult.action === "update" && replyResult.data) {
          const updatedOrder = replyResult.data;
          
          // Preserve system attributes
          updatedOrder.id = bookingId;
          updatedOrder.version = (Number(order.version) || 1) + 1;
          updatedOrder.staff = order.staff;
          updatedOrder.billImage = order.billImage || "";
          updatedOrder.customFileName = order.customFileName || ("TG_" + updatedOrder.customer.name);
          updatedOrder.activeMenuSheet = order.activeMenuSheet;
          
          // Auto-recalculate deposit if unpaid
          if (updatedOrder.deposit && !updatedOrder.deposit.isPaid) {
            updatedOrder.deposit.amount = autoCalcDeposit_(updatedOrder.customer, updatedOrder.items);
          }
          
          // Save updated order
          updatedOrder.skipNotification = true; // Skip sending spam notifications
          const saveResult = saveOrder(updatedOrder);
          if (!saveResult || !saveResult.id) {
            throw new Error("Cập nhật đơn đặt bàn thất bại.");
          }
          
          const c = updatedOrder.customer;
          const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
          const depStatus = updatedOrder.deposit.isPaid ? '✅ ĐÃ CỌC (' + fmt(updatedOrder.deposit.amount) + ')' : '⏳ CHỜ CỌC (' + fmt(updatedOrder.deposit.amount) + ')';
          const depNoteLine = updatedOrder.deposit.note ? `\n💳 <b>Chi tiết cọc:</b> ${updatedOrder.deposit.note}` : "";
          
          let imageLinkLine = '';
          if (updatedOrder.billImage && updatedOrder.billImage.indexOf('http') === 0) {
            imageLinkLine = '\n🖼️ <a href="' + updatedOrder.billImage + '">XEM ẢNH PHIẾU ĐẶT (ONLINE)</a>';
          }

          const confirmCaption = '📝 <b>CẬP NHẬT PHIẾU ĐẶT BÀN THÀNH CÔNG</b>\n' +
            '━━━━━━━━━━━━━━━━━━━\n' +
            '👤 <b>Khách hàng:</b> ' + escapeHtml(c.name || 'N/A') + '\n' +
            '📱 <b>Số điện thoại:</b> ' + escapeHtml(c.phone || 'N/A') + '\n' +
            '📅 <b>Thời gian:</b> ' + escapeHtml(c.date || '?') + ' | ⏰ ' + escapeHtml(c.time || '?') + '\n' +
            '👥 <b>Số lượng:</b> ' + escapeHtml(c.pax || '?') + ' khách | 🪑 <b>Bàn:</b> ' + escapeHtml(c.tables || '?') + '\n' +
            '🍽️ <b>Món ăn:</b> ' + (updatedOrder.items.map(i => i.name + ' x' + i.qty).join(', ') || 'Chưa đặt') + '\n' +
            '💰 <b>Tổng tiền:</b> ' + fmt(updatedOrder.total) + '\n' +
            '💳 <b>Trạng thái:</b> ' + depStatus + depNoteLine + '\n' +
            '━━━━━━━━━━━━━━━━━━━\n' +
            '🆔 <b>Mã đặt bàn:</b> <code>' + bookingId + '</code>\n' +
            '👉 <a href="https://kg-booking.pages.dev/#/bill/' + bookingId + '">XEM PHIẾU ĐẶT ONLINE</a>' + imageLinkLine;
          
          editTelegramText_(botToken, chatId, replyTo.message_id, confirmCaption);
          replyTelegram_(botToken, chatId, threadId, `✅ <b>Đã cập nhật đơn đặt bàn thành công!</b>\nKhách: <b>${escapeHtml(c.name)}</b> | Ngày: <b>${escapeHtml(c.date)}</b> | Bàn: <b>${escapeHtml(c.tables)}</b> | Cọc: <b>${fmt(updatedOrder.deposit.amount)}</b>`);
        } else {
          throw new Error("Không hiểu rõ chỉ thị chỉnh sửa. Vui lòng nhập rõ cú pháp ví dụ: 'Hủy bàn', 'Sửa tiền cọc 3TR', 'Dời sang 09/07/2026 - Bàn mới C5'.");
        }
      } catch (err) {
        replyTelegram_(botToken, chatId, threadId, "❌ Lỗi xử lý yêu cầu chỉnh sửa: " + escapeHtml_(err.message));
      }
    } else {
      replyTelegram_(botToken, chatId, threadId, "⚠️ Không tìm thấy Mã đặt bàn hợp lệ trong tin nhắn được trả lời.");
    }
  }
  
  if (isReplyProcessed) {
    return HtmlService.createHtmlOutput("Reply processed");
  }

  // 1. Check for registration commands
  const isRegisterNotificationCmd = text && (text.startsWith("/register_notification") || text.startsWith("/register") || text.includes("@KGReservedBot_bot /register_notification"));
  const isRegisterBookingCmd = text && (text.startsWith("/register_booking") || text.startsWith("/register_auto_booking") || text.includes("@KGReservedBot_bot /register_auto_booking"));
  
  if (isRegisterNotificationCmd) {
    upsertSystemConfigRow_('telegram_chat_id', String(chatId), 'string', 'global', false, 'Telegram Group Chat ID for Bot', 'bot');
    upsertSystemConfigRow_('telegramChatId', String(chatId), 'string', 'global', false, 'Telegram Group Chat ID for Bot (Camel)', 'bot');
    upsertSystemConfigRow_('telegram_topic_id', String(threadId || ''), 'string', 'global', false, 'Telegram Topic ID for Bot Bookings', 'bot');
    upsertSystemConfigRow_('telegramTopicId', String(threadId || ''), 'string', 'global', false, 'Telegram Topic ID for Bot Bookings (Camel)', 'bot');
    try { CacheService.getScriptCache().remove("system_config"); } catch(e) {}
    const replyMsg = "📢 <b>ĐĂNG KÝ TOPIC THÔNG BÁO THÀNH CÔNG!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━\n" +
      "Kênh nhận thông báo đặt bàn đã được đặt tại Topic này (ID: " + (threadId || "Mặc định") + ").\n\n" +
      "👉 Tất cả thông báo lịch đặt mới từ Webapp và Bot tự động sẽ được gửi về đây.";
    replyTelegram_(botToken, chatId, threadId, replyMsg);
    return HtmlService.createHtmlOutput("Registered notification topic");
  }
  
  if (isRegisterBookingCmd) {
    upsertSystemConfigRow_('telegram_chat_id', String(chatId), 'string', 'global', false, 'Telegram Group Chat ID for Bot', 'bot');
    upsertSystemConfigRow_('telegramChatId', String(chatId), 'string', 'global', false, 'Telegram Group Chat ID for Bot (Camel)', 'bot');
    upsertSystemConfigRow_('telegram_auto_booking_topic_id', String(threadId || ''), 'string', 'global', false, 'Telegram Topic ID for Auto Booking', 'bot');
    upsertSystemConfigRow_('telegramAutoBookingTopicId', String(threadId || ''), 'string', 'global', false, 'Telegram Topic ID for Auto Booking (Camel)', 'bot');
    try { CacheService.getScriptCache().remove("system_config"); } catch(e) {}
    const replyMsg = "📥 <b>ĐĂNG KÝ TOPIC NHẬN ĐƠN THÀNH CÔNG!</b>\n" +
      "━━━━━━━━━━━━━━━━━━━\n" +
      "Kênh tự động ghi nhận đặt bàn đã được đặt tại Topic này (ID: " + (threadId || "Mặc định") + ").\n\n" +
      "👉 Soạn tin nhắn đặt bàn tại đây để Bot tự động phân tích và tạo phiếu.";
    replyTelegram_(botToken, chatId, threadId, replyMsg);
    return HtmlService.createHtmlOutput("Registered auto booking topic");
  }
  
  // 2. Read registered chat ID and topic IDs from config
  // Reuse cfg defined at top
  const registeredChatId = cfg['telegramChatId'];
  const registeredTopicId = cfg['telegramTopicId'];
  const registeredAutoBookingTopicId = cfg['telegramAutoBookingTopicId'] || cfg['telegram_auto_booking_topic_id'] || registeredTopicId;
  // Reuse activeMenuSheet defined at top
  
  // 3. Process booking text if it matches the registered group and topic
  if (registeredChatId && String(chatId) === String(registeredChatId)) {
    // A. Handle status command
    const isStatusCmd = text && (text.startsWith("/status") || text.includes("@KGReservedBot_bot /status"));
    if (isStatusCmd) {
      const bankAccount = cfg['default_bank_account_id'] || "Chưa thiết lập";
      const statusMsg = "🤖 <b>TRẠNG THÁI KẾT NỐI HỆ THỐNG</b>\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🟢 <b>Kết nối:</b> Hoạt động bình thường\n" +
        "📊 <b>Bảng thực đơn hoạt động:</b> <code>" + activeMenuSheet + "</code>\n" +
        "💳 <b>Tài khoản nhận cọc mặc định:</b> <code>" + bankAccount + "</code>\n" +
        "📍 <b>ID nhóm chat:</b> <code>" + chatId + "</code>\n" +
        "📢 <b>Topic Thông báo:</b> <code>" + (registeredTopicId || "Mặc định / Không có") + "</code>\n" +
        "📥 <b>Topic Nhận đơn:</b> <code>" + (registeredAutoBookingTopicId || "Mặc định / Không có") + "</code>\n" +
        "📦 <b>Phiên bản backend:</b> <code>v121</code>\n\n" +
        "👉 Lệnh đăng ký:\n" +
        " - <code>/register_notification</code>: Đăng ký Topic hiện tại để nhận thông báo\n" +
        " - <code>/register_auto_booking</code>: Đăng ký Topic hiện tại để tự động nhận đơn";
      replyTelegram_(botToken, chatId, threadId, statusMsg);
      return HtmlService.createHtmlOutput("Status responded");
    }

    // If a topic is registered, ignore booking messages from other topics in the same group
    if (registeredAutoBookingTopicId && String(threadId || '') !== String(registeredAutoBookingTopicId)) {
      return HtmlService.createHtmlOutput("Ignored message outside target topic");
    }

    // B. Handle invalid slash commands
    if (text && text.startsWith("/")) {
      const invalidCmdMsg = "⚠️ <b>LỆNH KHÔNG HỢP LỆ</b>\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "Hệ thống không hỗ trợ lệnh này.\n\n" +
        "👉 Sử dụng lệnh <code>/status</code> để kiểm tra kết nối bot.";
      replyTelegram_(botToken, chatId, threadId, invalidCmdMsg);
      return HtmlService.createHtmlOutput("Invalid command responded");
    }

    // C. Handle empty updates
    if (!text) {
      const emptyMsg = "🤖 <b>TIN NHẮN KHÔNG HỢP LỆ</b>\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "Em nhận được cập nhật nhưng tin nhắn trống hoặc không có nội dung chữ để phân tích.\n\n" +
        "👉 Hãy gửi tin nhắn đặt bàn kèm chữ hoặc trả lời tin nhắn cũ với cú pháp cọc nhé!";
      replyTelegram_(botToken, chatId, threadId, emptyMsg);
      return HtmlService.createHtmlOutput("Empty text responded");
    }

    // D. Respond immediately to notify user and retrieve temporary message ID
    const tempRes = replyTelegramWithResult_(botToken, chatId, threadId, "⏳ <b>Đã ghi nhận thông tin đặt bàn, đang xử lý tự động...</b>");
    const tempMsgId = (tempRes && tempRes.result && tempRes.result.message_id) ? tempRes.result.message_id : null;

    sendChatAction_(botToken, chatId, threadId, "typing");
    
    try {
      const parsedData = parseBookingWithGemini_(text, activeMenuSheet);
      
      if (!parsedData || !parsedData.customer || !parsedData.customer.name || !parsedData.customer.phone) {
        throw new Error("Không trích xuất được thông tin tên hoặc số điện thoại khách hàng.");
      }
      
      let isPaid = false;
      let depositAmount = 0;
      let depositNote = "";
      
      if (parsedData.deposit) {
        isPaid = !!parsedData.deposit.isPaid;
        depositAmount = Number(parsedData.deposit.amount) || 0;
        depositNote = parsedData.deposit.note || "";
      }
      
      // Fallback to auto calc if amount is 0 and isPaid is false
      if (depositAmount === 0 && !isPaid) {
        depositAmount = autoCalcDeposit_(parsedData.customer, parsedData.items);
        depositNote = "Yêu cầu cọc (Bot)";
      }

      const bookingId = "TG_" + Utilities.getUuid().substring(0, 8) + "_" + Date.now();
      const payload = {
        customer: parsedData.customer,
        items: parsedData.items || [],
        deposit: { 
          isPaid: isPaid, 
          amount: depositAmount, 
          image: "",
          note: depositNote
        },
        staff: { name: "Telegram Bot", phone: "" },
        id: bookingId,
        version: 1,
        total: parsedData.total || 0,
        billImage: "",
        customFileName: "TG_" + parsedData.customer.name,
        activeMenuSheet: activeMenuSheet
      };
      
      // Store payload in cache for 10 minutes
      const tempId = "temp_TG_" + Utilities.getUuid().substring(0, 8) + "_" + Date.now();
      CacheService.getScriptCache().put(tempId, JSON.stringify(payload), 600);
      
      const c = parsedData.customer;
      const fmt = (n) => n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
      const depStatusText = isPaid ? `✅ ĐÃ CỌC (${fmt(depositAmount)})` : `⏳ CHỜ CỌC (${fmt(depositAmount)})`;
      const depNoteText = depositNote ? `\n💳 <b>Ghi chú cọc:</b> ${depositNote}` : "";
      
      const confirmationText = '🤖 <b>XÁC NHẬN ĐƠN ĐẶT BÀN MỚI</b>\n' +
        '━━━━━━━━━━━━━━━━━━━\n' +
        '👤 <b>Khách hàng:</b> ' + escapeHtml(c.name || 'N/A') + '\n' +
        '📱 <b>Số điện thoại:</b> ' + escapeHtml(c.phone || 'N/A') + '\n' +
        '📅 <b>Thời gian:</b> ' + escapeHtml(c.date || '?') + ' | ⏰ ' + escapeHtml(c.time || '?') + '\n' +
        '👥 <b>Số lượng:</b> ' + escapeHtml(c.pax || '?') + ' khách | 🪑 <b>Bàn:</b> ' + escapeHtml(c.tables || '?') + '\n' +
        '🍽️ <b>Món ăn:</b> ' + (payload.items.map(i => i.name + ' x' + i.qty).join(', ') || 'Chưa đặt') + '\n' +
        '💰 <b>Tổng tạm tính:</b> ' + fmt(payload.total) + '\n' +
        '💳 <b>Trạng thái:</b> ' + depStatusText + depNoteText + '\n' +
        '━━━━━━━━━━━━━━━━━━━\n' +
        '💬 <b>Ghi chú:</b> <i>' + escapeHtml(c.note || 'Không có') + '</i>\n\n' +
        '👉 Vui lòng nhấn nút dưới đây để xác nhận tạo phiếu:';
      
      const buttons = [
        [
          { text: "✅ Xác nhận tạo", callback_data: "confirm_create:" + tempId },
          { text: "❌ Hủy bỏ", callback_data: "cancel_create:" + tempId }
        ]
      ];
      
      // A. Send confirmation message with inline buttons
      replyTelegramWithButtons_(botToken, chatId, threadId, confirmationText, buttons);
      
      // B. Delete temporary processing message
      if (tempMsgId) {
        deleteTelegramMessage_(botToken, chatId, tempMsgId);
      }
      
      return HtmlService.createHtmlOutput("Confirmation sent");
    } catch (err) {
      // F. Delete temporary message on error/failure
      if (tempMsgId) {
        deleteTelegramMessage_(botToken, chatId, tempMsgId);
      }

      const isGeneralChat = err.message.indexOf("Không trích xuất được thông tin tên hoặc số điện thoại") !== -1;
      if (isGeneralChat) {
        const helpMsg = "🤖 <b>KÊNH ĐẶT BÀN TỰ ĐỘNG</b>\n" +
          "━━━━━━━━━━━━━━━━━━━\n" +
          "Em nhận được tin nhắn của anh/chị nhưng không phân tích được thông tin đặt bàn.\n\n" +
          "👉 Vui lòng nhập theo cú pháp ví dụ:\n<i>Anh Trí 0901234567 ngày mai 18:30 đi 4 khách bàn A1 ăn Lẩu thái 1, cơm chiên 1</i>";
        replyTelegram_(botToken, chatId, threadId, helpMsg);
      } else {
        const errMsg = "❌ <b>LỖI XỬ LÝ ĐẶT BÀN</b>\n" +
          "━━━━━━━━━━━━━━━━━━━\n" +
          "Hệ thống gặp sự cố khi lưu phiếu đặt bàn.\n" +
          "Chi tiết: <i>" + escapeHtml_(err.message) + "</i>\n\n" +
          "👉 Anh/chị vui lòng kiểm tra lại cấu hình hoặc lên phiếu thủ công qua Webapp.";
        replyTelegram_(botToken, chatId, threadId, errMsg);
      }
      
      return HtmlService.createHtmlOutput("Error: " + err.message);
    }
  }
  
  return HtmlService.createHtmlOutput("Ignored message outside target topic");
}

function parseReplyInstructionWithGemini_(existingOrderJson, instructionText, activeMenuSheet) {
  const apiKeys = getApiKeysFromConfig_();
  const googleKeys = apiKeys['google'] || apiKeys['gemini'] || [];
  if (googleKeys.length === 0) {
    throw new Error("Chưa cấu hình API Key cho Google Gemini.");
  }

  // Load active menu to build dynamic prompt
  const menuData = getMenuData(activeMenuSheet);
  let menuContext = "Không có thực đơn.";
  if (menuData && menuData.ok && Array.isArray(menuData.data)) {
    menuContext = menuData.data.map(i => `- ${i.name}: ${i.price}đ`).join('\n');
  }

  const sysPrompt = `Bạn là Trợ lý Đặt bàn King's Grill.
Bạn nhận được một đơn đặt bàn hiện tại dạng JSON, danh sách thực đơn nhà hàng, và một yêu cầu chỉnh sửa (bằng tiếng Việt) từ nhân viên.
Hãy phân tích yêu cầu chỉnh sửa và thực hiện một trong hai hành động sau:

HÀNH ĐỘNG 1: Nếu yêu cầu là hủy bàn, xóa bàn, hủy đơn, không ăn nữa...
Hãy trả về JSON chính xác như sau:
{
  "action": "delete"
}

HÀNH ĐỘNG 2: Nếu yêu cầu là chỉnh sửa (ví dụ: sửa tiền cọc, đổi ngày, đổi bàn, đổi giờ, thêm/bớt món, đổi số lượng khách...):
Hãy cập nhật các trường tương ứng trong JSON cũ và trả về JSON mới đã cập nhật:
{
  "action": "update",
  "data": { ...JSON đã được cập nhật ... }
}

LƯU Ý QUAN TRỌNG KHI CẬP NHẬT (ACTION = "UPDATE"):
1. Định dạng của trường "items" bắt buộc phải giữ nguyên cấu trúc mảng đối tượng:
   [
     {
       "name": "Tên món ăn chính xác từ thực đơn",
       "qty": số lượng (kiểu số nguyên),
       "price": đơn giá (kiểu số nguyên)
     }
   ]
   Tuyệt đối KHÔNG sử dụng tên thuộc tính khác như "quantity". Phải luôn sử dụng "qty".
2. Khi thêm món ăn mới:
   - Hãy đối chiếu tên món người dùng viết với thực đơn ở dưới để lấy tên chính xác và đơn giá 'price'.
   - Nếu món ăn đã tồn tại sẵn trong đơn cũ, hãy tăng số lượng 'qty' tương ứng hoặc cập nhật theo yêu cầu.
3. Khi xóa món ăn: Xóa món đó khỏi mảng 'items'.
4. Sau khi thay đổi 'items', hãy tính toán lại trường 'total' bằng tổng (qty * price) của tất cả món trong 'items'.
5. Khi đổi ngày, hãy chuẩn hóa sang DD/MM/YYYY.
6. Khi sửa tiền cọc (ví dụ: 'sửa cọc 3TR', 'sửa tiền cọc 3TR', 'cọc 3tr'):
   - Cập nhật 'deposit.isPaid' = true
   - Cập nhật 'deposit.amount' = 3000000
   - Cập nhật 'deposit.note' = 'Cập nhật cọc 3TR' (hoặc nội dung yêu cầu)
7. Giữ nguyên các thông tin khác của đơn hàng (như khách hàng, ghi chú) nếu không được yêu cầu thay đổi.

Thực đơn nhà hàng để đối chiếu giá và tên món ăn:
${menuContext}

Thời gian hiện tại của hệ thống để đối chiếu ngày tháng: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

  const body = {
    contents: [{
      parts: [{
        text: sysPrompt + "\n\nJSON hiện tại:\n" + JSON.stringify(existingOrderJson) + "\n\nYêu cầu từ nhân viên:\n" + instructionText
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];
  let response = null;
  let code = 0;
  let resText = "";
  let lastError = "";
  let success = false;

  for (let k = 0; k < googleKeys.length; k++) {
    const key = googleKeys[k];
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const fetchUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
      try {
        response = UrlFetchApp.fetch(fetchUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        code = response.getResponseCode();
        resText = response.getContentText();
        if (code === 200) {
          success = true;
          break;
        } else {
          lastError = "Key #" + (k + 1) + " | Model " + model + " (HTTP " + code + "): " + resText;
        }
      } catch (err) {
        lastError = "Key #" + (k + 1) + " | " + err.message;
      }
    }
    if (success) {
      break;
    }
  }

  if (!success) {
    throw new Error("Lỗi gọi Gemini API: " + lastError);
  }

  const resJson = JSON.parse(resText);
  const candidates = resJson.candidates || [];
  const contentText = candidates[0]?.content?.parts?.[0]?.text;
  if (!contentText) {
    throw new Error("Không nhận được nội dung phân tích từ Gemini.");
  }

  let cleanJsonText = contentText.trim();
  if (cleanJsonText.startsWith("```")) {
    cleanJsonText = cleanJsonText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }
  cleanJsonText = cleanJsonText.replace(/\/\/.*$/gm, "");
  cleanJsonText = cleanJsonText.replace(/,\s*([\]}])/g, "$1");
  
  try {
    return JSON.parse(cleanJsonText);
  } catch (parseErr) {
    throw new Error("JSON parsing failed: " + parseErr.message + "\nRaw: " + contentText);
  }
}

function replyTelegramWithButtons_(botToken, chatId, threadId, text, buttons) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: buttons
    }
  };
  if (threadId && String(threadId) !== "1") {
    payload.message_thread_id = threadId;
  }
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function editTelegramMessageText_(botToken, chatId, messageId, text, replyMarkup) {
  const url = "https://api.telegram.org/bot" + botToken + "/editMessageText";
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML"
  };
  if (replyMarkup !== undefined) {
    payload.reply_markup = replyMarkup;
  }
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function answerCallbackQuery_(botToken, callbackQueryId, text) {
  const url = "https://api.telegram.org/bot" + botToken + "/answerCallbackQuery";
  const payload = {
    callback_query_id: callbackQueryId,
    text: text
  };
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function getBotToken_() {
  const cfg = loadSystemConfig_();
  let webhookUrl = cfg['webhookUrl'] || '';
  if (typeof webhookUrl !== 'string') webhookUrl = '';
  const match = webhookUrl.match(/\/bot([^/]+)\//);
  const token = match ? match[1] : '';
  return token.replace(/[{}]/g, '').trim();
}

function parseBookingWithGemini_(text, activeMenuSheet) {
  const apiKeys = getApiKeysFromConfig_();
  const googleKeys = apiKeys['google'] || apiKeys['gemini'] || [];
  if (googleKeys.length === 0) {
    throw new Error("Chưa cấu hình API Key cho Google Gemini. Vui lòng thiết lập trong Webapp.");
  }
  
  // Load active menu to build dynamic prompt
  const menuData = getMenuData(activeMenuSheet);
  let menuContext = "Không có thực đơn.";
  if (menuData && menuData.ok && Array.isArray(menuData.data)) {
    menuContext = menuData.data.map(i => `- ${i.name}: ${i.price}đ`).join('\n');
  }

  const sysPrompt = `Bạn là Trợ lý Đặt bàn King's Grill. Nhiệm vụ của bạn là trích xuất thông tin đặt bàn từ văn bản của người dùng sang định dạng JSON.

Định dạng JSON cần trả về:
{
  "customer": {
    "name": "Tên khách hàng (ví dụ: 'Anh Trí')",
    "phone": "Số điện thoại (chỉ giữ lại số, ví dụ: '0901234567')",
    "date": "Ngày đặt (DD/MM/YYYY, ví dụ: '05/07/2026'). Hãy tự suy luận dựa trên thời gian hiện tại nếu người dùng dùng từ 'hôm nay', 'ngày mai'...",
    "time": "Giờ đặt (HH:MM, ví dụ: '18:30')",
    "pax": "Số khách (chỉ số, ví dụ: '4')",
    "tables": "Mã bàn (ví dụ: 'A1'). Nếu không có, hãy để trống hoặc đoán bàn phù hợp.",
    "type": "Ăn thường",
    "note": "Ghi chú thêm"
  },
  "items": [
    {
      "name": "Tên món ăn chính xác từ thực đơn",
      "qty": 1,
      "price": 100000
    }
  ],
  "total": 100000
}

Thời gian hiện tại của hệ thống: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}

Thực đơn chính thức của nhà hàng (để ánh xạ tên món ăn và đơn giá):
${menuContext}

LƯU Ý NGHIÊM NGẶT VỀ THỰC ĐƠN VÀ ĐƠN GIÁ:
1. Chỉ trích xuất các món ăn có trong thực đơn ở trên. KHÔNG tự bịa ra món ăn mới, không bịa ra giá mới.
2. Ánh xạ tên món ăn người viết viết (có thể viết tắt, viết không dấu) sang tên món ăn chính xác trong thực đơn.
3. Nhân số lượng với đơn giá chính xác trong thực đơn để tính tổng tiền 'total'.
4. Nếu món ăn người dùng viết không có trong thực đơn, hãy bỏ qua không đưa vào 'items'. Tuyệt đối không tự đoán giá của món không có trong thực đơn.`;

  const body = {
    contents: [{
      parts: [{
        text: sysPrompt + "\n\nUser text:\n" + text
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];
  let response = null;
  let code = 0;
  let resText = "";
  let lastError = "";
  let success = false;

  for (let k = 0; k < googleKeys.length; k++) {
    const key = googleKeys[k];
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const fetchUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
      try {
        response = UrlFetchApp.fetch(fetchUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        code = response.getResponseCode();
        resText = response.getContentText();
        if (code === 200) {
          success = true;
          break;
        } else {
          lastError = "Key #" + (k + 1) + " | Model " + model + " (HTTP " + code + "): " + resText;
        }
      } catch (err) {
        lastError = "Key #" + (k + 1) + " | " + err.message;
      }
    }
    if (success) {
      break;
    }
  }

  if (!success) {
    throw new Error("Lỗi gọi Gemini API: " + lastError);
  }

  const resJson = JSON.parse(resText);
  const candidates = resJson.candidates || [];
  const contentText = candidates[0]?.content?.parts?.[0]?.text;
  if (!contentText) {
    throw new Error("Không nhận được nội dung phân tích từ Gemini.");
  }

  let cleanJsonText = contentText.trim();
  if (cleanJsonText.startsWith("```")) {
    cleanJsonText = cleanJsonText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }
  cleanJsonText = cleanJsonText.replace(/\/\/.*$/gm, "");
  cleanJsonText = cleanJsonText.replace(/,\s*([\]}])/g, "$1");
  
  try {
    return JSON.parse(cleanJsonText);
  } catch (parseErr) {
    console.log("Gemini raw JSON: " + contentText);
    throw new Error("JSON parsing failed: " + parseErr.message + "\nRaw: " + contentText);
  }
}

function replyTelegram_(botToken, chatId, threadId, text) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  if (threadId && String(threadId) !== "1") {
    payload.message_thread_id = threadId;
  }
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function sendTelegramPhoto_(botToken, chatId, threadId, photoUrl, caption) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendPhoto";
  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption,
    parse_mode: "HTML"
  };
  if (threadId && String(threadId) !== "1") {
    payload.message_thread_id = threadId;
  }
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("HTTP " + code + ": " + response.getContentText());
  }
  return response.getContentText();
}

function sendChatAction_(botToken, chatId, threadId, action) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendChatAction";
  const payload = {
    chat_id: chatId,
    action: action
  };
  if (threadId && String(threadId) !== "1") {
    payload.message_thread_id = threadId;
  }
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function replyTelegramWithResult_(botToken, chatId, threadId, text, replyToMessageId) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  if (threadId && String(threadId) !== "1") {
    payload.message_thread_id = threadId;
  }
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }
  try {
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    }
  } catch(e) {
    console.log("replyTelegramWithResult_ failed: " + e.message);
  }
  return null;
}

function deleteTelegramMessage_(botToken, chatId, messageId) {
  const url = "https://api.telegram.org/bot" + botToken + "/deleteMessage";
  const payload = {
    chat_id: chatId,
    message_id: messageId
  };
  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch(e) {
    console.log("deleteTelegramMessage_ failed: " + e.message);
  }
}

function autoCalcDeposit_(customer, items) {
  const pax = parseInt(customer.pax) || 0;
  const hasFood = items && items.length > 0 && items.some(function(item) {
    return item.name && item.name.trim() && Number(item.qty) > 0;
  });
  
  if (!hasFood) {
    if (pax >= 20) {
      return 1000000;
    } else {
      return 500000;
    }
  } else {
    // Calculate total
    const total = items.reduce(function(acc, i) {
      return acc + (Number(i.price) * Number(i.qty));
    }, 0);
    if (total < 1500000) {
      return 500000;
    } else {
      const oneThird = total / 3;
      return Math.round(oneThird / 500000) * 500000;
    }
  }
}

function getOrderById_(bookingId) {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === bookingId) {
      try {
        const unifiedData = JSON.parse(values[i][4]);
        return {
          id: bookingId,
          customer: unifiedData.customer,
          items: unifiedData.items,
          deposit: unifiedData.deposit || { isPaid: false, amount: 0, image: "" },
          staff: unifiedData.staff || { name: "Telegram Bot", phone: "" },
          total: values[i][5],
          billImage: values[i][9] || "",
          activeMenuSheet: unifiedData.activeMenuSheet || ""
        };
      } catch(e) {
        return null;
      }
    }
  }
  return null;
}

function editTelegramPhoto_(botToken, chatId, messageId, photoUrl, caption) {
  const url = "https://api.telegram.org/bot" + botToken + "/editMessageMedia";
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    media: {
      type: "photo",
      media: photoUrl,
      caption: caption,
      parse_mode: "HTML"
    }
  };
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  return response.getContentText();
}

function editTelegramText_(botToken, chatId, messageId, text) {
  const url = "https://api.telegram.org/bot" + botToken + "/editMessageCaption";
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    caption: text,
    parse_mode: "HTML"
  };
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function extractBookingIdFromMessage_(replyTo) {
  let text = replyTo.caption || replyTo.text || "";
  
  // 1. Try regex on the text directly (in case bookingId is printed as plain text)
  let match = text.match(/TG_[A-Za-z0-9_]+/);
  if (match) return match[0];
  
  // 2. Try looking in entities or caption_entities
  const entities = replyTo.caption_entities || replyTo.entities || [];
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (ent.type === "text_link" && ent.url) {
      const urlMatch = ent.url.match(/#\/bill\/([A-Za-z0-9_-]+)/) || ent.url.match(/TG_[A-Za-z0-9_]+/);
      if (urlMatch) {
        return urlMatch[1] || urlMatch[0];
      }
    }
  }
  
  // 3. Try to see if there is any URL in the text itself
  const urlRegex = /https?:\/\/[^\s]+/g;
  let urlMatch;
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const link = urlMatch[0];
    const linkMatch = link.match(/#\/bill\/([A-Za-z0-9_-]+)/) || link.match(/TG_[A-Za-z0-9_]+/);
    if (linkMatch) {
      return linkMatch[1] || linkMatch[0];
    }
  }
  
  return "";
}

function getShareUrlWithData_(bookingId, payload) {
  try {
    const rawBytes = Utilities.newBlob(JSON.stringify(payload)).getBytes();
    const base64Data = Utilities.base64EncodeWebSafe(rawBytes);
    return "https://kg-booking.pages.dev/#/bill/" + bookingId + "?data=" + base64Data;
  } catch (e) {
    console.log("Failed to encode payload data: " + e.message);
    return "https://kg-booking.pages.dev/#/bill/" + bookingId;
  }
}

function updateWebhookUrlToBotB() {
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const configSheet = ss.getSheetByName(CONFIG.SHEET_NAME_CONFIG);
  if (!configSheet) return "No config sheet";
  const range = configSheet.getDataRange();
  const values = range.getValues();
  for (let i = 1; i < values.length; i++) {
    const key = values[i][0];
    if (key === 'webhookUrl') {
      configSheet.getRange(i + 1, 2).setValue("https://api.telegram.org/bot8991006823:AAHlNtYoTgzKF9LmKp2pnzsHDtpb2WngLBQ/sendMessage");
    }
    if (key === 'system_config') {
      try {
        const parsed = JSON.parse(values[i][1]);
        parsed.webhookUrl = "https://api.telegram.org/bot8991006823:AAHlNtYoTgzKF9LmKp2pnzsHDtpb2WngLBQ/sendMessage";
        configSheet.getRange(i + 1, 2).setValue(JSON.stringify(parsed));
      } catch(e) {}
    }
  }
  // Clear script cache
  CacheService.getScriptCache().remove("system_config");
  return "Updated webhookUrl to Bot B successfully";
}

function logWebhookEvent_(update) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
    let sheet = ss.getSheetByName("Webhook_Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Webhook_Logs");
      sheet.appendRow(["Timestamp", "Update ID", "Chat ID", "Thread ID", "Text", "Raw Update JSON"]);
    }
    const msg = update.message || {};
    const chat = msg.chat || {};
    const text = msg.text || "";
    sheet.appendRow([
      new Date().toISOString(),
      update.update_id || "",
      chat.id || "",
      msg.message_thread_id || "None",
      text.substring(0, 100),
      JSON.stringify(update)
    ]);
  } catch (e) {
    console.log("Failed to log webhook event: " + e.message);
  }
}

function syncBookingCalendar(id, token) {
  if (!id) return { ok: false, message: "Thiếu ID lịch đặt." };
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
  if (!sheet) return { ok: false, message: "Không tìm thấy sheet Orders." };
  
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  let foundRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      foundRow = i;
      break;
    }
  }
  
  if (foundRow === -1) {
    return { ok: false, message: "Không tìm thấy lịch đặt trong Orders." };
  }
  
  const rowData = values[foundRow];
  const jsonStr = rowData[4]; // Dữ Liệu Tổng Hợp (JSON)
  const transferUrl = rowData[8]; // Link Ảnh Cọc (Drive)
  const billUrl = rowData[9]; // Link Phiếu Đặt (Drive)
  
  let payload = null;
  try {
    payload = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, message: "Lỗi phân tích dữ liệu JSON của lịch đặt." };
  }
  
  if (!payload) return { ok: false, message: "Dữ liệu lịch đặt trống." };
  
  const syncResult = syncToCalendar(payload, id, billUrl, transferUrl);
  return { ok: true, message: "Đã thực hiện đồng bộ lịch đặt.", syncResult: syncResult };
}

function findBookingIdByParentMessageText_(text) {
  if (!text) return "";
  
  // Clean text slightly to find consecutive digits
  const cleanText = text.replace(/[\s\-\.]/g, "");
  const phoneMatch = cleanText.match(/0\d{9,10}/) || cleanText.match(/\d{9,11}/);
  
  const ss = SpreadsheetApp.openById(CONFIG.SS_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ORDERS);
  if (!sheet) return "";
  const values = sheet.getDataRange().getValues();
  
  if (phoneMatch) {
    const rawPhone = phoneMatch[0];
    const phoneSuffix = rawPhone.substring(rawPhone.length - 9);
    
    for (let i = values.length - 1; i >= 1; i--) {
      const orderPhone = String(values[i][3] || "");
      const cleanOrderPhone = orderPhone.replace(/\D/g, "");
      if (cleanOrderPhone.endsWith(phoneSuffix)) {
        return values[i][0];
      }
    }
  }
  
  // Name match fallback
  for (let i = values.length - 1; i >= 1; i--) {
    const orderName = String(values[i][2] || "").trim();
    if (orderName && orderName.length > 2) {
      if (text.toLowerCase().indexOf(orderName.toLowerCase()) !== -1) {
        return values[i][0];
      }
    }
  }

  return "";
}

function escapeHtml_(text) {
  if (!text) return "";
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
