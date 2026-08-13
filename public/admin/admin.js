(function () {
  'use strict';

  const TOKEN_KEY = 'signage_admin_token';

  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const uploadForm = document.getElementById('upload-form');
  const uploadTitle = document.getElementById('upload-title');
  const uploadFile = document.getElementById('upload-file');
  const uploadScreen = document.getElementById('upload-screen');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadProgressFill = uploadProgress.querySelector('.progress-fill');

  const urlForm = document.getElementById('url-form');
  const urlTitle = document.getElementById('url-title');
  const urlInput = document.getElementById('url-input');
  const urlScreen = document.getElementById('url-screen');

  const addError = document.getElementById('add-error');
  const videoList = document.getElementById('video-list');
  const emptyState = document.getElementById('empty-state');
  const refreshBtn = document.getElementById('refresh-btn');

  const playerLinkInput = document.getElementById('player-link');
  const copyLinkBtn = document.getElementById('copy-link-btn');

  const toastContainer = document.getElementById('toast-container');

  let maxTvs = 2;

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

  function showDashboard() {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    playerLinkInput.value = `${window.location.origin}/player`;
    loadVideos();
    connectSocket();
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
      const res = await fetch('/api/login', {
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
    if (socket) socket.disconnect();
    showLogin();
  });

  // Tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      uploadForm.hidden = tab !== 'upload';
      urlForm.hidden = tab !== 'url';
    });
  });

  function setAddError(message) {
    if (!message) { addError.hidden = true; return; }
    addError.textContent = message;
    addError.hidden = false;
  }

  function populateScreenSelects() {
    [uploadScreen, urlScreen].forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">Todas as TVs</option>';
      for (let i = 1; i <= maxTvs; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `TV ${i}`;
        select.appendChild(opt);
      }
      select.value = current;
    });
  }

  function screenLabel(screen) {
    return screen ? `TV ${screen}` : 'Todas as TVs';
  }

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setAddError('');
    const file = uploadFile.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', uploadTitle.value.trim());
    formData.append('screen', uploadScreen.value);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

    uploadProgress.hidden = false;
    uploadProgressFill.style.width = '0%';

    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        uploadProgressFill.style.width = `${pct}%`;
      }
    });

    xhr.onload = () => {
      uploadProgress.hidden = true;
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadForm.reset();
        populateScreenSelects();
        loadVideos();
        toast('Vídeo enviado com sucesso.', 'success');
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setAddError(data.error || 'Falha no upload.');
        } catch {
          setAddError('Falha no upload.');
        }
      }
    };
    xhr.onerror = () => {
      uploadProgress.hidden = true;
      setAddError('Falha de conexão durante o upload.');
    };
    xhr.send(formData);
  });

  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAddError('');
    try {
      await api('/videos/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: urlTitle.value.trim(),
          url: urlInput.value.trim(),
          screen: urlScreen.value,
        }),
      });
      urlForm.reset();
      populateScreenSelects();
      loadVideos();
      toast('Vídeo adicionado com sucesso.', 'success');
    } catch (err) {
      setAddError(err.message);
    }
  });

  function renderVideos(videos) {
    videoList.innerHTML = '';
    emptyState.hidden = videos.length > 0;

    videos.forEach((video, index) => {
      const li = document.createElement('li');
      li.className = `video-item${video.active ? '' : ' inactive'}`;

      const orderDiv = document.createElement('div');
      orderDiv.className = 'video-order-btns';
      const upBtn = document.createElement('button');
      upBtn.textContent = '▲';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => moveVideo(videos, index, -1));
      const downBtn = document.createElement('button');
      downBtn.textContent = '▼';
      downBtn.disabled = index === videos.length - 1;
      downBtn.addEventListener('click', () => moveVideo(videos, index, 1));
      orderDiv.append(upBtn, downBtn);

      const info = document.createElement('div');
      info.className = 'video-info';
      const title = document.createElement('div');
      title.className = 'video-title';
      title.textContent = video.title;
      const meta = document.createElement('div');
      meta.className = 'video-meta';
      meta.textContent = video.type === 'upload' ? 'Arquivo enviado' : 'Link externo';
      info.append(title, meta);

      const screenSelect = document.createElement('select');
      screenSelect.className = 'screen-select';
      screenSelect.title = 'Em qual TV este vídeo aparece';
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'Todas as TVs';
      screenSelect.appendChild(allOpt);
      for (let i = 1; i <= maxTvs; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `TV ${i}`;
        screenSelect.appendChild(opt);
      }
      screenSelect.value = video.screen ? String(video.screen) : '';
      screenSelect.addEventListener('change', () => changeScreen(video, screenSelect.value));

      const actions = document.createElement('div');
      actions.className = 'video-actions';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = `toggle-btn${video.active ? ' on' : ''}`;
      toggleBtn.textContent = video.active ? 'Ativo' : 'Inativo';
      toggleBtn.addEventListener('click', () => toggleActive(video));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Remover';
      deleteBtn.addEventListener('click', () => deleteVideo(video));
      actions.append(screenSelect, toggleBtn, deleteBtn);

      li.append(orderDiv, info, actions);
      videoList.appendChild(li);
    });
  }

  let currentVideos = [];

  async function loadVideos() {
    try {
      const data = await api('/videos');
      if (typeof data.maxTvs === 'number') {
        maxTvs = data.maxTvs;
        populateScreenSelects();
      }
      currentVideos = data.videos;
      renderVideos(currentVideos);
    } catch (err) {
      if (err.message !== 'unauthorized') console.error(err);
    }
  }

  async function moveVideo(videos, index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= videos.length) return;
    const reordered = [...videos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);
    currentVideos = reordered;
    renderVideos(currentVideos);
    try {
      await api('/videos/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map((v) => v.id) }),
      });
    } catch (err) {
      loadVideos();
    }
  }

  async function toggleActive(video) {
    try {
      await api(`/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !video.active }),
      });
      loadVideos();
      toast(video.active ? 'Vídeo desativado.' : 'Vídeo ativado.', 'info');
    } catch (err) {
      console.error(err);
    }
  }

  async function changeScreen(video, value) {
    try {
      await api(`/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screen: value }),
      });
      loadVideos();
      toast(`Agora exibindo em: ${screenLabel(value ? Number(value) : null)}.`, 'info');
    } catch (err) {
      console.error(err);
      loadVideos();
    }
  }

  async function deleteVideo(video) {
    if (!confirm(`Remover "${video.title}"?`)) return;
    try {
      await api(`/videos/${video.id}`, { method: 'DELETE' });
      loadVideos();
      toast('Vídeo removido.', 'danger');
    } catch (err) {
      console.error(err);
    }
  }

  refreshBtn.addEventListener('click', loadVideos);

  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(playerLinkInput.value);
      copyLinkBtn.textContent = 'Copiado!';
      setTimeout(() => { copyLinkBtn.textContent = 'Copiar'; }, 1500);
    } catch {
      playerLinkInput.select();
      document.execCommand('copy');
    }
  });

  // Socket.IO: apenas para mostrar status de conexao e atualizar a lista em tempo real.
  let socket = null;
  function connectSocket() {
    if (socket) return;
    socket = io({ auth: {} });
    socket.on('connect', () => {
      connDot.classList.add('online');
      connText.textContent = 'Conectado — atualizações em tempo real';
    });
    socket.on('disconnect', () => {
      connDot.classList.remove('online');
      connText.textContent = 'Desconectado — tentando reconectar...';
    });
    socket.on('playlist:updated', () => {
      loadVideos();
    });
  }

  // Bootstrap
  populateScreenSelects();
  if (getToken()) {
    showDashboard();
  } else {
    showLogin();
  }
})();
