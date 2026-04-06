/**
 * =====================================================
 *  車両管理システム - GAS 統合版 main.gs (最終版)
 *
 *  doGet:  車両一覧(社員/顧客) + 取引先 + 請求書
 *  doPost: 車両(登録/修正/削除) + 取引先(登録/修正/削除) + 請求書保存
 *  自動:   期日チェック(毎日9時) → LINE通知
 * =====================================================
 */

// =====================================================
//  設定
// =====================================================
const CONFIG = {
  SPREADSHEET_ID: '1wAfgpOuhMXWciuxr7aKCEHtI6qNbFbRE2CSzytFMr4M',
  SHEET: {
    MASTER:          'マスターデータ',
    MODIFY_LOG:      '修正シート',
    CLIENT_MASTER:   '取引先マスター',
    INVOICE_DETAIL:  '請求明細',
    ALLOWED_USERS:   '許可ユーザー',
  },
  API_KEY_EMPLOYEE: 'a997e291429bbf3553591f3e9541b9bf',
  API_KEY_CLIENT:   'beccdd36ab6c29b2c1f8ef94834786bc',
  WEBHOOK_URL:      'https://hook.eu2.make.com/my8kvc5qb6n56of4denemgr9q5r8rpb1',
  PARENT_FOLDER_ID: '1I7HEtBykOviIb5iVXBc4sh66YdKlIoFj',
  NOTIFICATION_DAYS: {
    VEHICLE_INSPECTION: [60, 30, 21],
    OIL_CHANGE:         [7, 0],
  },
};

// マスターデータのヘッダー名
const COL = {
  PLATE:           '自動車ナンバー',
  CARMODEL:        '車種',
  CHASSIS:         '車台番号',
  STATUS:          '状態',
  AREA:            'エリア',
  STORAGE:         '管理場所',
  LOAN_DEST:       '貸出先',
  USER:            '使用者',
  OWNER:           '所有者',
  INSURANCE:       '任意保険',
  PRICE:           'レンタル料金',
  INSPECTION:      '車検満了日',
  OIL:             'オイル交換日',
  DRIVE_TYPE:      '駆動方式',
  REMOTE_KEY:      'リモコンキー',
  SMOKE_GLASS:     'スモークガラス',
  MILEAGE_INITIAL: '仕入時走行距離',
  MILEAGE_CURRENT: '現走行距離',
  NOTE:            '備考',
  IMAGE:           '車両画像',
  TIMESTAMP:       '登録日時',
};

// doPost changes キー → スプシヘッダー名
const FIELD_TO_COL = {
  carModel:        COL.CARMODEL,
  chassisNumber:   COL.CHASSIS,
  status:          COL.STATUS,
  area:            COL.AREA,
  storageLocation: COL.STORAGE,
  loanDest:        COL.LOAN_DEST,
  user:            COL.USER,
  owner:           COL.OWNER,
  insurance:       COL.INSURANCE,
  price:           COL.PRICE,
  inspection:      COL.INSPECTION,
  oil:             COL.OIL,
  driveType:       COL.DRIVE_TYPE,
  remoteKey:       COL.REMOTE_KEY,
  smokeGlass:      COL.SMOKE_GLASS,
  mileageCurrent:  COL.MILEAGE_CURRENT,
  note:            COL.NOTE,
};


// =====================================================
//  doGet
// =====================================================
function doGet(e) {
  var param = e ? e.parameter : {};
  var key = param.key || '';
  if (key !== CONFIG.API_KEY_EMPLOYEE && key !== CONFIG.API_KEY_CLIENT) {
    return _json({ error: 'Unauthorized' });
  }
  try {
    var action = param.action;
    var role = param.role;

    if (action === 'checkAuth')     return _checkAuth(param.userId);
    if (action === 'clients')       return _getClientsWithCount();
    if (action === 'clientDetail')  return _getClientDetail(param.clientId);
    if (action === 'invoice')       return _getInvoice(param.id);
    if (action === 'invoices')      return _getInvoiceHistory(param.clientId);

    var vehicles = _getMasterData();

    if (role === 'client') {
      return _json(vehicles.map(function(v) {
        return {
          id: v.id, carModel: v.carModel, price: v.price, area: v.area,
          status: v.status === '販売可' ? '貸出可' : (v.status === '貸出可' ? '貸出可' : '貸出不可'),
          images: v.images, inspection: v.inspection,
          driveType: v.driveType, smokeGlass: v.smokeGlass,
        };
      }));
    }
    if (key !== CONFIG.API_KEY_EMPLOYEE) return _json({ error: 'Unauthorized' });
    return _json(vehicles);
  } catch (err) {
    return _json({ error: err.message });
  }
}


// =====================================================
//  doPost
// =====================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var key = body.key || '';
    if (key !== CONFIG.API_KEY_EMPLOYEE) return _json({ error: 'Unauthorized' });

    if (action === 'registerVehicle') return _registerVehicle(body);
    if (action === 'modifyVehicle')   return _modifyVehicle(body);
    if (action === 'deleteVehicle')   return _deleteVehicle(body);
    if (action === 'registerClient')  return _registerClient(body);
    if (action === 'modifyClient')    return _modifyClient(body);
    if (action === 'deleteClient')    return _deleteClient(body);
    if (action === 'saveInvoice')     return _saveInvoice(body);
    if (action === 'applyAccess')     return _applyAccess(body);
    if (action === 'uploadImage')     return _uploadImage(body);
    if (action === 'deleteImage')     return _deleteImage(body);

    return _json({ error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ error: err.message });
  }
}


// =====================================================
//  車両：マスターデータ取得
// =====================================================
function _getMasterData() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  if (!sheet) throw new Error('シートが見つかりません');
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var h = data[0];
  var ci = function(n) { return h.indexOf(n); };
  var vehicles = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[ci(COL.PLATE)]) continue;
    var folderId = r[ci(COL.IMAGE)];
    var imgs = _getImagesFromFolder(folderId);
    var rawPrice = r[ci(COL.PRICE)];
    vehicles.push({
      id: i,
      plateNumber:    r[ci(COL.PLATE)]           || '',
      carModel:       r[ci(COL.CARMODEL)]         || '',
      chassisNumber:  r[ci(COL.CHASSIS)]          || '',
      status:         r[ci(COL.STATUS)]           || '',
      area:           r[ci(COL.AREA)]             || '',
      storageLocation:r[ci(COL.STORAGE)]          || '',
      loanDest:       r[ci(COL.LOAN_DEST)]        || '',
      user:           r[ci(COL.USER)]             || '',
      owner:          r[ci(COL.OWNER)]            || '',
      insurance:      r[ci(COL.INSURANCE)]        || '',
      price:          rawPrice !== '' ? Number(rawPrice) : '',
      inspection:     _fmtDate(_toDate(r[ci(COL.INSPECTION)])),
      oil:            _fmtDate(_toDate(r[ci(COL.OIL)])),
      driveType:      r[ci(COL.DRIVE_TYPE)]       || '',
      remoteKey:      r[ci(COL.REMOTE_KEY)]       || '',
      smokeGlass:     r[ci(COL.SMOKE_GLASS)]      || '',
      mileageInitial: r[ci(COL.MILEAGE_INITIAL)]  || '',
      mileageCurrent: r[ci(COL.MILEAGE_CURRENT)]  || '',
      note:           r[ci(COL.NOTE)]             || '',
      images:         imgs,
    });
  }
  return vehicles;
}


// =====================================================
//  車両：登録
// =====================================================
function _registerVehicle(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var ci = function(n) { return h.indexOf(n); };
  var plate = String(body.plate || '').trim();
  if (!plate) return _json({ error: '自動車ナンバーが空です' });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ci(COL.PLATE)]).trim() === plate) {
      return _json({ error: '「' + plate + '」は既に登録済みです' });
    }
  }

  var folderId = '';
  try {
    var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    var folder = parent.createFolder((body.carModel || '') + '_' + plate);
    folderId = folder.getId();
    if (body.images && body.images.length > 0) {
      body.images.forEach(function(img, idx) {
        try {
          var b64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
          var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', img.name || 'img_' + (idx+1) + '.jpg');
          folder.createFile(blob);
        } catch(e) {}
      });
    }
  } catch(e) { Logger.log('フォルダ作成エラー: ' + e.message); }

  var newRow = new Array(h.length).fill('');
  newRow[ci(COL.PLATE)]           = plate;
  newRow[ci(COL.CARMODEL)]        = body.carModel || '';
  newRow[ci(COL.CHASSIS)]         = body.chassis || '';
  newRow[ci(COL.STATUS)]          = body.status || '';
  newRow[ci(COL.AREA)]            = body.area || '';
  newRow[ci(COL.STORAGE)]         = body.storageLocation || '';
  newRow[ci(COL.LOAN_DEST)]       = body.loanDest || '';
  newRow[ci(COL.USER)]            = body.user || '';
  newRow[ci(COL.OWNER)]           = body.owner || '';
  newRow[ci(COL.INSURANCE)]       = body.insurance || '';
  newRow[ci(COL.PRICE)]           = body.price ? Number(body.price) : '';
  newRow[ci(COL.DRIVE_TYPE)]      = body.driveType || '';
  newRow[ci(COL.REMOTE_KEY)]      = body.remoteKey || '';
  newRow[ci(COL.SMOKE_GLASS)]     = body.smokeGlass || '';
  newRow[ci(COL.MILEAGE_INITIAL)] = body.mileageInitial ? Number(body.mileageInitial) : '';
  newRow[ci(COL.NOTE)]            = body.note || '';
  newRow[ci(COL.IMAGE)]           = folderId;
  newRow[ci(COL.TIMESTAMP)]       = new Date();
  if (body.inspection) newRow[ci(COL.INSPECTION)] = body.inspection;
  if (body.oil)        newRow[ci(COL.OIL)]        = body.oil;

  sheet.appendRow(newRow);

  _sendLine('🚗 車両登録完了\n━━━━━━━━━━━━━━\nナンバー：' + plate + '\n車種：' + (body.carModel||'') + '\n状態：' + (body.status||'') + '\nエリア：' + (body.area||''));
  return _json({ success: true, plate: plate });
}


// =====================================================
//  車両：修正
// =====================================================
function _modifyVehicle(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var ci = function(n) { return h.indexOf(n); };
  var plate = String(body.plate || '').trim();
  if (!plate) return _json({ error: '自動車ナンバーが空です' });

  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ci(COL.PLATE)]).trim() === plate) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return _json({ error: '「' + plate + '」が見つかりません' });

  var changes = body.changes || {};
  if (!Object.keys(changes).length) return _json({ error: '変更項目がありません' });

  var row = data[rowIdx].slice();
  var items = [];
  var logSheet = ss.getSheetByName(CONFIG.SHEET.MODIFY_LOG);

  for (var field in changes) {
    var colName = FIELD_TO_COL[field];
    if (!colName) continue;
    var idx = ci(colName);
    if (idx === -1) continue;
    var oldVal = String(row[idx] || '');
    var newVal = String(changes[field] || '');
    if (oldVal !== newVal) {
      row[idx] = (field === 'price' || field === 'mileageCurrent') && newVal ? Number(newVal) : newVal;
      items.push('・' + colName + '：' + (oldVal || '(空)') + ' → ' + newVal);
      if (logSheet) logSheet.appendRow([new Date(), plate, colName, oldVal, newVal, body.email || '']);
    }
  }
  if (!items.length) return _json({ error: '変更がありませんでした' });

  sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
  _sendLine('✏️ 車両情報更新\n━━━━━━━━━━━━━━\nナンバー：' + plate + '\n' + items.join('\n'));
  return _json({ success: true, plate: plate, changed: items.length });
}


// =====================================================
//  車両：削除
// =====================================================
function _deleteVehicle(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var plateCol = h.indexOf(COL.PLATE);
  var plate = String(body.plate || '').trim();
  if (!plate) return _json({ error: '自動車ナンバーが空です' });

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][plateCol]).trim() === plate) {
      sheet.deleteRow(i + 1);
      _sendLine('🗑️ 車両削除\nナンバー：' + plate);
      return _json({ success: true, plate: plate });
    }
  }
  return _json({ error: '「' + plate + '」が見つかりません' });
}


// =====================================================
//  取引先：一覧取得（台数集計付き）
// =====================================================
function _getClientsWithCount() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var clientSheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  if (!clientSheet) return _json([]);
  var cData = clientSheet.getDataRange().getValues();
  if (cData.length <= 1) return _json([]);

  // マスターデータから貸出先ごとの台数を集計
  var masterSheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var countMap = {};
  if (masterSheet) {
    var mData = masterSheet.getDataRange().getValues();
    var mh = mData[0];
    var loanCol = mh.indexOf(COL.LOAN_DEST);
    var plateCol = mh.indexOf(COL.PLATE);
    for (var i = 1; i < mData.length; i++) {
      var dest = String(mData[i][loanCol] || '').trim();
      if (!dest || !mData[i][plateCol]) continue;
      if (!countMap[dest]) countMap[dest] = 0;
      countMap[dest]++;
    }
  }

  var result = [];
  for (var i = 1; i < cData.length; i++) {
    var r = cData[i];
    if (!r[0]) continue;
    var companyName = String(r[1] || '');
    // 取引先名で貸出先をマッチング（部分一致）
    var vehicleCount = 0;
    for (var dest in countMap) {
      if (dest.indexOf(companyName) !== -1 || companyName.indexOf(dest) !== -1) {
        vehicleCount += countMap[dest];
      }
    }
    result.push({
      clientId:     r[0] || '',
      companyName:  companyName,
      contactName:  r[2] || '',
      zipCode:      r[3] || '',
      address:      r[4] || '',
      payTerms:     r[5] || '',
      maintPlan:    r[6] || '',
      drivers:      r[7] ? String(r[7]).split('・') : [],
      note:         r[8] || '',
      vehicleCount: vehicleCount,
    });
  }
  return _json(result);
}


// =====================================================
//  取引先：詳細取得（車両リスト＋請求書履歴付き）
// =====================================================
function _getClientDetail(clientId) {
  if (!clientId) return _json({ error: '取引先IDが必要です' });
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 取引先マスターから基本情報
  var clientSheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  if (!clientSheet) return _json({ error: '取引先マスターが見つかりません' });
  var cData = clientSheet.getDataRange().getValues();
  var clientInfo = null;
  for (var i = 1; i < cData.length; i++) {
    if (String(cData[i][0]).trim() === clientId) {
      clientInfo = {
        clientId: cData[i][0]||'', companyName: cData[i][1]||'', contactName: cData[i][2]||'',
        zipCode: cData[i][3]||'', address: cData[i][4]||'', payTerms: cData[i][5]||'',
        maintPlan: cData[i][6]||'', drivers: cData[i][7] ? String(cData[i][7]).split('・') : [],
        note: cData[i][8]||'', invoiceFolderId: cData[i][9]||'',
      };
      break;
    }
  }
  if (!clientInfo) return _json({ error: 'ID「' + clientId + '」が見つかりません' });

  // マスターデータから貸出中車両を取得
  var masterSheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var vehicles = [];
  if (masterSheet) {
    var mData = masterSheet.getDataRange().getValues();
    var mh = mData[0];
    var ci = function(n) { return mh.indexOf(n); };
    var companyName = clientInfo.companyName;
    for (var i = 1; i < mData.length; i++) {
      var r = mData[i];
      var dest = String(r[ci(COL.LOAN_DEST)] || '').trim();
      if (!dest || !r[ci(COL.PLATE)]) continue;
      if (dest.indexOf(companyName) !== -1 || companyName.indexOf(dest) !== -1) {
        var rawPrice = r[ci(COL.PRICE)];
        vehicles.push({
          plateNumber:  r[ci(COL.PLATE)]     || '',
          carModel:     r[ci(COL.CARMODEL)]   || '',
          user:         r[ci(COL.USER)]       || '',
          status:       r[ci(COL.STATUS)]     || '',
          area:         r[ci(COL.AREA)]       || '',
          price:        rawPrice !== '' ? Number(rawPrice) : '',
          inspection:   _fmtDate(_toDate(r[ci(COL.INSPECTION)])),
        });
      }
    }
  }

  // 請求明細から履歴
  var invSheet = ss.getSheetByName(CONFIG.SHEET.INVOICE_DETAIL);
  var invoiceHistory = [];
  if (invSheet) {
    var iData = invSheet.getDataRange().getValues();
    var map = {};
    for (var i = 1; i < iData.length; i++) {
      var r = iData[i];
      if (String(r[1] || '') !== clientId) continue;
      var invId = String(r[0] || '');
      if (!map[invId]) map[invId] = { invoiceId: invId, yearMonth: String(r[2] || ''), subtotal: 0 };
      map[invId].subtotal += (Number(r[6]) || 0) * (Number(r[7]) || 0);
    }
    invoiceHistory = Object.keys(map).map(function(k) {
      var inv = map[k];
      inv.total = inv.subtotal + Math.floor(inv.subtotal * 0.1);
      return inv;
    });
    invoiceHistory.sort(function(a, b) { return b.yearMonth.localeCompare(a.yearMonth); });
  }

  clientInfo.vehicles = vehicles;
  clientInfo.vehicleCount = vehicles.length;
  clientInfo.invoiceHistory = invoiceHistory;
  return _json(clientInfo);
}


// =====================================================
//  取引先：登録
// =====================================================
function _registerClient(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  if (!sheet) return _json({ error: '取引先マスターシートが見つかりません' });
  var cid = String(body.clientId || '').trim();
  if (!cid) return _json({ error: '取引先IDが空です' });
  if (!body.companyName) return _json({ error: '会社名が空です' });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === cid) return _json({ error: 'ID「' + cid + '」は既に存在します' });
  }

  // 請求書PDFフォルダを自動作成
  var invFolderId = '';
  try {
    var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    var folder = parent.createFolder('請求書_' + cid + '_' + (body.companyName || ''));
    invFolderId = folder.getId();
  } catch(e) { Logger.log('請求書フォルダ作成エラー: ' + e.message); }

  sheet.appendRow([
    cid, body.companyName || '', body.contactName || '',
    body.zipCode || '', body.address || '', body.payTerms || '',
    body.maintPlan || '非加入', body.drivers || '', body.note || '',
    invFolderId
  ]);
  return _json({ success: true, clientId: cid });
}


// =====================================================
//  取引先：修正
// =====================================================
function _modifyClient(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  if (!sheet) return _json({ error: 'シートが見つかりません' });
  var cid = String(body.clientId || '').trim();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === cid) {
      var existingFolderId = data[i][9] || '';
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        cid, body.companyName || '', body.contactName || '',
        body.zipCode || '', body.address || '', body.payTerms || '',
        body.maintPlan || '非加入', body.drivers || '', body.note || '',
        existingFolderId
      ]]);
      return _json({ success: true, clientId: cid });
    }
  }
  return _json({ error: 'ID「' + cid + '」が見つかりません' });
}


// =====================================================
//  取引先：削除
// =====================================================
function _deleteClient(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  if (!sheet) return _json({ error: 'シートが見つかりません' });
  var cid = String(body.clientId || '').trim();
  var data = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === cid) {
      sheet.deleteRow(i + 1);
      return _json({ success: true, clientId: cid });
    }
  }
  return _json({ error: 'ID「' + cid + '」が見つかりません' });
}


// =====================================================
//  請求書：保存
// =====================================================
function _saveInvoice(body) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.INVOICE_DETAIL);
  if (!sheet) return _json({ error: '請求明細シートが見つかりません' });

  var invoiceId = body.invoiceId;
  var clientId = body.clientId;
  var yearMonth = body.yearMonth;
  var meta = body.meta || {};
  var lines = body.lines || [];
  if (!invoiceId || !clientId || !yearMonth) return _json({ error: '請求ID・取引先ID・年月が必要です' });

  // 既存データ削除（同一invoiceId）
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var idCol = h.indexOf('請求ID');
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idCol]) === invoiceId) sheet.deleteRow(i + 1);
  }

  // 新規挿入
  var now = new Date();
  lines.forEach(function(line) {
    sheet.appendRow([
      invoiceId, clientId, yearMonth, line.lineNo || 0,
      line.date || '', line.itemText || '', line.qty || 1, line.price || 0, line.memo || '',
      line.lineNo === 1 ? (meta.invDate || '') : '',
      line.lineNo === 1 ? (meta.invPayDate || '') : '',
      line.lineNo === 1 ? (meta.invStart || '') : '',
      line.lineNo === 1 ? (meta.invEnd || '') : '',
      line.lineNo === 1 ? (meta.invNote || '') : '',
      now
    ]);
  });
  return _json({ success: true, invoiceId: invoiceId, lines: lines.length });
}


// =====================================================
//  請求書：履歴一覧
// =====================================================
function _getInvoiceHistory(clientId) {
  if (!clientId) return _json([]);
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.INVOICE_DETAIL);
  if (!sheet) return _json([]);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return _json([]);

  var map = {};
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[1] || '') !== clientId) continue;
    var invId = String(r[0] || '');
    if (!map[invId]) map[invId] = { invoiceId: invId, yearMonth: String(r[2] || ''), total: 0 };
    map[invId].total += (Number(r[6]) || 0) * (Number(r[7]) || 0);
  }

  var result = Object.keys(map).map(function(k) { return map[k]; });
  result.sort(function(a, b) { return b.yearMonth.localeCompare(a.yearMonth); });
  result.forEach(function(inv) { inv.total = inv.total + Math.floor(inv.total * 0.1); });
  return _json(result);
}


// =====================================================
//  請求書：明細取得
// =====================================================
function _getInvoice(invoiceId) {
  if (!invoiceId) return _json({ error: '請求IDが必要です' });
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.INVOICE_DETAIL);
  if (!sheet) return _json({ error: 'シートが見つかりません' });
  var data = sheet.getDataRange().getValues();
  var lines = [], meta = {};

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[0]) !== invoiceId) continue;
    lines.push({
      lineNo: Number(r[3]) || 0, date: String(r[4] || ''),
      itemType: 'custom', itemText: String(r[5] || ''),
      qty: Number(r[6]) || 1, price: Number(r[7]) || 0, memo: String(r[8] || ''),
    });
    if (Number(r[3]) === 1 && r[9]) {
      meta = { invDate: String(r[9]||''), invPayDate: String(r[10]||''), invStart: String(r[11]||''), invEnd: String(r[12]||''), invNote: String(r[13]||'') };
    }
  }
  lines.sort(function(a, b) { return a.lineNo - b.lineNo; });
  return _json({ invoiceId: invoiceId, meta: meta, lines: lines });
}


// =====================================================
//  期日チェック（毎日9時）
// =====================================================
function checkDueDates() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var ci = function(n) { return h.indexOf(n); };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var alerts = { insp: [], oil: [] };

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var plate = r[ci(COL.PLATE)];
    if (!plate) continue;

    var inspDate = _toDate(r[ci(COL.INSPECTION)]);
    if (inspDate) {
      var d1 = _daysDiff(today, inspDate);
      if (CONFIG.NOTIFICATION_DAYS.VEHICLE_INSPECTION.indexOf(d1) !== -1) {
        alerts.insp.push('・' + plate + '　' + (d1 === 0 ? '【当日】' : 'あと' + d1 + '日') + '　期日：' + _fmtDate(inspDate));
      }
    }
    var oilDate = _toDate(r[ci(COL.OIL)]);
    if (oilDate) {
      var d2 = _daysDiff(today, oilDate);
      if (CONFIG.NOTIFICATION_DAYS.OIL_CHANGE.indexOf(d2) !== -1) {
        alerts.oil.push('・' + plate + '　' + (d2 === 0 ? '【当日】' : 'あと' + d2 + '日') + '　期日：' + _fmtDate(oilDate));
      }
    }
  }

  var total = alerts.insp.length + alerts.oil.length;
  if (total === 0) return;

  var ds = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var msg = ['📋 本日の期日通知　' + ds, '━━━━━━━━━━━━━━'];
  if (alerts.insp.length) { msg.push('🚗 車検満了日（' + alerts.insp.length + '件）'); alerts.insp.forEach(function(l) { msg.push(l); }); }
  if (alerts.insp.length && alerts.oil.length) msg.push('');
  if (alerts.oil.length) { msg.push('⛽ オイル交換日（' + alerts.oil.length + '件）'); alerts.oil.forEach(function(l) { msg.push(l); }); }
  _sendLine(msg.join('\n'));
}


// =====================================================
//  画像：アップロード
// =====================================================
function _uploadImage(body) {
  var plate = String(body.plate || '').trim();
  if (!plate) return _json({ error: 'ナンバーが空です' });

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.MASTER);
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var ci = function(n) { return h.indexOf(n); };

  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ci(COL.PLATE)]).trim() === plate) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return _json({ error: '車両が見つかりません' });

  var folderId = String(data[rowIdx][ci(COL.IMAGE)] || '').trim();

  // フォルダがなければ作成
  if (!folderId) {
    try {
      var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
      var carModel = data[rowIdx][ci(COL.CARMODEL)] || '';
      var folder = parent.createFolder(carModel + '_' + plate);
      folderId = folder.getId();
      sheet.getRange(rowIdx + 1, ci(COL.IMAGE) + 1).setValue(folderId);
    } catch(e) { return _json({ error: 'フォルダ作成エラー: ' + e.message }); }
  }

  var images = body.images || [];
  if (!images.length) return _json({ error: '画像がありません' });

  var folder = DriveApp.getFolderById(folderId);
  var uploaded = [];
  images.forEach(function(img, idx) {
    try {
      var b64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', img.name || 'img_' + Date.now() + '_' + idx + '.jpg');
      var file = folder.createFile(blob);
      uploaded.push({ fileId: file.getId(), url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800', name: file.getName() });
    } catch(e) {}
  });

  return _json({ success: true, uploaded: uploaded.length, images: uploaded });
}


// =====================================================
//  画像：削除
// =====================================================
function _deleteImage(body) {
  var fileId = String(body.fileId || '').trim();
  if (!fileId) return _json({ error: 'ファイルIDが空です' });

  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return _json({ success: true, fileId: fileId });
  } catch(e) {
    return _json({ error: 'ファイル削除エラー: ' + e.message });
  }
}


// =====================================================
//  認証：ホワイトリスト照合
// =====================================================
function _checkAuth(userId) {
  if (!userId) return _json({ authorized: false, applied: false });
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.ALLOWED_USERS);
  if (!sheet) return _json({ authorized: false, applied: false });
  var data = sheet.getDataRange().getValues();
  // ヘッダー: LINE UserID | 表示名 | プロフィール画像URL | 申請日時 | 承認
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      var approved = String(data[i][4] || '').trim();
      if (approved === '○' || approved === 'TRUE' || approved === 'true') {
        return _json({ authorized: true, applied: true });
      } else {
        return _json({ authorized: false, applied: true });
      }
    }
  }
  return _json({ authorized: false, applied: false });
}


// =====================================================
//  認証：アクセス申請
// =====================================================
function _applyAccess(body) {
  var userId = String(body.userId || '').trim();
  var displayName = body.displayName || '';
  if (!userId) return _json({ error: 'UserIDが空です' });

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.ALLOWED_USERS);
  if (!sheet) {
    // シートがなければ作成
    sheet = ss.insertSheet(CONFIG.SHEET.ALLOWED_USERS);
    sheet.appendRow(['LINE UserID', '表示名', 'プロフィール画像URL', '申請日時', '承認']);
  }

  // 既に登録済みかチェック
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      return _json({ success: true, message: '既に申請済みです' });
    }
  }

  // 新規追加
  sheet.appendRow([
    userId,
    displayName,
    body.pictureUrl || '',
    new Date(),
    ''  // 承認列は空（管理者が○を入れる）
  ]);

  _sendLine('🔑 アクセス申請\n━━━━━━━━━━━━━━\n名前：' + displayName + '\nUserID：' + userId + '\n\n※スプシの「許可ユーザー」シートで承認列を「○」にしてください');

  return _json({ success: true });
}


// =====================================================
//  トリガー設定（一度だけ実行）
// =====================================================
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkDueDates').timeBased().everyDays(1).atHour(9).create();
  Logger.log('トリガー設定完了');
}


// =====================================================
//  ユーティリティ
// =====================================================
function _getImagesFromFolder(folderId) {
  if (!folderId) return [];
  try {
    var folder = DriveApp.getFolderById(String(folderId).trim());
    var files = folder.getFiles();
    var exts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    var imgs = [];
    while (files.hasNext()) {
      var f = files.next();
      var n = f.getName().toLowerCase();
      if (exts.some(function(ext) { return n.endsWith('.' + ext); })) {
        imgs.push({
          fileId: f.getId(),
          url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800',
          name: f.getName(),
        });
      }
      if (imgs.length >= 20) break;
    }
    return imgs;
  } catch (e) {
    return [];
  }
}

function _sendLine(text) {
  try {
    UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify({ text: text, timestamp: new Date().toISOString() }),
      muteHttpExceptions: true,
    });
  } catch (e) { Logger.log('LINE通知失敗: ' + e.message); }
}

function _toDate(v) { if (!v) return null; if (v instanceof Date) return v; var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
function _fmtDate(d) { if (!d) return ''; return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function _daysDiff(a, b) { return Math.round((b.getTime() - a.getTime()) / 864e5); }
function _json(data) { var o = ContentService.createTextOutput(JSON.stringify(data)); o.setMimeType(ContentService.MimeType.JSON); return o; }
