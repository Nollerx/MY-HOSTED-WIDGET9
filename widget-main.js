console.log("Virtual Try-On Widget script is running");

// Make initializeWidget globally accessible
window.initializeWidget = function() {
    console.log("initializeWidget called");
    detectDevice();
    tryonChatHistory = [];  // Initialize as array instead of undefined
    generalChatHistory = []; // Initialize as array instead of undefined
    
    // Load clothing data from Shopify
    loadClothingData().then(() => {
        console.log('Initial clothing data load complete');
    }).catch(error => {
        console.error('Initial clothing data load failed:', error);
    });
    
    // Apply theme
    applyWidgetTheme();
    
    const widget = document.getElementById('virtualTryonWidget');
    if (widget) {
        widget.addEventListener('click', function(e) {
            if (this.classList.contains('widget-minimized') && !e.target.closest('.widget-toggle') && !e.target.closest('.btn')) {
                openWidget();
            }
        });
    } else {
        console.warn('virtualTryonWidget not found in DOM at initialization');
    }
    
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);
    preventZoom();
    
    if (isMobile) {
        document.addEventListener('touchstart', function() {}, { passive: true });
        const cameraControls = document.getElementById('cameraControls');
        if (cameraControls) {
            cameraControls.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            }, { passive: true });
        }
    }
}

// Keep the existing DOMContentLoaded for direct page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initializeWidget);
} else {
    // Don't auto-initialize here since the loader will call it
    console.log('Document already loaded, waiting for manual initialization');
}
// Configuration
const WEBHOOK_URL = 'https://ancesoftware.app.n8n.cloud/webhook/virtual-tryon-production';
        
// Mobile detection
let isMobile = false;
let isTablet = false
let isIOS = false;
let isAndroid = false;

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Supabase Configuration
const SUPABASE_URL = 'https://rwmvgwnebnsqcyhhurti.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bXZnd25lYm5zcWN5aGh1cnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDc1MTgsImV4cCI6MjA2Mzk4MzUxOH0.OYTXiUBDN5IBlFYDHN3MyCwFUkSb8sgUOewBeSY01NY';



// Widget Configuration
const WIDGET_CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    MAX_MESSAGE_LENGTH: 1000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
};

// Clothing Categories Configuration
const CLOTHING_CATEGORIES = {
    // Allowed categories (lowercase)
    allowed: [
        'clothing', 'apparel', 'dress', 'dresses', 'shirt', 'shirts', 
        'top', 'tops', 'blouse', 'blouses', 't-shirt', 't-shirts',
        'sweater', 'sweaters', 'jacket', 'jackets', 'coat', 'coats',
        'pants', 'trousers', 'jeans', 'shorts', 'skirt', 'skirts',
        'suit', 'suits', 'romper', 'rompers', 'jumpsuit', 'jumpsuits',
        'cardigan', 'cardigans', 'hoodie', 'hoodies', 'sweatshirt',
        'vest', 'vests', 'blazer', 'blazers', 'tank', 'tanks',
        'bodysuit', 'bodysuits', 'leggings', 'tights', 'kimono',
        'tunic', 'tunics', 'poncho', 'ponchos', 'cape', 'capes'
    ],
    // Explicitly excluded categories
    excluded: [
        'shoes', 'footwear', 'boots', 'sandals', 'sneakers', 'heels',
        'accessories', 'jewelry', 'jewellery', 'bags', 'purse', 'wallet',
        'hat', 'hats', 'cap', 'caps', 'sunglasses', 'glasses', 'watch',
        'belt', 'belts', 'scarf', 'scarves', 'gloves', 'socks',
        'underwear', 'lingerie', 'bra', 'panties', 'boxers', 'briefs'
    ]
};

// ============================================================================
// DATA STORAGE
// ============================================================================

// ADD THESE FUNCTIONS HERE (BEFORE loadClothingData):

// Check if a product is a clothing item
function isClothingItem(product) {
    // Convert to lowercase for comparison
    const productType = (product.category || '').toLowerCase();
    const productName = (product.name || '').toLowerCase();
    const productTags = (product.tags || []).map(tag => tag.toLowerCase());
    
    // Check if explicitly excluded
    for (const excluded of CLOTHING_CATEGORIES.excluded) {
        if (productType.includes(excluded) || 
            productName.includes(excluded) ||
            productTags.some(tag => tag.includes(excluded))) {
            console.log(`❌ Excluded: ${product.name} (matched: ${excluded})`);
            return false;
        }
    }
    
    // Check if in allowed categories
    for (const allowed of CLOTHING_CATEGORIES.allowed) {
        if (productType.includes(allowed) || 
            productName.includes(allowed) ||
            productTags.some(tag => tag.includes(allowed))) {
            return true;
        }
    }
    
    // Additional smart checks
    if (hasClothingSizeVariants(product)) {
        return true;
    }
    
    // If product type is empty or generic, check the name
    if (!productType || productType === 'product' || productType === '') {
        return isLikelyClothingByName(productName);
    }
    
    console.log(`⚠️ Uncertain item excluded: ${product.name} (type: ${productType})`);
    return false;
}

// Check if product has clothing-style size variants
function hasClothingSizeVariants(product) {
    // Check if product has typical clothing size options
    const clothingSizes = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 
                          'small', 'medium', 'large', 'x-large',
                          '0', '2', '4', '6', '8', '10', '12', '14', '16'];
    
    if (product.variants && product.variants.length > 1) {
        const sizes = product.variants
            .map(v => (v.size || v.title || '').toLowerCase())
            .filter(size => clothingSizes.includes(size));
        
        return sizes.length > 0;
    }
    
    return false;
}

// Check if product name suggests it's clothing
function isLikelyClothingByName(name) {
    // Check if the product name contains clothing-related terms
    const clothingTerms = ['wear', 'outfit', 'garment', 'attire', 'apparel'];
    return clothingTerms.some(term => name.includes(term));
}

// Dynamic clothing data from Supabase
let sampleClothing = [];

// Load clothing data from active_clothing_items view
// Load clothing data from active_clothing_items table
async function loadClothingData() {
    try {
        const storeName = window.ELLO_STORE_NAME || 'm8ir6h-8k';
        console.log('Loading products from Shopify store:', storeName);

        // First, let's check if we can access the Shopify store
        const testUrl = `https://${storeName}.myshopify.com/products.json?limit=1`;
        
        try {
            const testResponse = await fetch(testUrl, {
                method: 'GET',
                mode: 'cors', // Explicitly set CORS mode
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (!testResponse.ok) {
                throw new Error(`Shopify store not accessible: ${testResponse.status}`);
            }
        } catch (corsError) {
            console.warn('CORS issue detected, trying alternative method...');
            
            // Alternative: Try JSONP approach or use a proxy
            // For now, we'll use demo data
            throw new Error('CORS restriction on Shopify store');
        }

        // If test passed, load all products
        const response = await fetchWithRetry(`https://${storeName}.myshopify.com/products.json?limit=250`, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.products || !Array.isArray(data.products)) {
            throw new Error('Invalid data format received from Shopify');
        }

        console.log('✅ Shopify products loaded:', data.products.length);

        // Convert Shopify products to widget format
const allProducts = data.products
    .filter(product => product && product.handle && product.title)
    .map(product => {
        const firstVariant = product.variants?.[0] || {};
        const firstImage = product.images?.[0] || {};
        
        return {
            id: product.handle,
            name: product.title,
            price: parseFloat(firstVariant.price || 0),
            category: product.product_type?.toLowerCase() || 'clothing',
            tags: product.tags || [], // ADD THIS LINE
            color: getColorFromProduct(product),
            image_url: firstImage.src || '',
            product_url: `https://${storeName}.myshopify.com/products/${product.handle}`,
            shopify_product_id: product.id,
            variants: (product.variants || []).map(variant => ({
                id: variant.id,
                title: variant.title,
                price: parseFloat(variant.price || 0),
                available: variant.available || false,
                size: variant.option1,
                color: variant.option2,
                option3: variant.option3
            }))
        };
    });

// FILTER TO ONLY CLOTHING ITEMS
sampleClothing = allProducts.filter(product => isClothingItem(product));

console.log(`✅ Loaded ${allProducts.length} total products from Shopify`);
console.log(`✅ Filtered to ${sampleClothing.length} clothing items`);

        // Refresh UI if widget is open
        if (widgetOpen && currentMode === 'tryon') {
            await populateFeaturedAndQuickPicks();
        }

    } catch (error) {
        console.error('❌ Error loading from Shopify:', error);
        
        // Show user-friendly error message
        if (typeof showSuccessNotification === 'function') {
            showSuccessNotification('Connection Error', 'Unable to load products. Using demo data.', 5000);
        }

        // Use comprehensive demo data
        sampleClothing = [
            {
                id: 'demo-shirt-1',
                name: 'Classic White Shirt',
                price: 49.99,
                category: 'shirt',
                color: 'white',
                image_url: 'https://via.placeholder.com/300x400/ffffff/333333?text=White+Shirt',
                product_url: '#',
                variants: [{ id: '1', title: 'Small', price: 49.99, available: true, size: 'S' },
                          { id: '2', title: 'Medium', price: 49.99, available: true, size: 'M' },
                          { id: '3', title: 'Large', price: 49.99, available: true, size: 'L' }]
            },
            {
                id: 'demo-dress-1',
                name: 'Summer Floral Dress',
                price: 79.99,
                category: 'dress',
                color: 'multicolor',
                image_url: 'https://via.placeholder.com/300x400/ffcccc/333333?text=Floral+Dress',
                product_url: '#',
                variants: [{ id: '4', title: 'Small', price: 79.99, available: true, size: 'S' },
                          { id: '5', title: 'Medium', price: 79.99, available: true, size: 'M' }]
            },
            {
                id: 'demo-jacket-1',
                name: 'Denim Jacket',
                price: 89.99,
                category: 'jacket',
                color: 'blue',
                image_url: 'https://via.placeholder.com/300x400/4169e1/ffffff?text=Denim+Jacket',
                product_url: '#',
                variants: [{ id: '6', title: 'Medium', price: 89.99, available: true, size: 'M' },
                          { id: '7', title: 'Large', price: 89.99, available: true, size: 'L' }]
            }
        ];
        
        console.log('Using demo data with', sampleClothing.length, 'items');
    }
}

// Utility function for retry logic
async function fetchWithRetry(url, options, maxRetries = 3) {
for (let i = 0; i < maxRetries; i++) {
try {
    const response = await fetch(url, options);
    return response;
} catch (error) {
    if (i === maxRetries - 1) throw error;
    console.log(`Retry ${i + 1}/${maxRetries} for ${url}`);
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
}
}
}


// 🎯 ADD THIS NEW FUNCTION HERE:
function detectCurrentProduct() {
// Method 1: Check URL for product handle (most reliable)
const urlPath = window.location.pathname;
const productMatch = urlPath.match(/\/products\/([^\/\?]+)/);

if (productMatch) {
const productHandle = productMatch[1];
console.log('Detected product handle from URL:', productHandle);

// Find matching product in our loaded data
const product = sampleClothing.find(item => item.id === productHandle);
if (product) {
    console.log('✅ Found matching product:', product);
    return product;
}
}

// Method 2: Check Shopify analytics object
if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
const productId = window.ShopifyAnalytics.meta.product.id;
const product = sampleClothing.find(item => item.shopify_product_id === productId);
if (product) {
    console.log('✅ Found product via Shopify analytics:', product);
    return product;
}
}

// Method 3: Look for JSON-LD structured data
const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
for (let script of jsonLdScripts) {
try {
    const jsonData = JSON.parse(script.textContent);
    if (jsonData['@type'] === 'Product' && jsonData.url) {
        const urlHandle = jsonData.url.split('/').pop().split('?')[0];
        const product = sampleClothing.find(item => item.id === urlHandle);
        if (product) {
            console.log('✅ Found product via JSON-LD:', product);
            return product;
        }
    }
} catch (e) {
    // JSON parsing failed, continue
}
}

// Method 4: Check for product page elements and match by title
const productTitleSelectors = [
'.product-title',
'.product__title', 
'h1.product-single__title',
'.product-form__title',
'.product__heading',
'[data-product-title]'
];

for (let selector of productTitleSelectors) {
const titleElement = document.querySelector(selector);
if (titleElement) {
    const title = titleElement.textContent.trim();
    const product = sampleClothing.find(item => 
        item.name.toLowerCase() === title.toLowerCase() ||
        title.toLowerCase().includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(title.toLowerCase())
    );
    if (product) {
        console.log('✅ Found product via title match:', product);
        return product;
    }
}
}

console.log('❌ No current product detected');
return null;
}

// Helper function to extract color from product data
function getColorFromProduct(product) {
// Check product tags for colors
const colors = ['red', 'blue', 'green', 'black', 'white', 'pink', 'yellow', 'purple', 'orange', 'brown', 'gray', 'navy', 'beige'];

// Check tags first
if (product.tags) {
for (let tag of product.tags) {
    for (let color of colors) {
        if (tag.toLowerCase().includes(color)) {
            return color;
        }
    }
}
}
    
// Check product title
const title = product.title.toLowerCase();
for (let color of colors) {
if (title.includes(color)) {
    return color;
}
}

// Check variants for color options
if (product.variants && product.variants[0] && product.variants[0].option2) {
const option2 = product.variants[0].option2.toLowerCase();
for (let color of colors) {
    if (option2.includes(color)) {
        return color;
    }
}
}

// Default fallback
return 'multicolor';
}

// State
let widgetOpen = false;
let currentMode = 'tryon';
let selectedClothing = null;
let userPhoto = null;
let userPhotoFileId = null;
let sessionId = generateSessionId();
let filteredClothing = [...sampleClothing];
let userEmail = null;
let tryonChatHistory = [];
let generalChatHistory = [];
let currentTryOnId = null;
let currentFeaturedItem = null;

function detectDevice() {
    const userAgent = navigator.userAgent.toLowerCase();
    const viewport = window.innerWidth;
    
    const mobileUserAgents = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const ipadUserAgent = /ipad/i.test(userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    isMobile = (mobileUserAgents && !ipadUserAgent) && isTouchDevice && viewport <= 768;
    isTablet = (ipadUserAgent || (/android/i.test(userAgent) && viewport > 768)) && isTouchDevice;
    isIOS = /iphone|ipad|ipod/i.test(userAgent);
    isAndroid = /android/i.test(userAgent);
    
    if (isMobile) {
        document.body.classList.add('is-mobile');
    } else {
        document.body.classList.remove('is-mobile');
    }
    
    const cameraControls = document.getElementById('cameraControls');
    if (cameraControls) {
        if (isMobile) {
            cameraControls.classList.add('mobile');
            cameraControls.style.display = 'flex';
        } else {
            cameraControls.classList.remove('mobile');
            cameraControls.style.display = 'none';
        }
    }
}

function generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9);
}

function generateTryOnId() {
return 'tryon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function takePicture() {
    if (!isMobile) {
        alert('Camera is only available on mobile devices');
        return;
    }

    try {
        const cameraInput = document.getElementById('cameraInput');
        
        if (isIOS) {
            const newCameraInput = document.createElement('input');
            newCameraInput.type = 'file';
            newCameraInput.accept = 'image/*';
            newCameraInput.capture = 'environment';
            newCameraInput.style.display = 'none';
            newCameraInput.onchange = handlePhotoUpload;
            
            document.body.appendChild(newCameraInput);
            
            setTimeout(() => {
                newCameraInput.click();
                setTimeout(() => {
                    if (newCameraInput.parentNode) {
                        newCameraInput.parentNode.removeChild(newCameraInput);
                    }
                }, 1000);
            }, 100);
        } else {
            cameraInput.value = '';
            setTimeout(() => {
                cameraInput.click();
            }, 100);
        }
        
    } catch (error) {
        console.error('Error taking picture:', error);
        alert('Unable to access camera. Please try selecting from gallery instead.');
    }
}

function chooseFromGallery() {
    if (!isMobile) {
        handlePhotoUploadClick();
        return;
    }

    try {
        const photoInput = document.getElementById('photoInput');
        
        if (isIOS) {
            const newPhotoInput = document.createElement('input');
            newPhotoInput.type = 'file';
            newPhotoInput.accept = 'image/*';
            newPhotoInput.style.display = 'none';
            newPhotoInput.onchange = handlePhotoUpload;
            
            document.body.appendChild(newPhotoInput);
            
            setTimeout(() => {
                newPhotoInput.click();
                setTimeout(() => {
                    if (newPhotoInput.parentNode) {
                        newPhotoInput.parentNode.removeChild(newPhotoInput);
                    }
                }, 1000);
            }, 100);
        } else {
            photoInput.value = '';
            setTimeout(() => {
                photoInput.click();
            }, 100);
        }
        
    } catch (error) {
        console.error('Error choosing from gallery:', error);
        alert('Unable to access photo gallery. Please try again.');
    }
}

function handlePhotoUploadClick() {
    if (isMobile) {
        return;
    } else {
        const photoInput = document.getElementById('photoInput');
        if (photoInput) {
            photoInput.click();
        }
    }
}

function openWidget() {
    const widget = document.getElementById('virtualTryonWidget');
    
    widget.classList.remove('widget-minimized');
    widgetOpen = true;
    
    if (isMobile) {
        document.body.style.overflow = 'hidden';
    }
    
    loadChatHistory();
    if (currentMode === 'tryon') {
        populateFeaturedAndQuickPicks();
        // 🎯 ADD THESE LINES AT THE END OF YOUR EXISTING openWidget() FUNCTION:
setTimeout(() => {
    const currentProduct = detectCurrentProduct();
    if (currentProduct) {
        selectedClothing = currentProduct.id;
        const featuredContainer = document.getElementById('featuredItem');
        featuredContainer.classList.add('selected');
        updateTryOnButton();
        console.log('🎯 Auto-selected current product:', currentProduct.name);
    }
    
    // Update wardrobe button count
    updateWardrobeButton();
    
    // 🎯 Focus management - focus on first interactive element
    const firstFocusableElement = widget.querySelector('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (firstFocusableElement) {
        firstFocusableElement.focus();
    }
}, 100);
    }
}

/**
 * Closes the widget and resets all states
 * Handles cleanup of UI elements and user data
 */
function closeWidget() {
    const widget = document.getElementById('virtualTryonWidget');
    if (!widget) {
        console.error('Widget element not found');
        return;
    }
    
    widget.classList.add('widget-minimized');
    widgetOpen = false;
    currentMode = 'tryon';
    
    // Reset body overflow
    document.body.style.overflow = '';
    
    // Reset mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const firstModeBtn = document.querySelector('.mode-btn');
    if (firstModeBtn) firstModeBtn.classList.add('active');
    
    // Show try-on content, hide chat
    const tryonContent = document.getElementById('tryonContent');
    const inputArea = document.querySelector('.input-area');
    const chatContainer = document.getElementById('chatContainer');
    
    if (tryonContent) tryonContent.style.display = 'block';
    if (inputArea) inputArea.classList.remove('chat-mode');
    if (chatContainer) chatContainer.style.display = 'none';
    
    // Reset user data
    selectedClothing = null;
    userPhoto = null;
    userPhotoFileId = null;
    
    // Clear photo preview
    const preview = document.getElementById('photoPreview');
    if (preview) {
        preview.style.display = 'none';
    }
    
    // Reset upload area
    resetPhotoUploadArea();
    
    // Clear clothing selections
    document.querySelectorAll('.quick-pick-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    updateTryOnButton();
    
    // 🎯 Focus management - return focus to page when widget closes
    const widgetToggle = document.querySelector('.widget-toggle');
    if (widgetToggle) {
        widgetToggle.focus();
    }
}

/**
 * Resets the photo upload area to its initial state
 */
function resetPhotoUploadArea() {
    const uploadArea = document.querySelector('.photo-upload');
    if (!uploadArea) return;
    
    uploadArea.classList.remove('has-photo', 'uploading');
    
    const uploadIcon = uploadArea.querySelector('.upload-icon');
    const uploadText = uploadArea.querySelector('.upload-text:not(#changePhotoText)');
    const changeText = document.getElementById('changePhotoText');
    
    if (uploadIcon) uploadIcon.style.display = 'block';
    if (uploadText) uploadText.style.display = 'block';
    if (changeText) changeText.style.display = 'none';
}

function switchMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const tryonContent = document.getElementById('tryonContent');
    const inputArea = document.querySelector('.input-area');
    const chatContainer = document.getElementById('chatContainer');
    
    if (mode === 'tryon') {
        tryonContent.style.display = 'block';
        inputArea.classList.remove('chat-mode');
        chatContainer.style.display = 'none';
        populateFeaturedAndQuickPicks();
    } else {
        tryonContent.style.display = 'none';
        inputArea.classList.add('chat-mode');
        chatContainer.style.display = 'flex';
    }
    
    loadChatHistory();
}

// 🔄 REPLACE YOUR EXISTING populateFeaturedAndQuickPicks() FUNCTION WITH THIS:
async function populateFeaturedAndQuickPicks() {
if (sampleClothing.length === 0) {
await loadClothingData();
}

if (sampleClothing.length === 0) {
return; // No items available
}

// 🎯 TRY TO DETECT CURRENT PRODUCT PAGE
const currentProduct = detectCurrentProduct();
let featuredItem = null;
let quickPicksPool = [...sampleClothing];

if (currentProduct) {
// Use current product as featured item
featuredItem = currentProduct;
// Remove current product from quick picks pool
quickPicksPool = sampleClothing.filter(item => item.id !== currentProduct.id);
console.log('🎯 Using current product as featured:', featuredItem.name);
} else {
// Fallback to variety-based selection
const categories = ['dress', 'shirt', 'pants', 'jacket', 'shorts'];
const varietyItems = [];

categories.forEach(category => {
    const categoryItem = sampleClothing.find(item => item.category === category);
    if (categoryItem) {
        varietyItems.push(categoryItem);
    }
});

while (varietyItems.length < 7 && varietyItems.length < sampleClothing.length) {
    const remainingItems = sampleClothing.filter(item => !varietyItems.includes(item));
    if (remainingItems.length > 0) {
        varietyItems.push(remainingItems[0]);
    } else {
        break;
    }
}

featuredItem = varietyItems[0];
quickPicksPool = varietyItems.slice(1);
console.log('📦 Using variety-based featured item:', featuredItem.name);
}

// Populate featured item section
const featuredContainer = document.getElementById('featuredItem');
const badgeText = currentProduct ? 'Current Page' : 'Trending';

featuredContainer.innerHTML = `
<div class="featured-content">
    <img src="${featuredItem.image_url}" alt="${featuredItem.name}" class="featured-image">
    <div class="featured-info">
        <div class="featured-name">${featuredItem.name}</div>
        <div class="featured-price">$${featuredItem.price.toFixed(2)}</div>
        <div class="featured-badge">${badgeText}</div>
    </div>
</div>
`;

// Populate quick picks (up to 6 items)
const quickPicks = quickPicksPool.slice(0, 6);
const quickPicksGrid = document.getElementById('quickPicksGrid');

let quickPicksHTML = '';
quickPicks.forEach(item => {
quickPicksHTML += `
    <div class="quick-pick-item" onclick="selectClothing('${item.id}')">
        <img src="${item.image_url}" alt="${item.name}" class="quick-pick-image">
        <div class="quick-pick-name">${item.name}</div>
        <div class="quick-pick-price">$${item.price.toFixed(2)}</div>
    </div>
`;
});

quickPicksGrid.innerHTML = quickPicksHTML;
currentFeaturedItem = featuredItem;
}

function selectFeaturedClothing() {
    if (!currentFeaturedItem) return;
    selectedClothing = currentFeaturedItem.id;
    // Clear other selections
    document.querySelectorAll('.quick-pick-item').forEach(item => {
        item.classList.remove('selected');
    });
    // Highlight featured item
    const featuredContainer = document.getElementById('featuredItem');
    featuredContainer.classList.add('selected');
    updateTryOnButton();
}

function selectClothing(clothingId) {
    selectedClothing = clothingId;
    
    // Clear featured selection
    const featuredContainer = document.getElementById('featuredItem');
    featuredContainer.classList.remove('selected');
    
    // Clear other quick pick selections
    document.querySelectorAll('.quick-pick-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Highlight selected item
    event.target.closest('.quick-pick-item').classList.add('selected');
    
    updateTryOnButton();
}

function resetSelection() {
    selectedClothing = null;
    userPhoto = null;
    userPhotoFileId = null;
    
    // Clear all selections
    document.querySelectorAll('.featured-item, .quick-pick-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Reset photo preview
    const preview = document.getElementById('photoPreview');
    const uploadArea = document.querySelector('.photo-upload');
    const changeText = document.getElementById('changePhotoText');
    const uploadIcon = uploadArea.querySelector('.upload-icon');
    const uploadText = uploadArea.querySelector('.upload-text:not(#changePhotoText)');
    
    preview.style.display = 'none';
    uploadArea.classList.remove('has-photo');
    changeText.style.display = 'none';
    
    // Show the upload elements again
    uploadIcon.style.display = 'block';
    uploadText.style.display = 'block';
    
    // Hide result section
    const resultSection = document.getElementById('resultSection');
    resultSection.style.display = 'none';
    
    updateTryOnButton();
}

function updateTryOnButton() {
    const btn = document.getElementById('tryOnBtn');
    btn.disabled = !(userPhoto && selectedClothing);
}

function loadChatHistory() {
    const container = document.getElementById('chatContainer');
    const history = currentMode === 'tryon' ? tryonChatHistory : generalChatHistory;
    
    if (currentMode !== 'chat') {
        return;
    }
    
    container.innerHTML = '';
    history.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.type}-message`;
        messageEl.textContent = msg.content;
        container.appendChild(messageEl);
    });
    
    container.scrollTop = container.scrollHeight;
    
    if (history.length === 0 && currentMode === 'chat') {
        addBotMessage("Hi! I'm your personal fashion assistant. Ask me anything about style, trends, or fashion advice! ✨");
    }
}

function addMessage(content, type) {
    const container = document.getElementById('chatContainer');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}-message`;
    messageEl.textContent = content;
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
    
    const history = currentMode === 'tryon' ? tryonChatHistory : generalChatHistory;
    history.push({ content, type });
}

function addUserMessage(content) {
    addMessage(content, 'user');
}

function addBotMessage(content) {
    addMessage(content, 'bot');
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) {
        console.error('Message input element not found');
        return;
    }
    
    const message = input.value.trim();
    
    // Input validation
    if (!message) {
        console.log('Empty message, ignoring send request');
        return;
    }
    
    if (message.length > 1000) {
        showSuccessNotification('Message Too Long', 'Please keep messages under 1000 characters.', 3000);
        return;
    }
    
    // Add user message and clear input
    addUserMessage(message);
    input.value = '';
    
    // Disable input during processing
    input.disabled = true;
    const sendButton = document.querySelector('.send-button');
    if (sendButton) sendButton.disabled = true;
    
    try {
        if (currentMode === 'chat') {
            await handleChatMessage(message);
        } else {
            // Simulate processing delay for try-on mode
            setTimeout(() => {
                handleTryOnMessage(message);
                enableMessageInput();
            }, 1000);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        addBotMessage("Sorry, I'm having trouble processing your message. Please try again.");
        enableMessageInput();
    }
}

async function handleChatMessage(message) {
    try {
        const webhookData = {
            mode: 'chat',
            sessionId: sessionId,
            userEmail: userEmail,
            message: message,
            deviceInfo: {
                isMobile: isMobile,
                isTablet: isTablet,
                isIOS: isIOS,
                isAndroid: isAndroid,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            },
            timestamp: new Date().toISOString()
        };
        
        // Use retry logic for API calls
        const response = await fetchWithRetry(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Extract bot response with multiple fallback patterns
        const botResponse = extractBotResponse(result);
        
        if (botResponse) {
            addBotMessage(botResponse);
        } else {
            console.warn('No valid response format found:', result);
            handleGeneralMessage(message);
        }
        
    } catch (error) {
        console.error('Chat webhook error:', error);
        addBotMessage("I'm having trouble connecting right now. Please try again in a moment.");
        handleGeneralMessage(message);
    } finally {
        enableMessageInput();
    }
}

function extractBotResponse(result) {
    // Try multiple response patterns
    const patterns = [
        result?.[0]?.output?.response,
        result?.output?.response,
        result?.response,
        result?.reply,
        result?.message,
        result?.text
    ];
    
    for (const response of patterns) {
        if (response && typeof response === 'string' && response.trim()) {
            return response.trim();
        }
    }
    
    return null;
}

function enableMessageInput() {
    const input = document.getElementById('messageInput');
    const sendButton = document.querySelector('.send-button');
    
    if (input) input.disabled = false;
    if (sendButton) sendButton.disabled = false;
}

function handleTryOnMessage(message) {
    if (message.toLowerCase().includes('photo') || message.toLowerCase().includes('picture')) {
        if (isMobile) {
            addBotMessage("Please use the camera buttons to take a picture or select from your gallery! 📸");
        } else {
            addBotMessage("Please use the photo upload area to add your picture! 📸");
        }
    } else if (message.toLowerCase().includes('clothes') || message.toLowerCase().includes('outfit')) {
        addBotMessage("Great! Check out our featured item or quick picks, or browse our full collection! 👗");
    } else {
        addBotMessage("I'm here to help you try on clothes virtually! Upload a photo and pick an item to get started. ✨");
    }
}

function handleGeneralMessage(message) {
    const responses = [
        "That's a great question about fashion! Trends are always evolving. 💫",
        "I love helping with style choices! What's your favorite color to wear? 🎨",
        "Fashion is all about expressing yourself! What look are you going for? ✨",
        "Style tip: Confidence is your best accessory! 💪"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    addBotMessage(randomResponse);
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    // Enhanced file validation
    const validationResult = validateImageFile(file);
    if (!validationResult.isValid) {
        showSuccessNotification('Invalid File', validationResult.error, 4000, true);
        return;
    }
    
    // Show loading state
    const uploadArea = document.querySelector('.photo-upload');
    if (uploadArea) {
        uploadArea.classList.add('uploading');
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            userPhoto = e.target.result;
            userPhotoFileId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            updatePhotoPreview(e.target.result);
            updateTryOnButton();
            
            // Haptic feedback on mobile
            if (isMobile && navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            showSuccessNotification('Photo Uploaded', 'Your photo has been uploaded successfully!', 2000);
            
        } catch (error) {
            console.error('Error processing uploaded image:', error);
            showSuccessNotification('Upload Error', 'Failed to process the image. Please try again.', 4000);
        } finally {
            if (uploadArea) {
                uploadArea.classList.remove('uploading');
            }
        }
    };
    
    reader.onerror = function(error) {
        console.error('Error reading file:', error);
        showSuccessNotification('File Error', 'Error reading the image file. Please try again.', 4000);
        if (uploadArea) {
            uploadArea.classList.remove('uploading');
        }
    };
    
    reader.readAsDataURL(file);
}

function validateImageFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    
    if (!file) {
        return { isValid: false, error: 'No file selected.' };
    }
    
    if (!allowedTypes.includes(file.type)) {
        return { 
            isValid: false, 
            error: 'Please select a valid image file (JPEG, PNG, WebP, or GIF).' 
        };
    }
    
    if (file.size > maxSize) {
        return { 
            isValid: false, 
            error: 'Image file is too large. Please choose a file smaller than 10MB.' 
        };
    }
    
    return { isValid: true };
}

function updatePhotoPreview(imageData) {
    const preview = document.getElementById('photoPreview');
    const uploadArea = document.querySelector('.photo-upload');
    const changeText = document.getElementById('changePhotoText');
    const uploadIcon = uploadArea?.querySelector('.upload-icon');
    const uploadText = uploadArea?.querySelector('.upload-text:not(#changePhotoText)');
    
    if (preview) {
        preview.src = imageData;
        preview.style.display = 'block';
    }
    
    if (uploadArea) {
        // Hide the upload elements
        if (uploadIcon) uploadIcon.style.display = 'none';
        if (uploadText) uploadText.style.display = 'none';
        
        uploadArea.classList.add('has-photo');
        uploadArea.style.display = 'block';
    }
    
    if (changeText) {
        changeText.style.display = 'block';
        changeText.textContent = isMobile ? 'Tap to change photo' : 'Click to change photo';
    }
}

function openClothingBrowser() {
    const modal = document.getElementById('clothingBrowserModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    modal.classList.add('active');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    console.log('Opening clothing browser, sampleClothing length:', sampleClothing.length);
    renderBrowserGrid();
}

function closeClothingBrowser() {
    const modal = document.getElementById('clothingBrowserModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    modal.classList.remove('active');
    backdrop.classList.remove('active');
    
    if (!widgetOpen || !isMobile) {
        document.body.style.overflow = '';
    }
}

function renderBrowserGrid() {
    const grid = document.getElementById('browserGrid');
    
    console.log('renderBrowserGrid called, sampleClothing length:', sampleClothing.length);
    console.log('Grid element found:', !!grid);
    
    if (!grid) {
        console.error('Browser grid element not found!');
        return;
    }
    
    // Check if clothing data is loaded
    if (!sampleClothing || sampleClothing.length === 0) {
        console.log('No clothing data available, loading...');
        grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading products...</div>';
        loadClothingData().then(() => {
            console.log('Data loaded, re-rendering grid...');
            renderBrowserGrid();
        });
        return;
    }
    
    console.log('Rendering grid with', sampleClothing.length, 'items');
    let gridHTML = '';
    sampleClothing.forEach((item, index) => {
        const isSelected = selectedClothing === item.id;
        const selectedClass = isSelected ? 'selected' : '';
        
        console.log(`Item ${index}:`, item.name, 'Image:', item.image_url);
        
        gridHTML += `
            <div class="browser-clothing-card ${selectedClass}" onclick="selectClothingFromBrowser('${item.id}')">
                <img src="${item.image_url}" alt="${item.name}" loading="lazy">
                <div class="browser-card-name">${item.name}</div>
            </div>
        `;
    });
    
    grid.innerHTML = gridHTML;
    console.log('Grid HTML set, length:', gridHTML.length);
    console.log('Grid display style:', grid.style.display);
}

function selectClothingFromBrowser(clothingId) {
    selectedClothing = clothingId;
    
    document.querySelectorAll('.browser-clothing-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    event.target.closest('.browser-clothing-card').classList.add('selected');
    
    closeClothingBrowser();
    populateFeaturedAndQuickPicks();
    updateTryOnButton();
}

function handleBrowserSearch() {
    const searchTerm = document.getElementById('browserSearch').value.toLowerCase().trim();
    
    if (searchTerm === '') {
        filteredClothing = [...sampleClothing];
    } else {
        filteredClothing = sampleClothing.filter(item => {
            const matchesName = item.name.toLowerCase().includes(searchTerm);
            const matchesCategory = item.category.toLowerCase().includes(searchTerm);
            const matchesColor = item.color.toLowerCase().includes(searchTerm);
            
            return matchesName || matchesCategory || matchesColor;
        });
    }
    
    updateBrowserDisplay();
}

function updateBrowserDisplay() {
    const grid = document.getElementById('browserGrid');
    const noResults = document.getElementById('noResultsMessage');
    const resultsCount = document.getElementById('searchResultsCount');
    
    grid.innerHTML = '';
    
    if (filteredClothing.length === 0) {
        grid.style.display = 'none';
        noResults.style.display = 'block';
        resultsCount.textContent = '';
    } else {
        grid.style.display = 'grid';
        noResults.style.display = 'none';
        resultsCount.textContent = `${filteredClothing.length} item${filteredClothing.length !== 1 ? 's' : ''} found`;
        
        filteredClothing.forEach(item => {
            const isSelected = selectedClothing === item.id;
            const selectedClass = isSelected ? 'selected' : '';
            
            const cardElement = document.createElement('div');
            cardElement.className = `browser-clothing-card ${selectedClass}`;
            cardElement.onclick = () => selectClothingFromBrowser(item.id);
            
            cardElement.innerHTML = `
                <img src="${item.image_url}" alt="${item.name}" loading="lazy">
                <div class="browser-card-name">${item.name}</div>
            `;
            
            grid.appendChild(cardElement);
        });
    }
}

// Fixed startTryOn function - always pass tryOnId as parameter
async function startTryOn() {
if (!userPhoto || !selectedClothing) {
alert("Please upload a photo and select clothing first!");
return;
}

// Generate unique try-on ID for this attempt
currentTryOnId = generateTryOnId();
console.log('Generated tryOnId:', currentTryOnId);

const resultSection = document.getElementById('resultSection');
resultSection.innerHTML = '<div class="loading"><div class="spinner"></div>Creating your virtual try-on...</div>';
resultSection.style.display = 'block';
    
try {
const clothing = sampleClothing.find(item => item.id === selectedClothing);

const webhookData = {
    mode: 'tryon',
    tryOnId: currentTryOnId,
    sessionId: sessionId,
    storeId: window.ELLO_STORE_ID || 'default_store',
    userEmail: userEmail,
    userPhoto: userPhoto,
    file_id: userPhotoFileId,
    selectedClothing: {
        id: clothing.id,
        name: clothing.name,
        price: clothing.price.toFixed(2),
        category: clothing.category,
        color: clothing.color,
        image_url: clothing.image_url
    },
    deviceInfo: {
        isMobile: isMobile,
        isTablet: isTablet,
        isIOS: isIOS,
        isAndroid: isAndroid,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        }
    },
    timestamp: new Date().toISOString()
};

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(webhookData),
    signal: controller.signal
});

if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
}

const result = await response.json();

if (result.success && result.result_image_url) {
    // SUCCESS CASE - Pass tryOnId as parameter
    resultSection.innerHTML = `
        <div class="result-container">
            <h4>Your Virtual Try-On Result</h4>
            <img src="${result.result_image_url}" alt="Try-on result" class="result-image" onclick="openImageModal('${result.result_image_url}')">
            <p>How do you like the ${clothing.name}?</p>
            <div class="buy-now-container">
                <button class="buy-now-btn" onclick="handleBuyNow('${clothing.id}', '${result.result_image_url}', '${currentTryOnId}')">
                    <div class="loading-spinner"></div>
                    <span class="btn-text">
                        <span class="cart-icon">🛒</span>
                        Buy Now - $${clothing.price.toFixed(2)}
                    </span>
                </button>
            </div>
        </div>
    `;
    
    // Auto-save to wardrobe
    autoSaveToWardrobe(clothing, result.result_image_url, currentTryOnId);
} else {
    // FALLBACK CASE - Pass tryOnId as parameter
    const placeholderUrl = 'https://via.placeholder.com/300x400?text=Try-On+Result';
    resultSection.innerHTML = `
        <div class="result-container">
            <h4>Your Virtual Try-On Result</h4>
            <img src="${placeholderUrl}" alt="Try-on result" class="result-image" onclick="openImageModal('${placeholderUrl}')">
            <p>How do you like the ${clothing.name}?</p>
            <div class="buy-now-container">
                <button class="buy-now-btn" onclick="handleBuyNow('${clothing.id}', '${placeholderUrl}', '${currentTryOnId}')">
                    <div class="loading-spinner"></div>
                    <span class="btn-text">
                        <span class="cart-icon">🛒</span>
                        Buy Now - $${clothing.price.toFixed(2)}
                    </span>
                </button>
            </div>
            <small style="color: #64748b;">Processing completed - result may take a moment to generate</small>
        </div>
    `;
}

} catch (error) {
console.error('Webhook error:', error);

// ERROR CASE - Pass tryOnId as parameter
const clothing = sampleClothing.find(item => item.id === selectedClothing);
const placeholderUrl = 'https://via.placeholder.com/300x400?text=Try-On+Result';
resultSection.innerHTML = `
    <div class="result-container">
        <h4>Virtual Try-On Result</h4>
        <img src="${placeholderUrl}" alt="Try-on result" class="result-image" onclick="openImageModal('${placeholderUrl}')">
        <p>How do you like the ${clothing.name}?</p>
        <div class="buy-now-container">
            <button class="buy-now-btn" onclick="handleBuyNow('${clothing.id}', '${placeholderUrl}', '${currentTryOnId}')">
                <div class="loading-spinner"></div>
                <span class="btn-text">
                    <span class="cart-icon">🛒</span>
                    Buy Now - $${clothing.price.toFixed(2)}
                </span>
            </button>
        </div>
        <small style="color: #e74c3c;">Network issue - showing demo result</small>
    </div>
`;
}
}

// Improved Size Selector Function
function showSizeSelector(clothing) {
return new Promise((resolve) => {
console.log('showSizeSelector called with:', clothing);

// Get unique sizes from variants - try multiple methods
const availableSizes = [];

clothing.variants.forEach(variant => {
    console.log('Processing variant:', variant);
    
    let sizeValue = null;
    
    // Method 1: Check option1 (usually size)
    if (variant.option1 && variant.option1 !== 'Default Title') {
        sizeValue = variant.option1;
    }
    // Method 2: Check size field
    else if (variant.size && variant.size !== 'Default Title') {
        sizeValue = variant.size;
    }
    // Method 3: Check variant title
    else if (variant.title && variant.title !== 'Default Title') {
        sizeValue = variant.title;
    }
    // Method 4: Extract size from title if it contains known sizes
    else if (variant.title) {
        const knownSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
        const foundSize = knownSizes.find(size => 
            variant.title.toUpperCase().includes(size)
        );
        if (foundSize) {
            sizeValue = foundSize;
        }
    }
    
    console.log('Extracted size value:', sizeValue);
    
    if (sizeValue && variant.available && !availableSizes.some(s => s.size === sizeValue)) {
        availableSizes.push({
            size: sizeValue,
            variantId: variant.id,
            price: variant.price
        });
    }
});

console.log('Available sizes found:', availableSizes);

// If no sizes found, just use first available variant
if (availableSizes.length === 0) {
    console.log('No sizes detected, using first available variant');
    const firstAvailable = clothing.variants.find(v => v.available) || clothing.variants[0];
    if (firstAvailable) {
        resolve(firstAvailable.id);
        return;
    }
}

// If only one size, use it directly
if (availableSizes.length === 1) {
    console.log('Only one size available, using directly');
    resolve(availableSizes[0].variantId);
    return;
}

// Create popup HTML (rest of your existing popup code...)
const popup = document.createElement('div');
popup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.6);
    z-index: 30000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
`;

popup.innerHTML = `
    <div style="
        background: white;
        padding: 24px;
        border-radius: 8px;
        max-width: 350px;
        width: 90%;
        box-shadow: 0 25px 80px rgba(0,0,0,0.2);
        border: 1px solid #e0e0e0;
    ">
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="
                margin: 0 0 8px 0;
                font-size: 18px;
                font-weight: 700;
                color: #333;
                text-transform: uppercase;
                letter-spacing: 1px;
            ">Select Size</h3>
            <p style="
                margin: 0;
                color: #666;
                font-size: 14px;
            ">${clothing.name}</p>
        </div>
        
        <div class="size-grid" style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 20px;
        ">
            ${availableSizes.map(sizeOption => `
                <button class="size-btn" data-variant-id="${sizeOption.variantId}" style="
                    padding: 12px 8px;
                    border: 1px solid #e0e0e0;
                    background: #f8f8f8;
                    cursor: pointer;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 14px;
                    color: #333;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                ">
                    ${sizeOption.size}
                </button>
            `).join('')}
        </div>
        
        <div style="display: flex; gap: 12px;">
            <button id="cancelSize" style="
                flex: 1;
                padding: 12px;
                background: #f0f0f0;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-size: 13px;
            ">Cancel</button>
            <button id="confirmSize" style="
                flex: 1;
                padding: 12px;
                background: #333;
                color: white;
                border: 1px solid #333;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-size: 13px;
                opacity: 0.5;
            " disabled>Add to Cart</button>
        </div>
    </div>
`;

document.body.appendChild(popup);

let selectedVariantId = null;

// Handle size selection
popup.querySelectorAll('.size-btn').forEach(btn => {
    btn.onclick = () => {
        // Reset all buttons
        popup.querySelectorAll('.size-btn').forEach(b => {
            b.style.background = '#f8f8f8';
            b.style.color = '#333';
            b.style.borderColor = '#e0e0e0';
        });
        
        // Highlight selected button
        btn.style.background = '#333';
        btn.style.color = 'white';
        btn.style.borderColor = '#333';
        
        selectedVariantId = btn.dataset.variantId;
        
        // Enable confirm button
        const confirmBtn = popup.querySelector('#confirmSize');
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    };
});

// Handle confirm
popup.querySelector('#confirmSize').onclick = () => {
    document.body.removeChild(popup);
    resolve(selectedVariantId);
};

// Handle cancel
popup.querySelector('#cancelSize').onclick = () => {
    document.body.removeChild(popup);
    resolve(null);
};

// Handle backdrop click
popup.onclick = (e) => {
    if (e.target === popup) {
        document.body.removeChild(popup);
        resolve(null);
    }
};
});
}

// Custom Notification Function
function showSuccessNotification(title, subtitle, duration = 4000, isError = false) {
// Remove any existing notification
const existing = document.querySelector('.custom-notification');
if (existing) {
existing.remove();
}

// Create notification element
const notification = document.createElement('div');
notification.className = 'custom-notification' + (isError ? ' error' : '');

notification.innerHTML = `
<div class="notification-icon">
    ${isError ? '✗' : '✓'}
</div>
<div class="notification-content">
    <div class="notification-title">${title}</div>
    <div class="notification-subtitle">${subtitle}</div>
</div>
<button class="notification-close" onclick="hideNotification(this.parentElement)">
    ×
</button>
<div class="notification-progress"></div>
`;

document.body.appendChild(notification);

// Trigger show animation
setTimeout(() => {
notification.classList.add('show');
}, 10);

// Auto-hide after duration
setTimeout(() => {
hideNotification(notification);
}, duration);
}

function hideNotification(notification) {
if (!notification) return;

notification.classList.add('hide');
notification.classList.remove('show');

setTimeout(() => {
if (notification.parentElement) {
    notification.parentElement.removeChild(notification);
}
}, 400);
}

// Function to update cart display after adding items
async function updateCartDisplay() {
try {
// Fetch the latest cart data
const cartResponse = await fetch('/cart.js');
const cartData = await cartResponse.json();

console.log('Updated cart data:', cartData);

// Update cart counter (try multiple common selectors)
const cartCounters = [
    '.cart-count',
    '.cart-counter', 
    '.cart-item-count',
    '[data-cart-count]',
    '.header__cart-count',
    '.cart-link__bubble',
    '.cart__count',
    '#cart-count',
    '.cart-count-bubble'
];

cartCounters.forEach(selector => {
    const counter = document.querySelector(selector);
    if (counter) {
        counter.textContent = cartData.item_count;
        counter.innerHTML = cartData.item_count;
        // Also try setting attributes
        counter.setAttribute('data-count', cartData.item_count);
    }
});

// Trigger cart update events that themes might listen for
const cartUpdateEvents = [
    'cart:updated',
    'cart:refresh', 
    'cart:change',
    'cartUpdated',
    'ajaxCart:updated'
];

cartUpdateEvents.forEach(eventName => {
    document.dispatchEvent(new CustomEvent(eventName, {
        detail: { cart: cartData }
    }));
    
    // Also try on window
    window.dispatchEvent(new CustomEvent(eventName, {
        detail: { cart: cartData }
    }));
});

// If there's a global cart object, update it
if (window.cart) {
    window.cart = cartData;
}
if (window.theme && window.theme.cart) {
    window.theme.cart = cartData;
}

// Force update any cart drawers/popups
const cartDrawers = [
    '.cart-drawer',
    '.mini-cart',
    '.cart-popup',
    '[data-cart-drawer]'
];

cartDrawers.forEach(selector => {
    const drawer = document.querySelector(selector);
    if (drawer && drawer.classList.contains('active')) {
        // If cart drawer is open, you might want to refresh it
        // This depends on your theme's implementation
    }
});

console.log('✅ Cart display updated successfully');

} catch (error) {
console.error('❌ Error updating cart display:', error);
// Don't throw error - the item was still added successfully
}
}

async function handleBuyNow(clothingId, tryonResultUrl, tryOnId) {
const buyBtn = event.target.closest('.buy-now-btn');
const clothing = sampleClothing.find(item => item.id === clothingId);

console.log('handleBuyNow called for:', clothing);

if (!clothing) {
alert('Item not found. Please try again.');
return;
}

if (!clothing.variants || clothing.variants.length === 0) {
alert('Product variants not found');
return;
}

buyBtn.classList.add('loading');
buyBtn.disabled = true;

try {
let variantToAdd = null;

// Size selection logic
if (clothing.variants.length === 1) {
    variantToAdd = clothing.variants[0];
} else {
    buyBtn.classList.remove('loading');
    buyBtn.disabled = false;
    
    const selectedVariantId = await showSizeSelector(clothing);
    if (!selectedVariantId) return;
    
    variantToAdd = clothing.variants.find(v => v.id == selectedVariantId);
    if (!variantToAdd) {
        alert('Selected size not found. Please try again.');
        return;
    }
    
    buyBtn.classList.add('loading');
    buyBtn.disabled = true;
}

// 1. ADD TO SHOPIFY CART (Real functionality)
const cartResponse = await fetch('/cart/add.js', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        id: variantToAdd.id,
        quantity: 1
    })
});

if (cartResponse.ok) {
    const cartResult = await cartResponse.json();
    console.log('✅ Successfully added to cart:', cartResult);
    
    // Show success notification
    const sizeText = variantToAdd.size || variantToAdd.title || '';
    const sizeDisplay = sizeText ? `Size ${sizeText}` : '';
    showSuccessNotification(
        'Added to Cart!',
        `${clothing.name} ${sizeDisplay ? `• ${sizeDisplay}` : ''}`
    );
    
    // Update cart display
    await updateCartDisplay();
    
    // 2. SEND WEBHOOK FOR ANALYTICS TRACKING
    try {
        const conversionData = {
            mode: 'conversion',
            tryOnId: tryOnId,
            sessionId: sessionId,
            storeId: window.ELLO_STORE_ID || 'default_store',
            conversionType: 'add_to_cart',
            revenueAmount: variantToAdd.price,
            selectedClothing: {
                id: clothing.id,
                name: clothing.name,
                price: variantToAdd.price.toFixed(2),
                category: clothing.category,
                color: clothing.color,
                image_url: clothing.image_url,
                variant_id: variantToAdd.id,
                size: variantToAdd.size || variantToAdd.title
            },
            tryonResultUrl: tryonResultUrl,
            shopifyCartResult: cartResult,
            deviceInfo: {
                isMobile: isMobile,
                isTablet: isTablet,
                isIOS: isIOS,
                isAndroid: isAndroid,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            },
            timestamp: new Date().toISOString()
        };
        
        // Send analytics webhook (don't block on this)
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(conversionData)
        }).then(response => {
            if (response.ok) {
                console.log('✅ Analytics tracked successfully');
            } else {
                console.log('⚠️ Analytics tracking failed, but cart add succeeded');
            }
        }).catch(error => {
            console.log('⚠️ Analytics tracking error:', error);
        });
        
    } catch (webhookError) {
        console.log('⚠️ Webhook tracking failed:', webhookError);
    }
    
} else {
    const errorText = await cartResponse.text();
    console.error('❌ Shopify cart error:', errorText);
    alert(`❌ Failed to add to cart. Error: ${cartResponse.status}`);
}

} catch (error) {
console.error('❌ Network error:', error);
alert('❌ Network error: ' + error.message);
} finally {
buyBtn.classList.remove('loading');
buyBtn.disabled = false;
}
}

function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageSrc;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageModal(event) {
    if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) {
        return;
    }
    
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
    modal.classList.remove('wardrobe-view');
    
    // Clean up wardrobe modal info
    const modalContent = modal.querySelector('.modal-content');
    const wardrobeInfo = modalContent.querySelector('.wardrobe-modal-info');
    if (wardrobeInfo) {
        wardrobeInfo.remove();
    }
    
    if (!widgetOpen || !isMobile) {
        document.body.style.overflow = '';
    } else if (isMobile && widgetOpen) {
        document.body.style.overflow = 'hidden';
    }
}

function handleOrientationChange() {
    if (isMobile) {
        setTimeout(() => {
            detectDevice();
            
            if (widgetOpen) {
                const widget = document.getElementById('virtualTryonWidget');
                widget.style.display = 'none';
                widget.offsetHeight;
                widget.style.display = 'flex';
            }
        }, 100);
    }
}

function preventZoom() {
    if (isMobile) {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function (event) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }
}

/**
 * Enhanced keyboard navigation
 * - Enter key: Triggers Try On button when widget is open
 * - Escape key: Closes widget, modals, and browsers
 */
document.addEventListener('keydown', function(event) {
    // Escape key - close widget, modals, and browsers
    if (event.key === 'Escape') {
        // Close image modal if open
        const imageModal = document.getElementById('imageModal');
        if (imageModal && imageModal.classList.contains('active')) {
            closeImageModal(event);
            return;
        }
        
        // Close wardrobe modal if open
        const wardrobeModal = document.getElementById('wardrobeModal');
        if (wardrobeModal && wardrobeModal.classList.contains('active')) {
            closeWardrobe();
            return;
        }
        
        // Close clothing browser if open
        const clothingBrowser = document.getElementById('clothingBrowserModal');
        if (clothingBrowser && clothingBrowser.classList.contains('active')) {
            closeClothingBrowser();
            return;
        }
        
        // Close main widget if open
        if (widgetOpen) {
            closeWidget();
            return;
        }
    }
    
    // Enter key - trigger Try On button when widget is open (but not when typing in message input)
    if (event.key === 'Enter' && widgetOpen) {
        const activeElement = document.activeElement;
        const messageInput = document.getElementById('messageInput');
        const tryOnBtn = document.getElementById('tryOnBtn');
        
        // Don't trigger Try On if user is typing in message input
        if (activeElement === messageInput) {
            return; // Let the message input handle Enter key
        }
        // Only trigger if Try On button is enabled
        if (tryOnBtn && !tryOnBtn.disabled) {
            event.preventDefault();
            startTryOn();
        } else {
            // Prevent Enter from doing anything else if Try On is disabled
            event.preventDefault();
            return;
        }
    }
});

if (isMobile) {
    window.addEventListener('popstate', function(event) {
        if (widgetOpen) {
            closeWidget();
            event.preventDefault();
        }
    });
}

// THEME: Fetch and apply theme from Supabase
async function applyWidgetTheme() {
    const storeId = window.ELLO_STORE_ID || 'default_store';
    const widget = document.getElementById('virtualTryonWidget');
    let theme = 'white'; // default
    try {
        const url = `https://rwmvgwnebnsqcyhhurti.supabase.co/rest/v1/business_settings?store_id=eq.${storeId}`;
        const resp = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
            }
        });
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0 && data[0].widget_theme) {
                theme = data[0].widget_theme;
            }
        }
    } catch (e) {
        console.warn('Theme fetch failed, using default.');
    }
    // Remove any previous theme class
    widget.classList.remove('theme-white', 'theme-cream', 'theme-black');
    // Add the new theme class
    widget.classList.add(`theme-${theme}`);
}

// ============================================================================
// WARDROBE FUNCTIONALITY
// ============================================================================

// Wardrobe storage key
const WARDROBE_STORAGE_KEY = 'virtual_tryon_wardrobe';

// Get wardrobe count for display
function getWardrobeCount() {
    const wardrobe = getWardrobe();
    return wardrobe.length;
}

// Get wardrobe from sessionStorage
function getWardrobe() {
    try {
        const stored = sessionStorage.getItem(WARDROBE_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error reading wardrobe from sessionStorage:', error);
        return [];
    }
}

// Save wardrobe to sessionStorage
function saveWardrobe(wardrobe) {
    try {
        sessionStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify(wardrobe));
    } catch (error) {
        console.error('Error saving wardrobe to sessionStorage:', error);
    }
}

// Add item to wardrobe
function addToWardrobe(clothing, resultImageUrl, tryOnId) {
    const wardrobe = getWardrobe();
    
    // Check if item already exists (by clothing ID)
    const existingIndex = wardrobe.findIndex(item => item.clothingId === clothing.id);
    
    const wardrobeItem = {
        id: tryOnId,
        clothingId: clothing.id,
        clothingName: clothing.name,
        clothingPrice: clothing.price,
        clothingCategory: clothing.category,
        clothingColor: clothing.color,
        clothingImageUrl: clothing.image_url,
        resultImageUrl: resultImageUrl,
        originalPhotoUrl: userPhoto, // Store the original user photo
        timestamp: new Date().toISOString(),
        sessionId: sessionId
    };
    
    if (existingIndex !== -1) {
        // Update existing item
        wardrobe[existingIndex] = wardrobeItem;
    } else {
        // Add new item
        wardrobe.push(wardrobeItem);
    }
    
    saveWardrobe(wardrobe);
    updateWardrobeButton();
    
    console.log('✅ Added to wardrobe:', clothing.name);
}

// Add original photo to wardrobe (for outfit building)
function addOriginalPhotoToWardrobe() {
    if (!userPhoto) return;
    
    const wardrobe = getWardrobe();
    const originalPhotoId = 'original_photo_' + Date.now();
    
    // Check if original photo already exists
    const existingOriginal = wardrobe.find(item => item.id.startsWith('original_photo_'));
    
    if (!existingOriginal) {
        const originalPhotoItem = {
            id: originalPhotoId,
            clothingId: 'original_photo',
            clothingName: 'Your Photo',
            clothingPrice: 0,
            clothingCategory: 'photo',
            clothingColor: 'original',
            clothingImageUrl: userPhoto,
            resultImageUrl: userPhoto,
            originalPhotoUrl: userPhoto,
            timestamp: new Date().toISOString(),
            sessionId: sessionId,
            isOriginalPhoto: true
        };
        
        wardrobe.push(originalPhotoItem);
        saveWardrobe(wardrobe);
        updateWardrobeButton();
        
        console.log('✅ Added original photo to wardrobe');
    }
}

// Remove item from wardrobe
function removeFromWardrobe(tryOnId) {
    const wardrobe = getWardrobe();
    const filteredWardrobe = wardrobe.filter(item => item.id !== tryOnId);
    saveWardrobe(filteredWardrobe);
    updateWardrobeButton();
    
    console.log('🗑️ Removed from wardrobe:', tryOnId);
}

// Update wardrobe button count
function updateWardrobeButton() {
    const wardrobeBtn = document.querySelector('.wardrobe-btn');
    if (wardrobeBtn) {
        const count = getWardrobeCount();
        const countSpan = wardrobeBtn.querySelector('span:last-child');
        if (countSpan) {
            countSpan.textContent = `(${count})`;
        }
    }
}

// Open wardrobe modal
function openWardrobe() {
    const modal = document.getElementById('wardrobeModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    renderWardrobeGrid();
}

// Close wardrobe modal
function closeWardrobe() {
    const modal = document.getElementById('wardrobeModal');
    modal.classList.remove('active');
    
    if (!widgetOpen || !isMobile) {
        document.body.style.overflow = '';
    }
}

// Render wardrobe grid
function renderWardrobeGrid() {
    const grid = document.getElementById('wardrobeGrid');
    const empty = document.getElementById('wardrobeEmpty');
    const wardrobe = getWardrobe();
    
    if (wardrobe.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    empty.style.display = 'none';
    
    let gridHTML = '';
    wardrobe.forEach(item => {
        const isOriginalPhoto = item.isOriginalPhoto;
        const displayName = isOriginalPhoto ? 'Your Photo' : item.clothingName;
        const displayPrice = isOriginalPhoto ? '' : `$${item.clothingPrice.toFixed(2)}`;
        
        gridHTML += `
            <div class="wardrobe-item ${isOriginalPhoto ? 'original-photo-item' : ''}" data-tryon-id="${item.id}">
                <img src="${item.resultImageUrl}" alt="${displayName}" loading="lazy" onclick="enlargeWardrobeImage('${item.resultImageUrl}', '${displayName}', '${item.id}')">
                <div class="wardrobe-item-name">${displayName}</div>
                ${displayPrice ? `<div class="wardrobe-item-price">${displayPrice}</div>` : ''}
                <div class="wardrobe-item-actions">
                    ${!isOriginalPhoto ? `
                        <button class="wardrobe-action-btn wardrobe-add-outfit-btn" onclick="addToOutfit('${item.id}')" title="Add this item to your outfit">
                            <span>👕</span>
                            <span>Add to Outfit</span>
                        </button>
                    ` : `
                        <button class="wardrobe-action-btn wardrobe-use-photo-btn" onclick="useOriginalPhoto('${item.id}')" title="Use this photo for try-on">
                            <span>📸</span>
                            <span>Use Photo</span>
                        </button>
                    `}
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = gridHTML;
}

// Enlarge wardrobe image
function enlargeWardrobeImage(imageSrc, itemName, tryOnId) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    
    modalImage.src = imageSrc;
    modalImage.alt = `Try-on result: ${itemName}`;
    
    // Add wardrobe-specific styling to modal
    modal.classList.add('wardrobe-view');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Get wardrobe item details
    const wardrobe = getWardrobe();
    const item = wardrobe.find(w => w.id === tryOnId);
    
    // Add wardrobe item info to modal
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent.querySelector('.wardrobe-modal-info')) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'wardrobe-modal-info';
        
        let infoHTML = `
            <h3>${itemName}</h3>
            <p>Your virtual try-on result</p>
        `;
        
        if (item) {
            infoHTML += `
                <div class="wardrobe-modal-details">
                    <div class="wardrobe-original-item">
                        <img src="${item.clothingImageUrl}" alt="Original ${item.clothingName}" class="wardrobe-original-image">
                        <span class="wardrobe-price">$${item.clothingPrice.toFixed(2)}</span>
                    </div>
                </div>
            `;
        }
        
        infoDiv.innerHTML = infoHTML;
        modalContent.appendChild(infoDiv);
    }
}

// Add item to outfit (use result as new base photo)
function addToOutfit(tryOnId) {
    const wardrobe = getWardrobe();
    const item = wardrobe.find(w => w.id === tryOnId);
    
    if (!item) {
        console.error('Wardrobe item not found:', tryOnId);
        return;
    }
    
    // Use the result image as the new base photo for try-on
    userPhoto = item.resultImageUrl;
    userPhotoFileId = 'outfit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Update photo preview
    updatePhotoPreview(item.resultImageUrl);
    
    // Close wardrobe modal
    closeWardrobe();
    
    // Show notification
    showSuccessNotification('Added to Outfit', `${item.clothingName} added to your outfit! Now try on another item to build your look.`, 4000);
    
    // Update try-on button
    updateTryOnButton();
    
    console.log('✅ Added to outfit:', item.clothingName);
}

// Use original photo for try-on
function useOriginalPhoto(tryOnId) {
    const wardrobe = getWardrobe();
    const item = wardrobe.find(w => w.id === tryOnId);
    
    if (!item) {
        console.error('Wardrobe item not found:', tryOnId);
        return;
    }
    
    // Use the original photo for try-on
    userPhoto = item.originalPhotoUrl;
    userPhotoFileId = 'original_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Update photo preview
    updatePhotoPreview(item.originalPhotoUrl);
    
    // Close wardrobe modal
    closeWardrobe();
    
    // Show notification
    showSuccessNotification('Photo Loaded', 'Your original photo is ready for try-on!', 3000);
    
    // Update try-on button
    updateTryOnButton();
    
    console.log('✅ Using original photo for try-on');
}

// Select wardrobe item for re-try
function selectWardrobeItem(tryOnId) {
    const wardrobe = getWardrobe();
    const item = wardrobe.find(w => w.id === tryOnId);
    
    if (!item) {
        console.error('Wardrobe item not found:', tryOnId);
        return;
    }
    
    // Find the clothing in sampleClothing
    const clothing = sampleClothing.find(c => c.id === item.clothingId);
    if (!clothing) {
        console.error('Clothing not found in sampleClothing:', item.clothingId);
        return;
    }
    
    // Set as selected clothing
    selectedClothing = item.clothingId;
    
    // Close wardrobe modal
    closeWardrobe();
    
    // Update UI to show selected item
    document.querySelectorAll('.quick-pick-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    document.querySelectorAll('.featured-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Highlight the selected item in quick picks or featured
    const quickPickItem = document.querySelector(`[onclick*="${item.clothingId}"]`);
    if (quickPickItem) {
        quickPickItem.classList.add('selected');
    }
    
    // Update try-on button
    updateTryOnButton();
    
    // Show notification
    showSuccessNotification('Item Selected', `${clothing.name} selected for try-on!`);
    
    console.log('✅ Selected wardrobe item:', clothing.name);
}

// Auto-save successful try-ons to wardrobe
function autoSaveToWardrobe(clothing, resultImageUrl, tryOnId) {
    if (resultImageUrl && !resultImageUrl.includes('placeholder')) {
        addToWardrobe(clothing, resultImageUrl, tryOnId);
        addOriginalPhotoToWardrobe(); // Also save original photo if not already saved
        showSuccessNotification('Saved to Wardrobe', `${clothing.name} has been saved to your wardrobe!`);
    }
}
