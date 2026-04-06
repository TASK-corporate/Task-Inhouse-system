/**
 * 認証チェック（全employeeページ共通）
 * config.js の後に読み込むこと
 *
 * 認証方式:
 *   1. sessionStorage にセッションがあれば即表示（PC用）
 *   2. LIFFでログイン済みならGASで照合（LINE用）
 *   3. どちらもなければ login.html にリダイレクト
 *
 * グローバル変数:
 *   window.AUTH_USER = { userId, displayName, pictureUrl } （認証成功時）
 */

(function() {
  var hideStyle = document.createElement('style');
  hideStyle.textContent = 'body{visibility:hidden !important;}';
  document.head.appendChild(hideStyle);

  function showPage() {
    hideStyle.textContent = '';
    if (document.body) document.body.style.visibility = 'visible';
  }

  function goLogin(params) {
    window.location.href = APP_CONFIG.LOGIN_PATH + (params || '');
  }

  // ① sessionStorageチェック（PC用）
  try {
    var session = sessionStorage.getItem('AUTH_SESSION');
    if (session) {
      var s = JSON.parse(session);
      // 24時間以内のセッションなら有効
      if (s.loginTime && (Date.now() - s.loginTime) < 24 * 60 * 60 * 1000) {
        window.AUTH_USER = { userId: s.userId, displayName: s.displayName, pictureUrl: s.pictureUrl || '' };
        showPage();
        return; // 認証完了、以降の処理は不要
      } else {
        sessionStorage.removeItem('AUTH_SESSION');
      }
    }
  } catch(e) {}

  // ② LIFF認証（LINEブラウザ用）
  function loadLiff(cb) {
    if (typeof liff !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = cb;
    s.onerror = function() {
      // LIFFが読み込めない場合はPC環境 → login.htmlへ
      goLogin('');
    };
    document.head.appendChild(s);
  }

  loadLiff(function() {
    liff.init({ liffId: APP_CONFIG.LIFF_ID }).then(function() {
      if (!liff.isLoggedIn()) {
        // LINEブラウザ内ならLIFFログイン、外部ブラウザならlogin.htmlへ
        if (liff.isInClient()) {
          liff.login({ redirectUri: window.location.href });
        } else {
          goLogin('');
        }
        return;
      }

      liff.getProfile().then(function(profile) {
        fetch(APP_CONFIG.GAS_URL + '?action=checkAuth&userId=' + encodeURIComponent(profile.userId) + '&key=' + APP_CONFIG.API_KEY_EMPLOYEE)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.authorized) {
              window.AUTH_USER = {
                userId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl || '',
              };
              showPage();
            } else {
              goLogin('?status=pending&userId=' + encodeURIComponent(profile.userId) + '&name=' + encodeURIComponent(profile.displayName));
            }
          })
          .catch(function() { goLogin('?status=error'); });
      }).catch(function() { goLogin('?status=error'); });
    }).catch(function(err) {
      console.error('LIFF初期化エラー:', err);
      // LIFFが使えない環境 → login.htmlへ
      goLogin('');
    });
  });
})();
