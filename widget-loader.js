(function () {
  console.log('Widget loader starting...');

  const WIDGET_BASE_URL = "https://nollerx.github.io/MY-HOSTED-WIDGET9";

  // --- safer currentScript lookup
  let currentScript = document.currentScript;
  if (!currentScript) {
    currentScript = document.querySelector('script[src*="MY-HOSTED-WIDGET9/widget-loader.js"]');
  }

  // --- FIX 1: defaults with underscores to match your DB
  const storeId   = currentScript?.dataset.storeId   || 'default_store';
  const storeName = currentScript?.dataset.storeName || 'default_name';

  if (!currentScript) console.warn('[Ello] currentScript not found; using defaults.');
  if (!currentScript?.dataset?.storeId)   console.warn('[Ello] data-store-id missing; using', storeId);
  if (!currentScript?.dataset?.storeName) console.warn('[Ello] data-store-name missing; using', storeName);

  console.log('Store configuration (attrs):', { storeId, storeName });

  // expose early (if other scripts read them)
  window.ELLO_STORE_ID = storeId;
  window.ELLO_STORE_NAME = storeName;

  // --- FIX 3: URL-encode & add select/limit for Supabase REST
  const encodedId = encodeURIComponent(storeId);
  const supabaseUrl = `https://rwmvgwnebnsqcyhhurti.supabase.co/rest/v1/stores?store_id=eq.${encodedId}&select=*&limit=1`;

  let storeConfigPromise = new Promise((resolve) => {
    fetch(supabaseUrl, {
      headers: {
        'apikey':       'YOUR_PUBLIC_ANON_KEY',    // ok to be public if RLS is tight
        'Authorization':'Bearer YOUR_PUBLIC_ANON_KEY',
        'Accept':       'application/json'
      }
    })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP '+r.status)))
    .then(rows => {
      console.log('🗄️ Raw store data from Supabase:', rows);
      const row = Array.isArray(rows) && rows[0];

      // --- FIX 5: prefer DB canonical name if you have it (optional)
      const effectiveStoreName = (row && (row.store_name || row.domain_slug)) || storeName;

      window.ELLO_STORE_CONFIG = row ? {
        storeId: row.store_id,
        storeName: effectiveStoreName,
        clothingPopulationType: row.clothing_population_type || 'supabase',
        planName: row.plan_name
      } : {
        storeId,
        storeName,
        clothingPopulationType: 'supabase',
        planName: 'STARTER'
      };

      console.log('✅ Store configuration loaded:', window.ELLO_STORE_CONFIG);
      resolve(window.ELLO_STORE_CONFIG);
    })
    .catch(err => {
      console.error('❌ Error fetching store configuration:', err);
      window.ELLO_STORE_CONFIG = {
        storeId,
        storeName,
        clothingPopulationType: 'supabase',
        planName: 'STARTER'
      };
      console.log('⚠️ Using fallback configuration:', window.ELLO_STORE_CONFIG);
      resolve(window.ELLO_STORE_CONFIG);
    });
  });

  // container
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

      // external links (css/fonts)
      doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="icon"], link[rel="preload"]')
        .forEach(link => {
          const copy = document.createElement('link');
          for (const attr of link.attributes) copy.setAttribute(attr.name, attr.value);
          document.head.appendChild(copy);
        });

      // strip scripts from HTML body (we load widget-main separately)
      doc.querySelectorAll('script').forEach(s => s.remove());

      container.innerHTML = doc.body.innerHTML;

      console.log('🔄 Loading script from:', `${WIDGET_BASE_URL}/widget-main.js`);
      await loadScript(`${WIDGET_BASE_URL}/widget-main.js`);

      console.log('✅ Script loaded, initializing widget...');
      if (typeof window.initializeWidget === 'function') {
        window.initializeWidget();
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
