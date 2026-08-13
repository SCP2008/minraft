(function () {
  'use strict';

  const TOKEN_KEY = 'signage_vendor_token';
  const REFRESH_MS = 15000;

  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const usageText = document.getElementById('usage-text');
  const deviceList = document.getElementById('device-list');
  const emptyState = document.getElementById('empty-state');
  const toastContainer = document.getElementById('toast-container');

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function toast(message, kind) {
    const el = document.createElement('div');
    el.className = `toast${kind ? ` toast--${kind}` : ''}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

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

  let refreshTimer = null;

  function showDashboard() {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    loadDevices();
    if (!refreshTimer) refreshTimer = setInterval(loadDevices, REFRESH_MS);
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
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    showLogin();
  });

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 10) return 'agora mesmo';
    if (sec < 60) return `há ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `há ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `há ${hr}h`;
    const days = Math.floor(hr / 24);
    return `há ${days}d`;
  }

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

      const statusDot = document.createElement('span');
      statusDot.className = `dot${device.online ? ' online' : ''}`;
      statusDot.title = device.online ? 'Online' : 'Offline';

      const info = document.createElement('div');
      info.className = 'video-info';
      const title = document.createElement('div');
      title.className = 'video-title';
      const screenTag = document.createElement('span');
      screenTag.className = 'screen-tag';
      screenTag.textContent = `Tela ${device.screen}`;
      title.append(screenTag, ` ${device.id}`);
      const meta = document.createElement('div');
      meta.className = 'video-meta';
      meta.textContent = device.online
        ? `Conectada — última confirmação ${relativeTime(device.lastSeenAt)}`
        : `Sem contato ${relativeTime(device.lastSeenAt)} (desde ${formatDate(device.lastSeenAt)})`;
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'video-actions';
      const releaseBtn = document.createElement('button');
      releaseBtn.className = 'delete-btn';
      releaseBtn.textContent = 'Liberar';
      releaseBtn.addEventListener('click', () => releaseDevice(device.id));
      actions.append(releaseBtn);

      li.append(statusDot, info, actions);
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
      toast('Vaga liberada.', 'success');
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
