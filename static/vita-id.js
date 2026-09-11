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

  function token() {
    let value = localStorage.getItem(TOKEN_KEY) || '';
    if (value.length < 20) {
      value = makeToken();
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }

  async function ensure(name = '') {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token(), name })
    });
    return responseData(response, 'Не удалось создать профиль Vita');
  }

  async function library() {
    const response = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token() })
    });
    return responseData(response, 'Не удалось загрузить кабинет');
  }

  async function connect(profileCode) {
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
    const form = new FormData();
    form.append('ownerToken', token());
    form.append('file', file);
    const response = await fetch('/api/profile/avatar', { method: 'POST', body: form });
    return responseData(response, 'Не удалось загрузить фото');
  }

  async function access() {
    const response = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token() })
    });
    return responseData(response, 'Не удалось проверить доступ');
  }

  async function buy(email) {
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
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
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
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
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
  }

  async function member(handle) {
    const clean = String(handle || '').trim().replace(/^@+/, '');
    const response = await fetch(`/api/member/${encodeURIComponent(clean)}`);
    return responseData(response, 'Профиль не найден');
  }

  window.VitaID = { token, ensure, library, connect, updateProfile, uploadAvatar, member, access, buy,
    loginTelegram, register, login, forgot, resetPass, logout };
})();
