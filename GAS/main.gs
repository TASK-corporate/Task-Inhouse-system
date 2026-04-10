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
  SPREADSHEET_ID: '1fojZ_b2AOqf5UAuWLAcbEUwbOOdgijwNbNpuJsM8kik',
  SHEET: {
    MASTER:          'マスターデータ',
    MODIFY_LOG:      '修正シート',
    CLIENT_MASTER:   '取引先マスター',
    INVOICE_DETAIL:  '請求明細',
    ALLOWED_USERS:   '許可ユーザー',
  },
  API_KEY_EMPLOYEE: 'a997e291429bbf3553591f3e9541b9bf',
  API_KEY_CLIENT:   'beccdd36ab6c29b2c1f8ef94834786bc',
  WEBHOOK_URL:      'https://hook.eu1.make.com/g8ie6ui66mwo417jhr58njv9fmodjnpp',
  PARENT_FOLDER_ID: '14qLifDTvX9TD_2Ev77Mq3ImXwgOIqsxT',
  INVOICE_PARENT_FOLDER_ID: '1pkvBcx_QwYejbyVRy_5OohCwATVIU66N',  // ★要設定：Driveに作成した請求書用親フォルダID
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
  IMAGE_PUBLIC:    '車両画像(公開)',
  IMAGE_INTERNAL:  '車両画像(社内)',
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
          images: v.imagesPublic, inspection: v.inspection,
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
    if (action === 'checkAuthByPassword') return _checkAuthByPassword(body);
    if (action === 'generateInvoicePDF')  return _generateInvoicePDF(body);

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
    var publicFolderId = r[ci(COL.IMAGE_PUBLIC)];
    var internalFolderId = r[ci(COL.IMAGE_INTERNAL)];
    var publicImgs = _getImagesFromFolder(publicFolderId);
    var internalImgs = _getImagesFromFolder(internalFolderId);
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
      imagesPublic:   publicImgs,
      imagesInternal: internalImgs,
      imageFolderPublic:   publicFolderId || '',
      imageFolderInternal: internalFolderId || '',
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

  var publicFolderId = '';
  var internalFolderId = '';
  try {
    var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    var vehicleFolder = parent.createFolder((body.carModel || '') + '_' + plate);
    var publicFolder = vehicleFolder.createFolder('公開');
    var internalFolder = vehicleFolder.createFolder('社内');
    publicFolderId = publicFolder.getId();
    internalFolderId = internalFolder.getId();
    // 登録時の画像は公開フォルダに保存
    if (body.images && body.images.length > 0) {
      body.images.forEach(function(img, idx) {
        try {
          var b64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
          var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', img.name || 'img_' + (idx+1) + '.jpg');
          publicFolder.createFile(blob);
        } catch(e) {}
      });
    }
    // 社内画像
    if (body.imagesInternal && body.imagesInternal.length > 0) {
      body.imagesInternal.forEach(function(img, idx) {
        try {
          var b64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
          var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', img.name || 'internal_' + (idx+1) + '.jpg');
          internalFolder.createFile(blob);
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
  newRow[ci(COL.IMAGE_PUBLIC)]    = publicFolderId;
  newRow[ci(COL.IMAGE_INTERNAL)]  = internalFolderId;
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

  // ステータスに応じてスプシの行背景色を変更
  var newStatus = changes.status || String(row[ci(COL.STATUS)] || '');
  var rowRange = sheet.getRange(rowIdx + 1, 1, 1, sheet.getLastColumn());
  if (newStatus === '事故廃車' || newStatus === '故障廃車') {
    rowRange.setBackground('#d9d9d9');  // グレー
  } else if (newStatus === '販売済') {
    rowRange.setBackground('#d1fae5');  // 薄い緑
  } else {
    rowRange.setBackground(null);  // デフォルトに戻す
  }

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
      clientType:   r[9] || '法人',
      billingType:  r[10] || '先払い',
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
        note: cData[i][8]||'', clientType: cData[i][9]||'法人', billingType: cData[i][10]||'先払い',
        invoiceFolderId: cData[i][11]||'',
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
      inv.total = inv.subtotal;
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

  // 請求書PDFフォルダを自動作成（請求書専用親フォルダ配下）
  var invFolderId = '';
  try {
    var invParent = DriveApp.getFolderById(CONFIG.INVOICE_PARENT_FOLDER_ID);
    var folder = invParent.createFolder('請求書_' + cid + '_' + (body.companyName || ''));
    invFolderId = folder.getId();
  } catch(e) { Logger.log('請求書フォルダ作成エラー: ' + e.message); }

  sheet.appendRow([
    cid, body.companyName || '', body.contactName || '',
    body.zipCode || '', body.address || '', body.payTerms || '',
    body.maintPlan || '非加入', body.drivers || '', body.note || '',
    body.clientType || '法人', body.billingType || '先払い',
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
      var existingFolderId = data[i][11] || '';
      sheet.getRange(i + 1, 1, 1, 12).setValues([[
        cid, body.companyName || '', body.contactName || '',
        body.zipCode || '', body.address || '', body.payTerms || '',
        body.maintPlan || '非加入', body.drivers || '', body.note || '',
        body.clientType || '法人', body.billingType || '先払い',
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
      now,
      line.area || ''
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

  var presetNames = ['車両代', '名変', '立替', '修理代'];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[0]) !== invoiceId) continue;
    var txt = String(r[5] || '');
    var type = (presetNames.indexOf(txt) !== -1) ? txt : 'custom';
    lines.push({
      lineNo: Number(r[3]) || 0, date: String(r[4] || ''),
      itemType: type, itemText: txt,
      qty: Number(r[6]) || 1, price: Number(r[7]) || 0, memo: String(r[8] || ''),
      area: String(r[15] || ''),
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
  var imageType = body.imageType || 'public';
  if (!plate) return _json({ error: 'ナンバーが空です' });

  var images = body.images || [];
  if (!images.length) return _json({ error: '画像がありません' });

  // フォルダIDがbodyに含まれていればスプシ検索をスキップ
  var folderId = String(body.folderId || '').trim();

  if (!folderId) {
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

    var colName = imageType === 'internal' ? COL.IMAGE_INTERNAL : COL.IMAGE_PUBLIC;
    folderId = String(data[rowIdx][ci(colName)] || '').trim();

    if (!folderId) {
      try {
        var parent = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
        var vehicleFolderName = (data[rowIdx][ci(COL.CARMODEL)] || '') + '_' + plate;
        var vehicleFolder;
        var folders = parent.getFoldersByName(vehicleFolderName);
        if (folders.hasNext()) { vehicleFolder = folders.next(); }
        else { vehicleFolder = parent.createFolder(vehicleFolderName); }
        var subName = imageType === 'internal' ? '社内' : '公開';
        var sub = vehicleFolder.getFoldersByName(subName);
        var folder;
        if (sub.hasNext()) { folder = sub.next(); }
        else { folder = vehicleFolder.createFolder(subName); }
        folderId = folder.getId();
        sheet.getRange(rowIdx + 1, ci(colName) + 1).setValue(folderId);
      } catch(e) { return _json({ error: 'フォルダ作成エラー: ' + e.message }); }
    }
  }

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

  return _json({ success: true, uploaded: uploaded.length, images: uploaded, folderId: folderId });
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
//  認証：アクセス申請（ID/PW対応）
// =====================================================
function _applyAccess(body) {
  var userId = String(body.userId || '').trim();
  var displayName = body.displayName || '';
  var loginId = String(body.loginId || '').trim();
  var passwordHash = String(body.passwordHash || '').trim();

  if (!userId && !loginId) return _json({ error: 'LINEユーザーIDまたはログインIDが必要です' });

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.ALLOWED_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET.ALLOWED_USERS);
    sheet.appendRow(['LINE UserID', '表示名', 'プロフィール画像URL', '申請日時', '承認', 'ログインID', 'パスワードハッシュ']);
  }

  var data = sheet.getDataRange().getValues();

  // 既存ユーザーチェック（LINE UserID または ログインID）
  for (var i = 1; i < data.length; i++) {
    if (userId && String(data[i][0]).trim() === userId) {
      // 既存のLINEユーザー → ログインID/PWが空なら追加設定
      if (loginId && !String(data[i][5] || '').trim()) {
        sheet.getRange(i + 1, 6).setValue(loginId);
        if (passwordHash) sheet.getRange(i + 1, 7).setValue(_hashSHA256(passwordHash));
      }
      return _json({ success: true, message: '既に申請済みです' });
    }
    if (loginId && String(data[i][5] || '').trim() === loginId) {
      return _json({ error: 'ログインID「' + loginId + '」は既に使われています' });
    }
  }

  // 新規追加（7列）
  sheet.appendRow([
    userId,
    displayName,
    body.pictureUrl || '',
    new Date(),
    '',  // 承認列
    loginId,
    passwordHash ? _hashSHA256(passwordHash) : ''
  ]);

  _sendLine('🔑 アクセス申請\n━━━━━━━━━━━━━━\n名前：' + displayName + (userId ? '\nLINE UserID：' + userId : '') + (loginId ? '\nログインID：' + loginId : '') + '\n\n※スプシの「許可ユーザー」シートで承認列を「TRUE」にしてください');

  return _json({ success: true });
}


// =====================================================
//  認証：ID/PWログイン
// =====================================================
function _checkAuthByPassword(body) {
  var loginId = String(body.loginId || '').trim();
  var passwordHash = String(body.passwordHash || '').trim();
  if (!loginId || !passwordHash) return _json({ authorized: false, error: 'IDとパスワードを入力してください' });

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET.ALLOWED_USERS);
  if (!sheet) return _json({ authorized: false, error: 'ユーザーが登録されていません' });
  var data = sheet.getDataRange().getValues();

  // ヘッダー: 0:LINE UserID | 1:表示名 | 2:画像URL | 3:申請日時 | 4:承認 | 5:ログインID | 6:パスワードハッシュ
  for (var i = 1; i < data.length; i++) {
    var storedLoginId = String(data[i][5] || '').trim();
    if (storedLoginId !== loginId) continue;

    // ログインID一致 → パスワード照合
    var storedHash = String(data[i][6] || '').trim();
    var inputHash = _hashSHA256(passwordHash); // クライアント側でハッシュ済み → サーバー側でもう一回ハッシュ（二重ハッシュ）

    if (storedHash !== inputHash) {
      return _json({ authorized: false, error: 'パスワードが正しくありません' });
    }

    // パスワード一致 → 承認チェック
    var approved = String(data[i][4] || '').trim();
    if (approved === '○' || approved === 'TRUE' || approved === 'true') {
      return _json({
        authorized: true,
        userId: data[i][0] || loginId,
        displayName: data[i][1] || loginId,
      });
    } else {
      return _json({ authorized: false, error: '管理者の承認待ちです' });
    }
  }
  return _json({ authorized: false, error: 'ログインIDが見つかりません' });
}


// =====================================================
//  ユーティリティ：SHA-256ハッシュ
// =====================================================
function _hashSHA256(input) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return raw.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}


// =====================================================
//  請求書：PDF生成 → Drive保存 → LINE通知
// =====================================================
function _generateInvoicePDF(body) {
  var clientId = body.clientId;
  var yearMonth = body.yearMonth;
  var lines = body.lines || [];
  var meta = body.meta || {};
  if (!clientId || !yearMonth) return _json({ error: '取引先IDと年月が必要です' });

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 取引先情報を取得
  var clientSheet = ss.getSheetByName(CONFIG.SHEET.CLIENT_MASTER);
  var cData = clientSheet.getDataRange().getValues();
  var clientInfo = null;
  for (var i = 1; i < cData.length; i++) {
    if (String(cData[i][0]).trim() === clientId) {
      clientInfo = {
        companyName: cData[i][1]||'', contactName: cData[i][2]||'',
        zipCode: cData[i][3]||'', address: cData[i][4]||'',
        clientType: cData[i][9]||'法人', billingType: cData[i][10]||'先払い',
        invoiceFolderId: cData[i][11]||''
      };
      break;
    }
  }
  if (!clientInfo) return _json({ error: '取引先が見つかりません' });

  // 敬称（法人→御中、個人→様）
  var honorific = clientInfo.clientType === '個人' ? '様' : '御中';

  // 請求書フォルダがなければ作成
  var folderId = clientInfo.invoiceFolderId;
  if (!folderId) {
    try {
      var invParent = DriveApp.getFolderById(CONFIG.INVOICE_PARENT_FOLDER_ID);
      var folder = invParent.createFolder('請求書_' + clientId + '_' + clientInfo.companyName);
      folderId = folder.getId();
      for (var i = 1; i < cData.length; i++) {
        if (String(cData[i][0]).trim() === clientId) {
          clientSheet.getRange(i + 1, 12).setValue(folderId);
          break;
        }
      }
    } catch(e) { return _json({ error: '請求書フォルダ作成エラー: ' + e.message }); }
  }

  // 金額計算（消費税なし：入力値がそのまま請求金額）
  var total = 0;
  lines.forEach(function(l) { total += (Number(l.qty) || 0) * (Number(l.price) || 0); });

  var ymLabel = yearMonth.substring(0, 4) + '年' + parseInt(yearMonth.substring(4)) + '月';

  // エリア区分が必要か判定（明細にarea情報があるか）
  var hasAreaGroups = lines.some(function(l) { return l.area && l.area.trim(); });
  var ROWS_PER_PAGE = 14;

  // HTMLテンプレート生成（プレビューと同じデザイン）
  var css = '<style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"MS Mincho","ヒラギノ明朝","Yu Mincho",serif;font-size:11px;color:#111;background:#fff}'
    + '.page{width:210mm;min-height:296mm;padding:20mm 15mm;position:relative;page-break-after:always}'
    + '.page:last-child{page-break-after:auto}'
    + '.title{font-size:24px;font-weight:700;text-align:center;text-decoration:underline;margin-bottom:6px}'
    + '.dateline{text-align:center;font-size:13px;margin-bottom:16px}'
    + '.toprow{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:16px}'
    + '.partner{font-size:18px;font-weight:700}'
    + '.partner-suffix{font-size:13px;font-weight:400;margin-left:4px}'
    + '.issuer{text-align:right;font-size:11px;line-height:1.7;flex-shrink:0}'
    + '.stamp-img{width:56px;height:56px;object-fit:contain;display:block;margin:0 0 4px auto}'
    + '.amount-row{border-top:1.5px solid #111;border-bottom:1.5px solid #111;padding:7px 0;margin-bottom:10px;display:flex;align-items:baseline;gap:16px}'
    + '.amount-label{font-size:13px;font-weight:700}'
    + '.amount-val{font-size:18px;font-weight:700}'
    + '.period{font-size:11px;margin-bottom:10px;color:#374151}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11.5px}'
    + 'th{background:#111;color:#fff;padding:5px 6px;text-align:left;font-weight:600;font-size:11px}'
    + 'th.tr,td.tr{text-align:right}'
    + 'td{padding:5px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top}'
    + 'tr:nth-child(even) td{background:#f9fafb}'
    + '.tax-row td{background:#fafafa;font-weight:600;border-bottom:1px solid #d1d5db}'
    + '.total-row td{background:#f0f0f0;font-weight:700;font-size:12px;border-bottom:1px solid #d1d5db}'
    + '.note{font-size:11px;color:#6b7280;margin-bottom:12px}'
    + '.bank{padding:8px;border:1px solid #d1d5db;font-size:11px;line-height:1.8;text-align:center;margin-bottom:30px}'
    + '.bank-title{font-weight:700;font-size:12px;margin-bottom:2px}'
    + '.footer-co{position:absolute;bottom:24px;left:48px;font-size:11px;font-weight:700}'
    + '.page-label{font-size:10px;color:#888;margin-bottom:10px}'
    + '</style>';

  function fmtM(n) { return Number(n).toLocaleString('ja-JP'); }

  // テーブルヘッダー
  var theadHtml = '<thead><tr><th style="width:6%">No.</th><th style="width:9%">月日</th><th style="width:26%">内容</th><th class="tr" style="width:8%">数量</th><th class="tr" style="width:14%">単価</th><th class="tr" style="width:14%">金額</th><th style="width:23%">備考</th></tr></thead>';

  // 明細行HTML
  var allRows = lines.map(function(l, idx) {
    var amt = (Number(l.qty)||0) * (Number(l.price)||0);
    return '<tr><td style="text-align:center">'+(idx+1)+'</td><td>'+(l.date||'')+'</td><td>'+(l.itemText||'')+'</td><td class="tr">'+(l.qty||1)+'</td><td class="tr">¥'+fmtM(l.price||0)+'</td><td class="tr">¥'+fmtM(amt)+'</td><td>'+(l.memo||'')+'</td></tr>';
  });

  // フッター（消費税なし）
  var footerHtml = '<tfoot>'
    + '<tr class="total-row"><td colspan="5" class="tr">合計</td><td class="tr">¥'+fmtM(total)+'</td><td></td></tr>'
    + '</tfoot>';

  var noteHtml = '<div class="note">備考：'+(meta.invNote||'')+'</div>';
  var bankHtml = '<div class="bank"><div class="bank-title">振込先</div>住信SBIネット銀行　法人第一支店<br>普通1419626</div>';
  var coHtml = '<div class="footer-co">株式会社TASK</div>';

  // ページヘッダー部分（1ページ目）
  function pageHeader() {
    return '<div class="title">請求書</div>'
      + '<div class="dateline">請求日&nbsp;&nbsp;'+(meta.invDate||'')+'</div>'
      + '<div class="toprow"><div><div class="partner">'+clientInfo.companyName+'<span class="partner-suffix">'+honorific+'</span></div></div>'
      + '<div class="issuer">'
      + '<img class="stamp-img" src="data:image/jpeg;base64,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">'
      + '株式会社TASK<br>〒571-0076<br>大阪府門真市大池町34-5<br>☎05012905476<br>登録番号T5120001226577'
      + '</div></div>'
      + '<div class="amount-row"><span class="amount-label">請求金額</span><span class="amount-val">¥&nbsp;'+fmtM(total)+'</span></div>'
      + '<div class="period">集計期間：'+(meta.invStart||'')+'～'+(meta.invEnd||'')+'&nbsp;&nbsp;支払実行日：'+(meta.invPayDate||'')+'</div>';
  }

  // エリア区分対応：明細をエリアごとにグルーピング
  var bodyContent = '';
  if (hasAreaGroups) {
    // エリアごとにグループ化
    var areaMap = {};
    var areaOrder = [];
    lines.forEach(function(l, idx) {
      var area = (l.area || '').trim() || 'その他';
      if (!areaMap[area]) { areaMap[area] = []; areaOrder.push(area); }
      areaMap[area].push(allRows[idx]);
    });
    areaOrder.forEach(function(area) {
      bodyContent += '<div style="font-size:13px;font-weight:700;text-align:center;margin:14px 0 8px">'+area+'</div>';
      bodyContent += '<table>'+theadHtml+'<tbody>'+areaMap[area].join('')+'</tbody></table>';
    });
    bodyContent += '<div style="margin-top:10px"><table><tfoot><tr class="total-row"><td colspan="5" class="tr">合計</td><td class="tr">¥'+fmtM(total)+'</td><td></td></tr></tfoot></table></div>';
  } else {
    bodyContent = '<table>'+theadHtml+'<tbody>'+allRows.join('')+'</tbody>'+footerHtml+'</table>';
  }
  bodyContent += noteHtml + bankHtml + coHtml;

  // ページ組み立て
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + css + '</head><body>';
  html += '<div class="page">' + pageHeader() + bodyContent + '</div>';
  html += '</body></html>';

  // HTML → PDF変換
  var blob = HtmlService.createHtmlOutput(html).getBlob().setName('請求書_' + clientInfo.companyName + '_' + yearMonth + '.pdf').getAs('application/pdf');

  // Driveに保存
  var folder = DriveApp.getFolderById(folderId);
  // 同名ファイルがあれば削除（上書き相当）
  var existingFiles = folder.getFilesByName(blob.getName());
  while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }
  var file = folder.createFile(blob);
  var fileUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // LINE通知
  _sendLine('📄 請求書PDF保存完了\n━━━━━━━━━━━━━━\n' + clientInfo.companyName + ' ' + ymLabel + '分\n合計：¥' + fmtM(total) + '\n\n' + fileUrl);

  return _json({ success: true, fileUrl: fileUrl, fileName: blob.getName() });
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
      if (imgs.length >= 30) break;
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
