(function () {
  'use strict';

  const CACHE_KEY = 'signage_player_cache';
  const DEVICE_KEY = 'signage_device_id';
  const POLL_INTERVAL_MS = 60 * 1000; // rede de seguranca, mesmo com o socket ativo
  const RETRY_ON_ERROR_MS = 4000;
  const RELOAD_AFTER_MS = 12 * 60 * 60 * 1000; // recarrega a pagina a cada 12h (higiene do navegador)
  const WATCHDOG_MS = 8000; // confere periodicamente se o video realmente esta tocando
  const FORCE_RELOAD_AFTER_STUCK_MS = 2 * 60 * 1000; // se nada resolver, recarrega a pagina sozinha

  const videoEl = document.getElementById('player');
  const placeholderEl = document.getElementById('placeholder');
  const tapOverlay = document.getElementById('tap-overlay');
  const blockedOverlay = document.getElementById('blocked-overlay');

  let queue = [];
  let currentIndex = 0;

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  const deviceId = getDeviceId();

  function showBlocked(show) {
    blockedOverlay.classList.toggle('visible', show);
    if (show) {
      videoEl.pause();
      showPlaceholder(false);
      videoEl.style.visibility = 'hidden';
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveCache(videos) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
    } catch {
      // storage indisponivel, sem problema, so perde o cache offline
    }
  }

  function absoluteSrc(video) {
    if (video.type === 'url') return video.src;
    return `${window.location.origin}${video.src}`;
  }

  function showPlaceholder(show) {
    placeholderEl.classList.toggle('hidden', !show);
    videoEl.style.visibility = show ? 'hidden' : 'visible';
  }

  function playIndex(index) {
    if (queue.length === 0) {
      showPlaceholder(true);
      return;
    }
    showPlaceholder(false);
    currentIndex = ((index % queue.length) + queue.length) % queue.length;
    const video = queue[currentIndex];
    const src = absoluteSrc(video);

    // So um video na playlist (ou repetindo o mesmo): reinicia sem trocar o src,
    // mais confiavel em alguns navegadores de TV do que reatribuir a mesma URL.
    if (videoEl.currentSrc === src || videoEl.src === src) {
      videoEl.currentTime = 0;
    } else {
      videoEl.src = src;
    }
    attemptPlay();
  }

  function attemptPlay() {
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        tapOverlay.classList.add('visible');
      });
    }
  }

  tapOverlay.addEventListener('click', () => {
    tapOverlay.classList.remove('visible');
    videoEl.play().catch(() => {});
  });

  videoEl.addEventListener('ended', () => {
    playIndex(currentIndex + 1);
  });

  // Rede de seguranca: TV sem ninguem por perto para tocar na tela.
  // Confere sozinho, de tempos em tempos, se o video devia estar tocando e nao esta.
  // Se mesmo assim continuar travado por muito tempo (ex: servidor fora do ar por um
  // instante), recarrega a propria pagina sozinha em vez de precisar de alguem mexer.
  let stuckSince = null;
  setInterval(() => {
    if (queue.length === 0 || blockedOverlay.classList.contains('visible')) {
      stuckSince = null;
      return;
    }
    if (videoEl.paused || videoEl.ended) {
      if (!stuckSince) stuckSince = Date.now();
      if (Date.now() - stuckSince > FORCE_RELOAD_AFTER_STUCK_MS) {
        window.location.reload();
        return;
      }
      attemptPlay();
    } else {
      stuckSince = null;
    }
  }, WATCHDOG_MS);

  // Quando a aba volta a ficar visivel/ativa (ex: TV saiu do modo de espera),
  // tenta reconectar e retomar a reproducao imediatamente, sem esperar o timer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchPlaylist();
      if (queue.length > 0 && videoEl.paused) attemptPlay();
    }
  });

  videoEl.addEventListener('error', () => {
    // Video quebrado/indisponivel: pula para o proximo apos uma pequena pausa.
    setTimeout(() => playIndex(currentIndex + 1), RETRY_ON_ERROR_MS);
  });

  videoEl.addEventListener('play', () => {
    tapOverlay.classList.remove('visible');
  });

  function sameQueue(a, b) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v.id === b[i].id && v.src === b[i].src && v.title === b[i].title);
  }

  function applyQueue(newQueue) {
    if (sameQueue(queue, newQueue)) return;

    const currentId = queue[currentIndex] ? queue[currentIndex].id : null;
    const wasEmpty = queue.length === 0;
    queue = newQueue;
    saveCache(queue);

    if (queue.length === 0) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      showPlaceholder(true);
      return;
    }

    if (wasEmpty) {
      playIndex(0);
      return;
    }

    const stillThereIndex = queue.findIndex((v) => v.id === currentId);
    if (stillThereIndex !== -1) {
      // O video atual continua na lista: so atualiza a posicao para o "ended" seguir corretamente.
      currentIndex = stillThereIndex;
    } else {
      // O video atual foi removido: troca assim que possivel.
      playIndex(0);
    }
  }

  async function fetchPlaylist() {
    try {
      const res = await fetch(`/api/player/videos?device=${encodeURIComponent(deviceId)}`, { cache: 'no-store' });
      if (res.status === 403) {
        showBlocked(true);
        return;
      }
      if (!res.ok) throw new Error('bad status');
      showBlocked(false);
      const data = await res.json();
      applyQueue(data.videos || []);
    } catch {
      // Sem internet/servidor no momento: mantem o que ja estava tocando (cache local).
      if (queue.length === 0) {
        const cached = loadCache();
        if (cached.length > 0) applyQueue(cached);
      }
    }
  }

  function connectSocket() {
    const socket = io({ reconnection: true, reconnectionDelay: 2000, reconnectionDelayMax: 15000 });
    socket.on('connect', fetchPlaylist);
    socket.on('playlist:updated', fetchPlaylist);
  }

  // Estado inicial: usa cache local imediatamente (TV liga e ja mostra algo),
  // depois busca a versao mais recente do servidor.
  const cached = loadCache();
  if (cached.length > 0) {
    queue = cached;
    playIndex(0);
  } else {
    showPlaceholder(true);
  }

  fetchPlaylist();
  connectSocket();
  setInterval(fetchPlaylist, POLL_INTERVAL_MS);
  setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
})();
