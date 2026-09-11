(function () {
  const TOKEN_KEY = 'vitaOwnerToken';

  async function responseData(response, fallback) {
    let data;
    try { data = await response.json(); }
    catch { data = {}; }
    const detail = typeof data.detail === 'string' ? data.detail : fallback;
    if (!response.ok) throw new Error(detail);
    return data;
  }

  function makeToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Хранилище браузера могли почистить (Safari сам стирает его через неделю
  // без захода), но ключ устройства лежит ещё и в куке — забираем его оттуда,
  // пока никто не успел создать новый профиль на пустом месте.
  let session = null;
  function ensureSession() {
    if (session) return session;
    session = (async () => {
      const stored = localStorage.getItem(TOKEN_KEY) || '';
      if (stored.length >= 20) return;
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (data && data.token) localStorage.setItem(TOKEN_KEY, data.token);
      } catch {}
    })();
    return session;
  }

  function token() {
    let value = localStorage.getItem(TOKEN_KEY) || '';
    if (value.length < 20) {
      value = makeToken();
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }

  async function ensure(name = '') {
    await ensureSession();
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token(), name })
    });
    return responseData(response, 'Не удалось создать профиль Vita');
  }

  async function library() {
    await ensureSession();
    const response = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token() })
    });
    return responseData(response, 'Не удалось загрузить кабинет');
  }

  async function connect(profileCode) {
    await ensureSession();
    const nextToken = makeToken();
    const response = await fetch('/api/profile/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: nextToken, profileCode })
    });
    const data = await responseData(response, 'Не удалось подключить Vita ID');
    localStorage.setItem(TOKEN_KEY, nextToken);
    return data;
  }

  async function updateProfile(values) {
    await ensureSession();
    const response = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken: token(),
        name: values.name || '',
        handle: (values.handle || '').replace(/^@+/, ''),
        bio: values.bio || ''
      })
    });
    return responseData(response, 'Не удалось сохранить профиль');
  }

  async function uploadAvatar(file) {
    await ensureSession();
    const form = new FormData();
    form.append('ownerToken', token());
    form.append('file', file);
    const response = await fetch('/api/profile/avatar', { method: 'POST', body: form });
    return responseData(response, 'Не удалось загрузить фото');
  }

  async function access() {
    await ensureSession();
    const response = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token() })
    });
    return responseData(response, 'Не удалось проверить доступ');
  }

  async function buy(email) {
    await ensureSession();
    const response = await fetch('/api/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token(), email })
    });
    return responseData(response, 'Не удалось начать оплату');
  }

  async function loginTelegram(user) {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, ownerToken: token() })
    });
    const data = await responseData(response, 'Телеграм не подтвердил вход');
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem('vitaSignedIn', '1');
    }
    return data;
  }

  // Вход по почте: ключ устройства, который вернул сервер, заменяет прежний —
  // с этой минуты браузер работает под тем аккаунтом, в который вошли.
  async function authPost(path, body, fallback) {
    const response = await fetch('/api/auth/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token(), ...body })
    });
    const data = await responseData(response, fallback);
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem('vitaSignedIn', '1');   // чтобы вход не мигал при следующем заходе
    }
    return data;
  }

  const register = (email, password) =>
    authPost('register', { email, password }, 'Не получилось зарегистрироваться');
  const login = (email, password) =>
    authPost('login', { email, password }, 'Не получилось войти');
  const forgot = email =>
    authPost('forgot', { email }, 'Не получилось отправить код');
  const resetPass = (email, code, password) =>
    authPost('reset', { email, code, password }, 'Не получилось сменить пароль');

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('vitaSignedIn');
    session = null;
    // куку гасит сервер: без этого следующий заход молча вернул бы в аккаунт
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }

  async function member(handle) {
    const clean = String(handle || '').trim().replace(/^@+/, '');
    const response = await fetch(`/api/member/${encodeURIComponent(clean)}`);
    return responseData(response, 'Профиль не найден');
  }

  window.VitaID = { token, ensure, library, connect, updateProfile, uploadAvatar, member, access, buy,
    loginTelegram, register, login, forgot, resetPass, logout };
})();
