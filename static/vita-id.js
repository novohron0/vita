(function () {
  const TOKEN_KEY = 'vitaOwnerToken';

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
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Не удалось открыть Vita ID');
    return data;
  }

  async function library() {
    const response = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: token() })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Не удалось загрузить кабинет');
    return data;
  }

  async function connect(profileCode) {
    const nextToken = makeToken();
    const response = await fetch('/api/profile/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: nextToken, profileCode })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Не удалось подключить Vita ID');
    localStorage.setItem(TOKEN_KEY, nextToken);
    return data;
  }

  window.VitaID = { token, ensure, library, connect };
})();
