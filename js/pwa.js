/** Project-scoped installation and update adapter. No data or form mutation. */
export const PWA_VERSION = '2026-10-31-reference-4';
export const IOS_INSTALL_INSTRUCTIONS = 'Откройте сайт в Safari. Нажмите «Поделиться» (в некоторых раскладках: меню страницы → «Поделиться»), затем «На экран Домой». Оставьте «Открывать как веб-приложение» включённым, если этот переключатель показан, и нажмите «Добавить».';
export const INSTALL_HELP_SOURCE = 'https://support.apple.com/guide/iphone/iphea86e5236/ios';

function askWorker(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 4000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close(); resolve(event.data);
    };
    try { worker.postMessage({type: 'GET_STATUS'}, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
  });
}

export function setupPWA({onStatus = () => {}, onUpdate = () => {}, onInstalled = () => {}} = {}) {
  const media = window.matchMedia('(display-mode: standalone)');
  const isStandalone = () => media.matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const state = {
    supported: 'serviceWorker' in navigator, secure: window.isSecureContext,
    standalone: isStandalone(), installed: isStandalone(), isIOS,
    canInstall: false, offlineReady: false, waiting: false,
    reloadRequired: false, online: navigator.onLine,
    version: null, newVersion: null, registration: null, error: null
  };
  let deferredPrompt = null;
  let applyRequested = false;
  let hadController = Boolean(navigator.serviceWorker?.controller);
  let updateTimer = null;
  let destroyed = false;
  const notify = () => { if (!destroyed) onStatus({...state}); };
  const update = () => {
    if (!destroyed) onUpdate({available: state.waiting || state.reloadRequired,
      reloadRequired: state.reloadRequired, version: state.newVersion});
  };
  async function refreshStatus() {
    const active = state.registration?.active || navigator.serviceWorker?.controller;
    const status = await askWorker(active);
    state.offlineReady = status?.offlineReady === true;
    state.version = status?.version || null;
    state.standalone = isStandalone();
    notify();
    return status;
  }
  async function advertiseWaiting() {
    const waiting = state.registration?.waiting;
    if (!waiting) return;
    state.waiting = true;
    state.newVersion = (await askWorker(waiting))?.version || null;
    notify(); update();
  }
  const beforeInstall = event => {
    event.preventDefault(); deferredPrompt = event; state.canInstall = true; notify();
  };
  const installed = () => {
    deferredPrompt = null; state.installed = true; state.canInstall = false;
    state.standalone = isStandalone(); notify(); onInstalled({...state});
  };
  const connectivity = () => { state.online = navigator.onLine; notify(); };
  const displayChange = () => { state.standalone = isStandalone(); notify(); };
  const controlled = async () => {
    if (applyRequested) {
      clearTimeout(updateTimer);
      // Only explicit applyUpdate(), guarded by the application, reaches this.
      window.location.reload(); return;
    }
    if (hadController) {
      state.reloadRequired = true; state.waiting = false;
      state.newVersion = (await askWorker(navigator.serviceWorker.controller))?.version || null;
      update();
    }
    hadController = true;
    await refreshStatus();
  };
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', installed);
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  media.addEventListener?.('change', displayChange);
  navigator.serviceWorker?.addEventListener('controllerchange', controlled);

  const ready = (async () => {
    if (!state.supported || !state.secure) {
      state.error = !state.secure ? 'Для установки и офлайна откройте приложение по HTTPS или на localhost.' : 'Этот браузер не поддерживает service worker. Обычный браузерный режим доступен.';
      notify(); return null;
    }
    try {
      const script = new URL('../sw.js', import.meta.url);
      const scope = new URL('../', import.meta.url);
      state.registration = await navigator.serviceWorker.register(script, {scope: scope.pathname, updateViaCache: 'none'});
      const registration = state.registration;
      await advertiseWaiting();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', async () => {
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) await advertiseWaiting();
          } else if (installing.state === 'activated') {
            await refreshStatus();
          } else if (installing.state === 'redundant' && !registration.active) {
            state.error = 'Не удалось подготовить офлайн-оболочку. Проверьте сеть и повторите проверку обновлений.';
            notify();
          }
        });
      });
      // A fulfilled register call is not proof that the shell is cached.
      navigator.serviceWorker.ready.then(() => refreshStatus()).catch(() => {});
      await refreshStatus();
      return registration;
    } catch (error) {
      state.error = 'Не удалось включить офлайн-оболочку: ' + (error?.message || String(error));
      notify(); return null;
    }
  })();
  notify();
  return {
    ready,
    get state() { return {...state}; },
    async install() {
      if (state.installed || state.standalone) return {status: 'installed'};
      if (!deferredPrompt) return {status: 'instructions', isIOS, instructions: isIOS ? IOS_INSTALL_INSTRUCTIONS : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран», если этот пункт доступен. Установка зависит от браузера; сайт также работает в обычной вкладке.'};
      const prompt = deferredPrompt;
      deferredPrompt = null; state.canInstall = false;
      await prompt.prompt();
      const result = await prompt.userChoice;
      notify();
      // An accepted prompt is not a fabricated appinstalled event.
      return {status: result.outcome === 'accepted' ? 'accepted' : 'dismissed'};
    },
    async checkUpdate() {
      const registration = await ready;
      if (!registration) return {status: 'unavailable', message: state.error};
      try {
        state.error = null;
        await registration.update();
        await advertiseWaiting(); await refreshStatus();
        return {status: state.waiting || state.reloadRequired ? 'available' : 'current'};
      } catch {
        state.error = navigator.onLine ? 'Не удалось проверить обновления. Попробуйте позже.' : 'Для проверки обновлений подключитесь к сети.';
        notify(); return {status: 'error', message: state.error};
      }
    },
    async applyUpdate() {
      const registration = await ready;
      if (state.reloadRequired) {
        applyRequested = true; window.location.reload(); return {status: 'reloading'};
      }
      if (!registration?.waiting) return {status: 'unavailable'};
      applyRequested = true; state.error = null;
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
      updateTimer = setTimeout(() => {
        applyRequested = false;
        state.error = 'Обновление пока не применилось. Ваш ввод остаётся на странице; повторите действие позже.';
        notify();
      }, 10000);
      return {status: 'applying'};
    },
    destroy() {
      destroyed = true; clearTimeout(updateTimer);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      media.removeEventListener?.('change', displayChange);
      navigator.serviceWorker?.removeEventListener('controllerchange', controlled);
    }
  };
}
