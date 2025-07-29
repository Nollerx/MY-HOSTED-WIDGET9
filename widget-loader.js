(function () {
    const widgetURL = "https://nollerx.github.io/MY-HOSTED-WIDGET9/";
    
    // Get store configuration from script tag
    const currentScript = document.currentScript;
    const storeId = currentScript.dataset.storeId || 'default-store';
    const storeName = currentScript.dataset.storeName || 'default-name';
    
    // Set global variables before loading widget
    window.ELLO_STORE_ID = storeId;
    window.ELLO_STORE_NAME = storeName;
    
    // Create container
    const container = document.createElement('div');
    container.id = "virtual-tryon-widget-container";
    document.body.appendChild(container);
    
    // Fetch and inject HTML
    fetch(widgetURL)
        .then(response => response.text())
        .then(html => {
            container.innerHTML = html;
            
            // Execute any <script> tags inside your HTML
            const scripts = container.querySelectorAll("script");
            scripts.forEach(oldScript => {
                const newScript = document.createElement("script");
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                document.body.appendChild(newScript);
                oldScript.remove(); // Clean up
            });
        })
        .catch(error => {
            console.error("Virtual Try-On Widget failed to load:", error);
            container.innerHTML = '<p style="color: red;">Widget failed to load</p>';
        });
})();