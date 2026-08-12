(function () {
  'use strict';

  const TOKEN_KEY = 'signage_vendor_token';

  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const usageText = document.getElementById('usage-text');
  const deviceList = document.getElementById('device-list');
  const emptyState = document.getElementById('empty-state');

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function showLogin(message) {
    dashboardScreen.hidden = true;
    loginScreen.hidden = false;
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    } else {
      loginError.hidden = true;
    }
  }

  function showDashboard() {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    loadDevices();
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = Object.assign({}, options.headers, {
      Authorization: token ? `Bearer ${token}` : undefined,
    });
    const res = await fetch(`/api${path}`, Object.assign({}, options, { headers }));
    if (res.status === 401) {
      clearToken();
      showLogin('Sessão expirada. Entre novamente.');
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const password = passwordInput.value;
    try {
      const res = await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no login.');
      setToken(data.token);
      passwordInput.value = '';
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearToken();
    showLogin();
  });

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch {
      return iso;
    }
  }

  function renderDevices(devices, maxTvs) {
    usageText.textContent = `${devices.length} de ${maxTvs} telas em uso`;
    deviceList.innerHTML = '';
    emptyState.hidden = devices.length > 0;

    devices.forEach((device) => {
      const li = document.createElement('li');
      li.className = 'video-item device-item';

      const info = document.createElement('div');
      info.className = 'video-info';
      const title = document.createElement('div');
      title.className = 'video-title device-id';
      title.textContent = device.id;
      const meta = document.createElement('div');
      meta.className = 'video-meta';
      meta.textContent = `Primeira vez: ${formatDate(device.firstSeenAt)} · Última vez: ${formatDate(device.lastSeenAt)}`;
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'video-actions';
      const releaseBtn = document.createElement('button');
      releaseBtn.className = 'delete-btn';
      releaseBtn.textContent = 'Liberar';
      releaseBtn.addEventListener('click', () => releaseDevice(device.id));
      actions.append(releaseBtn);

      li.append(info, actions);
      deviceList.appendChild(li);
    });
  }

  async function loadDevices() {
    try {
      const data = await api('/vendor/devices');
      renderDevices(data.devices, data.maxTvs);
    } catch (err) {
      if (err.message !== 'unauthorized') console.error(err);
    }
  }

  async function releaseDevice(id) {
    if (!confirm('Liberar esta vaga de TV? O próximo aparelho que abrir o link do player vai ocupar o lugar dela.')) return;
    try {
      await api(`/vendor/devices/${id}`, { method: 'DELETE' });
      loadDevices();
    } catch (err) {
      console.error(err);
    }
  }

  if (getToken()) {
    showDashboard();
  } else {
    showLogin();
  }
})();
