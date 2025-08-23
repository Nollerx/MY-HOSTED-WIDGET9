(function () {
    console.log('Widget loader starting...');
    
    const WIDGET_BASE_URL = "https://nollerx.github.io/MY-HOSTED-WIDGET9";
    
    // Get store configuration from script tag
    const currentScript = document.currentScript;
    const storeId = currentScript.dataset.storeId || 'default-store';
    const storeName = currentScript.dataset.storeName || 'default-name';
    
    console.log('Store configuration:', { storeId, storeName });
    
    // Set global variables before loading widget
    window.ELLO_STORE_ID = storeId;
    window.ELLO_STORE_NAME = storeName;
    
    // Create a promise to handle store configuration loading
    let storeConfigPromise = new Promise((resolve) => {
        // Fetch store configuration from Supabase
        function fetchStoreConfiguration() {
            fetch(`https://rwmvgwnebnsqcyhhurti.supabase.co/rest/v1/stores?store_id=eq.${storeId}`, {
                headers: {
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXZnd25lYm5zcWN5aGh1cnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDc1MTgsImV4cCI6MjA2Mzk4MzUxOH0.OYTXiUBDN5IBlFYDHN3MyCwFUkSb8sgUOewBeSY01NY',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXZnd25lYm5zcWN5aGh1cnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDc1MTgsImV4cCI6MjA2Mzk4MzUxOH0.OYTXiUBDN5IBlFYDHN3MyCwFUkSb8sgUOewBeSY01NY'
                }
            })
            .then(function(response) {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('HTTP error! status: ' + response.status);
                }
            })
            .then(function(data) {
                console.log('🗄️ Raw store data from Supabase:', data);
                if (data && data.length > 0) {
                    var storeConfig = data[0];
                    console.log('🗄️ Individual store config:', storeConfig);
                    console.log('🗄️ clothing_population_type from DB:', storeConfig.clothing_population_type);
                    window.ELLO_STORE_CONFIG = {
                        storeId: storeConfig.store_id,
                        storeName: storeName, // Keep the original script tag value for Shopify
                        clothingPopulationType: storeConfig.clothing_population_type || 'supabase',
                        planName: storeConfig.plan_name
                    };
                    console.log('✅ Store configuration loaded:', window.ELLO_STORE_CONFIG);
                } else {
                    // Fallback to default configuration
                    window.ELLO_STORE_CONFIG = {
                        storeId: storeId,
                        storeName: storeName,
                        clothingPopulationType: 'supabase',
                        planName: 'STARTER'
                    };
                    console.log('⚠️ Store not found in Supabase, using default configuration:', window.ELLO_STORE_CONFIG);
                }
                resolve(window.ELLO_STORE_CONFIG);
            })
            .catch(function(error) {
                console.error('❌ Error fetching store configuration:', error);
                // Fallback to default configuration
                window.ELLO_STORE_CONFIG = {
                    storeId: storeId,
                    storeName: storeName,
                    clothingPopulationType: 'supabase',
                    planName: 'STARTER'
                };
                console.log('⚠️ Error occurred, using fallback configuration:', window.ELLO_STORE_CONFIG);
                resolve(window.ELLO_STORE_CONFIG);
            });
        }
        
        // Start fetching store configuration
        fetchStoreConfiguration();
    });
    
    // Create container
    const container = document.createElement('div');
    container.id = "virtual-tryon-widget-container";
    document.body.appendChild(container);
    
    // Function to load and execute script
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    
    // Main initialization function that waits for store config
    async function initializeWidget() {
        try {
            // Wait for store configuration to be loaded
            console.log('⏳ Waiting for store configuration...');
            await storeConfigPromise;
            console.log('✅ Store configuration ready:', window.ELLO_STORE_CONFIG);
            
            // Fetch and inject HTML
            console.log('🔄 Fetching HTML from:', `${WIDGET_BASE_URL}/index.html`);
            const response = await fetch(`${WIDGET_BASE_URL}/index.html`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!response.ok) {
                console.error('❌ Failed to fetch HTML:', response.status, response.statusText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const html = await response.text();
            console.log('✅ HTML fetched successfully');
            
            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract styles from head
            const styles = doc.querySelectorAll('style');
            let styleContent = '';
            styles.forEach(style => {
                styleContent += style.innerHTML + '\n';
            });
            
            // Create and inject style element
            if (styleContent) {
                const styleElement = document.createElement('style');
                styleElement.innerHTML = styleContent;
                document.head.appendChild(styleElement);
                console.log('Styles injected');
            }

            // Inject link elements (e.g., external stylesheets, fonts)
            const links = doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="icon"], link[rel="preload"]');
            links.forEach(link => {
                const linkElement = document.createElement('link');
                Array.from(link.attributes).forEach(attr => {
                    linkElement.setAttribute(attr.name, attr.value);
                });
                document.head.appendChild(linkElement);
            });
            
            // Remove script tags from body
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(script => script.remove());
            
            // Get the body content
            const bodyContent = doc.body.innerHTML;
            
            // Inject the HTML
            container.innerHTML = bodyContent;
            
            console.log('HTML injected, loading script...');
            
            // Now load the script
            console.log('🔄 Loading script from:', `${WIDGET_BASE_URL}/widget-main.js`);
            await loadScript(`${WIDGET_BASE_URL}/widget-main.js`);
            
            console.log('✅ Script loaded, initializing widget...');
            
            // Manually trigger initialization
            if (typeof window.initializeWidget === 'function') {
                window.initializeWidget();
            }
            
        } catch (error) {
            console.error("Virtual Try-On Widget failed to load:", error);
            container.innerHTML = '<p style="color: red;">Widget failed to load</p>';
        }
    }
    
    // Start the initialization process
    initializeWidget();
})();


