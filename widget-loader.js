(function () {
  console.log('Widget loader starting...');

  const WIDGET_BASE_URL = "https://nollerx.github.io/MY-HOSTED-WIDGET9";

  // Safer currentScript lookup
  let currentScript = document.currentScript;
  if (!currentScript) {
    currentScript = document.querySelector('script[src*="MY-HOSTED-WIDGET9/widget-loader.js"]');
  }

  // FIX 1: use underscore defaults to match DB; read dataset defensively
  const storeId   = (currentScript && currentScript.dataset.storeId)   || 'default_store';
  const storeName = (currentScript && currentScript.dataset.storeName) || 'default_name';
  console.log('Store configuration (attrs):', { storeId, storeName });

  // Expose early
  window.ELLO_STORE_ID   = storeId;
  window.ELLO_STORE_NAME = storeName;

  // FIX 2: encode ID + add select/limit
  const encodedId   = encodeURIComponent(storeId);
  const supabaseURL = `https://rwmvgwnebnsqcyhhurti.supabase.co/rest/v1/stores?store_id=eq.${encodedId}&select=*&limit=1`;

  let storeConfigPromise = new Promise((resolve) => {
    fetch(supabaseURL, {
      headers: {
        'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXZnd25lYm5zcWN5aGh1cnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDc1MTgsImV4cCI6MjA2Mzk4MzUxOH0.OYTXiUBDN5IBlFYDHN3MyCwFUkSb8sgUOewBeSY01NY',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXZnd25lYm5zcWN5aGh1cnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDc1MTgsImV4cCI6MjA2Mzk4MzUxOH0.OYTXiUBDN5IBlFYDHN3MyCwFUkSb8sgUOewBeSY01NY',
        'Accept':        'application/json'
      }
    })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP '+r.status)))
    .then(rows => {
      const row = Array.isArray(rows) ? rows[0] : null;
      window.ELLO_STORE_CONFIG = row ? {
        storeId: row.store_id,
        storeName: storeName, // keep script tag value for asset prefix
        clothingPopulationType: row.clothing_population_type || 'supabase',
        planName: row.plan_name
      } : {
        storeId, storeName, clothingPopulationType: 'supabase', planName: 'STARTER'
      };
      console.log('✅ Store configuration loaded:', window.ELLO_STORE_CONFIG);
      resolve(window.ELLO_STORE_CONFIG);
    })
    .catch(err => {
      console.error('❌ Error fetching store configuration:', err);
      window.ELLO_STORE_CONFIG = {
        storeId, storeName, clothingPopulationType: 'supabase', planName: 'STARTER'
      };
      console.log('⚠️ Using fallback configuration:', window.ELLO_STORE_CONFIG);
      resolve(window.ELLO_STORE_CONFIG);
    });
  });

  // Container
  const container = document.createElement('div');
  container.id = "virtual-tryon-widget-container";
  document.body.appendChild(container);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  async function initializeWidget() {
    try {
      console.log('⏳ Waiting for store configuration...');
      await storeConfigPromise;
      console.log('✅ Store configuration ready:', window.ELLO_STORE_CONFIG);

      console.log('🔄 Fetching HTML from:', `${WIDGET_BASE_URL}/index.html`);
      const res = await fetch(`${WIDGET_BASE_URL}/index.html`, {
        method: 'GET',
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // inline <style> blocks
      const styles = doc.querySelectorAll('style');
      if (styles.length) {
        const styleEl = document.createElement('style');
        styleEl.textContent = Array.from(styles).map(s => s.textContent).join('\n');
        document.head.appendChild(styleEl);
      }

      // external links
      doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="icon"], link[rel="preload"]')
        .forEach(link => {
          const copy = document.createElement('link');
          for (const a of link.attributes) copy.setAttribute(a.name, a.value);
          document.head.appendChild(copy);
        });

      // remove inline scripts from body
      doc.querySelectorAll('script').forEach(s => s.remove());
      container.innerHTML = doc.body.innerHTML;

      // FIX 3: cache-bust widget-main, and PASS CONFIG into init
      const mainUrl = `${WIDGET_BASE_URL}/widget-main.js?v=${Date.now()}`;
      console.log('🔄 Loading script from:', mainUrl);
      await loadScript(mainUrl);

      console.log('✅ Script loaded, initializing widget...');
      if (typeof window.initializeWidget === 'function') {
        // IMPORTANT: pass store config so widget-main doesn't fall back to default_store
        window.initializeWidget(window.ELLO_STORE_CONFIG);
      } else {
        console.warn('[Ello] initializeWidget() not found');
      }
    } catch (e) {
      console.error("Virtual Try-On Widget failed to load:", e);
      container.innerHTML = '<p style="color: red;">Widget failed to load</p>';
    }
  }

  initializeWidget();
})();
