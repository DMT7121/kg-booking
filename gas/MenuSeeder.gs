/**
 * KING'S GRILL MANAGER AI - MENU LIBRARY & SEEDER
 * Chứa logic phân tích text menu và hàm setup dữ liệu mẫu
 * FILE 1/2 - Dán vào GAS PROJECT cùng file Backend chính
 */

// --- CONFIG LOCAL ---
const SEEDER_SS_ID = "1TCVdHWwve9xHmBC89QYZnbrmhrhDsqin9S9jtZRj-r8";
const SEEDER_SHEET_NAME = "Menu";

const MENU_RAW_DATA = `7Up - 19.000 | Bear IPA 330ml - 59.000 | Bear IPA 3L - 510.000 | Coca Cola - 19.000 | Corona 250ml - 45.000 | Corona 300ml - 49.000 | Hard Lemonade 330ml - 41.000 | Hard Lemonade 3L - 339.000 | Heineken Silver 250ml - 22.000 | Heineken Silver 330ml - 24.000 | Heineken Xanh 330ml - 24.000 | Kronenbourg 1664 Blanc - 25.000 | Midnight Velvet 330ml - 59.000 | Midnight Velvet 3L - 510.000 | Nước ép cam - 59.000 | Nước ép cóc - 59.000 | Nước ép dưa hấu - 59.000 | Nước ép táo xanh - 59.000 | Nước ép thơm - 59.000 | Nước suối - 15.000 | Nước tự chọn - 10.000 | Passion Fruity Twist 330ml - 41.000 | Passion Fruity Twist 3L - 339.000 | Pepsi - 19.000 | Red Bull - 19.000 | Rượu mơ - 280.000`;

// HÀM CHẠY THỦ CÔNG ĐỂ RESET MENU MẶC ĐỊNH
function setupMenu() {
  const ss = SpreadsheetApp.openById(SEEDER_SS_ID);
  let sheet = ss.getSheetByName(SEEDER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SEEDER_SHEET_NAME);
  } else {
    sheet.clear();
  }
  sheet.appendRow(["Name", "Price", "Acronym", "CleanName", "Description"]);
  const rows = parseMenuRawData(MENU_RAW_DATA);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  Logger.log(`Inserted ${rows.length} items.`);
}
