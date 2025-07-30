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
    
    // Fetch and inject HTML
    fetch(`${WIDGET_BASE_URL}/index.html`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            console.log('HTML fetched successfully');
            
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
            
            // Remove script tags from body
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(script => script.remove());
            
            // Get the body content
            const bodyContent = doc.body.innerHTML;
            
            // Inject the HTML
            container.innerHTML = bodyContent;
            
            console.log('HTML injected, loading script...');
            
            // Now load the script
            return loadScript(`${WIDGET_BASE_URL}/widget-main.js`);
        })
        .then(() => {
            console.log('Script loaded, initializing widget...');
            
            // Manually trigger initialization
            if (typeof window.initializeWidget === 'function') {
                window.initializeWidget();
            }
        })
        .catch(error => {
            console.error("Virtual Try-On Widget failed to load:", error);
            container.innerHTML = '<p style="color: red;">Widget failed to load</p>';
        });
})();
