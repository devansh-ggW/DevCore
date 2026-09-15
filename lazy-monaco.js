(() => {
  // Keep the shell responsive first. Monaco loads in idle time instead of
  // blocking the first paint of DevCore.
  const queuedCalls = [];
  let savedConfig = null;

  function lazyRequire(deps, callback) {
    queuedCalls.push({ deps, callback });
  }

  lazyRequire.config = (config) => {
    savedConfig = config;
  };

  window.require = lazyRequire;

  function loadMonaco() {
    const script = document.createElement('script');
    script.src = 'node_modules/monaco-editor/min/vs/loader.js';
    script.async = true;
    script.onload = () => {
      const amdRequire = window.require;
      if (!amdRequire || amdRequire === lazyRequire) return;

      if (savedConfig) amdRequire.config(savedConfig);
      for (const call of queuedCalls.splice(0)) {
        amdRequire(call.deps, call.callback);
      }
    };
    document.head.appendChild(script);
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadMonaco, { timeout: 500 });
  } else {
    window.setTimeout(loadMonaco, 200);
  }
})();
