/**
 * 認証チェック（全employeeページ共通）
 * config.js の後に読み込むこと
 *
 * 認証方式:
 *   1. sessionStorage にセッションがあれば即表示（24時間有効）
 *   2. LIFF SDKでLINE UserIDを取得 → GASで照合
 *   3. どちらもなければ login.html にリダイレクト
 *
 * グローバル変数:
 *   window.AUTH_USER = { userId, displayName, pictureUrl }（認証成功時）
 */
(function () {
  // ページを非表示にしておく（認証完了まで）
  var hideStyle = document.createElement('style');
  hideStyle.textContent = 'body{visibility:hidden !important;opacity:0 !important;}';
  (document.head || document.documentElement).appendChild(hideStyle);

  function showPage() {
    hideStyle.textContent = '';
    if (document.body) {
      document.body.style.visibility = 'visible';
      document.body.style.opacity = '1';
    }
  }

  function goLogin(params) {
    var loginPath = (APP_CONFIG && APP_CONFIG.LOGIN_PATH) || 'login.html';
    window.location.href = loginPath + (params || '');
  }

  // ① sessionStorageチェック
  try {
    var session = sessionStorage.getItem('AUTH_SESSION');
    if (session) {
      var s = JSON.parse(session);
      if (s.loginTime && (Date.now() - s.loginTime) < 24 * 60 * 60 * 1000) {
        window.AUTH_USER = {
          userId: s.userId,
          displayName: s.displayName,
          pictureUrl: s.pictureUrl || ''
        };
        showPage();
        return;
      } else {
        sessionStorage.removeItem('AUTH_SESSION');
      }
    }
  } catch (e) { }

  // ② LIFF SDK読み込み → 認証
  function loadLiff(cb) {
    if (typeof liff !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = function () { cb(); };
    s.onerror = function () {
      // LIFF SDKが読み込めない → PC環境 → login.htmlへ
      goLogin('');
    };
    (document.head || document.documentElement).appendChild(s);
  }

  loadLiff(function () {
    liff.init({ liffId: APP_CONFIG.LIFF_ID })
      .then(function () {
        // LINEブラウザ内かどうか判定
        var inClient = liff.isInClient();
        var loggedIn = liff.isLoggedIn();

        if (!loggedIn) {
          if (inClient) {
            // LINEブラウザ内 → 自動ログイン（リダイレクトして戻ってくる）
            liff.login({ redirectUri: window.location.href });
          } else {
            // 外部ブラウザ → login.htmlのID/PWフォームへ
            goLogin('');
          }
          return;
        }

        // ログイン済み → プロフィール取得 → GAS照合
        liff.getProfile()
          .then(function (profile) {
            var userId = profile.userId;
            var url = APP_CONFIG.GAS_URL
              + '?action=checkAuth&userId=' + encodeURIComponent(userId)
              + '&key=' + APP_CONFIG.API_KEY_EMPLOYEE;

            fetch(url)
              .then(function (r) { return r.json(); })
              .then(function (data) {
                if (data.authorized) {
                  // セッション保存 → ページ表示
                  window.AUTH_USER = {
                    userId: userId,
                    displayName: profile.displayName,
                    pictureUrl: profile.pictureUrl || ''
                  };
                  sessionStorage.setItem('AUTH_SESSION', JSON.stringify({
                    userId: userId,
                    displayName: profile.displayName,
                    pictureUrl: profile.pictureUrl || '',
                    loginTime: Date.now()
                  }));
                  showPage();
                } else {
                  // 未承認 → login.htmlの申請画面へ
                  goLogin('?status=pending&userId=' + encodeURIComponent(userId)
                    + '&name=' + encodeURIComponent(profile.displayName));
                }
              })
              .catch(function () { goLogin('?status=error'); });
          })
          .catch(function () { goLogin('?status=error'); });
      })
      .catch(function () {
        // LIFF初期化失敗 → login.htmlへ
        goLogin('');
      });
  });
})();
