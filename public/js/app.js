// Typica Coffee Roasters — Client-Side Application Logic

// State
let state = {
  products: [],
  categories: [],
  settings: {},
  activeCategory: 'all',
  searchQuery: '',
  cart: JSON.parse(localStorage.getItem('typica_cart') || '[]'),
  currentProduct: null,
  activeWeight: '250g',
  activeGrind: 'Whole Bean',
  promoCode: '',
  discountPercent: 0,
  selectedPaymentMethod: 'instapay', // 'instapay' | 'wallet' | 'cod'
  receiptBase64: null
};

// DOM Elements
const productsGrid = document.getElementById('products-grid');
const filterTabs = document.getElementById('filter-tabs');
const cartDrawer = document.getElementById('cart-drawer');
const cartOverlay = document.getElementById('cart-overlay');
const cartItemsContainer = document.getElementById('cart-items');
const cartBadge = document.getElementById('cart-badge');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const cartShippingEl = document.getElementById('cart-shipping');
const cartTotalEl = document.getElementById('cart-total');
const freeShippingText = document.getElementById('free-shipping-text');
const freeShippingBar = document.getElementById('free-shipping-bar');
const productModal = document.getElementById('product-modal');
const checkoutModal = document.getElementById('checkout-modal');
const trackModal = document.getElementById('track-modal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  updateCartUI();
  await loadSettings();
  await loadCategories();
  await loadProducts();
  checkRouteHash();
});

// Hash navigation listener
window.addEventListener('hashchange', checkRouteHash);

function checkRouteHash() {
  const hash = window.location.hash;
  if (hash === '#admin') {
    showAdminView();
  } else if (hash.startsWith('#track')) {
    const parts = hash.split('/');
    const orderId = parts[1] || '';
    openTrackModal(orderId);
  } else {
    showStoreView();
  }
}

function showStoreView() {
  const storeEl = document.getElementById('store-view');
  const adminEl = document.getElementById('admin-view');
  if (storeEl) storeEl.style.display = 'block';
  if (adminEl) adminEl.style.display = 'none';
}

function showAdminView() {
  const storeEl = document.getElementById('store-view');
  const adminEl = document.getElementById('admin-view');
  if (storeEl) storeEl.style.display = 'none';
  if (adminEl) adminEl.style.display = 'block';
  if (typeof initAdmin === 'function') {
    initAdmin();
  }
}

// API Calls
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      state.settings = data.data;
      if (document.getElementById('announcement-text')) {
        document.getElementById('announcement-text').innerText = state.settings.announcement || '🚚 شحن سريع لجميع المحافظات | دفع 95 ج.م شحن مسبقاً أو الدفع عند الاستلام';
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      state.categories = data.data;
      renderCategories();
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadProducts() {
  try {
    let url = '/api/products';
    const params = [];
    if (state.activeCategory && state.activeCategory !== 'all') {
      params.push(`category=${encodeURIComponent(state.activeCategory)}`);
    }
    if (state.searchQuery) {
      params.push(`search=${encodeURIComponent(state.searchQuery)}`);
    }
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.products = data.data;
      renderProducts();
    }
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

// Render Functions
function renderCategories() {
  if (!filterTabs) return;
  filterTabs.innerHTML = '';

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-tab ${state.activeCategory === cat.id ? 'active' : ''}`;
    btn.innerText = `${cat.name} (${cat.count || 0})`;
    btn.onclick = () => {
      state.activeCategory = cat.id;
      renderCategories();
      loadProducts();
    };
    filterTabs.appendChild(btn);
  });
}

function renderProducts() {
  if (!productsGrid) return;
  productsGrid.innerHTML = '';

  if (state.products.length === 0) {
    productsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <h3 class="font-serif" style="font-size: 1.5rem; margin-bottom: 8px;">لم يتم العثور على محاصيل</h3>
        <p>جرب البحث بكلمة أخرى أو تصفح باقي الأقسام.</p>
      </div>
    `;
    return;
  }

  state.products.forEach(product => {
    const card = document.createElement('div');
    card.className = 'roast-card';

    // Roast dots
    let dotsHtml = '';
    if (product.roastLevel > 0) {
      for (let i = 1; i <= 5; i++) {
        dotsHtml += `<div class="roast-dot ${i <= product.roastLevel ? 'filled' : ''}"></div>`;
      }
    }

    // Notes tags
    const notesHtml = (product.notes || [])
      .slice(0, 3)
      .map(note => `<span class="note-tag">${note}</span>`)
      .join('');

    card.innerHTML = `
      <div class="card-img-wrap" onclick="openProductModal('${product.id}')">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
        ${product.badge ? `<span class="card-badge">${product.badge}</span>` : ''}
        ${product.cuppingScore ? `<span class="card-cupping">تقييم: ${product.cuppingScore}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-origin">${product.origin || ''}</div>
        <h3 class="card-title" onclick="openProductModal('${product.id}')">${product.name}</h3>
        
        ${product.roastLevel > 0 ? `
          <div class="roast-meter">
            <span class="roast-meter-label">${product.roastLabel || 'درجة التحميص'}:</span>
            <div class="roast-dots">${dotsHtml}</div>
          </div>
        ` : '<div style="height: 22px;"></div>'}

        <div class="card-notes">${notesHtml}</div>

        <div class="card-footer">
          <div class="card-price">
            ${product.originalPrice ? `<del>${product.originalPrice} ج.م</del>` : ''}
            ${product.price} ج.م
          </div>
          <button class="btn-card-add" onclick="quickAddToCart('${product.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            أضف للسلة
          </button>
        </div>
      </div>
    `;

    productsGrid.appendChild(card);
  });
}

// Quick Add to Cart
function quickAddToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  addToCart({
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    weight: '250g',
    grind: 'Whole Bean',
    quantity: 1
  });

  showToast(`تمت إضافة "${product.name}" إلى السلة`);
}

// Add To Cart with options
function addToCart(item) {
  const existingIndex = state.cart.findIndex(
    i => i.id === item.id && i.weight === item.weight && i.grind === item.grind
  );

  if (existingIndex > -1) {
    state.cart[existingIndex].quantity += item.quantity;
  } else {
    state.cart.push(item);
  }

  saveCart();
  updateCartUI();
  openCartDrawer();
}

function updateCartQty(index, delta) {
  state.cart[index].quantity += delta;
  if (state.cart[index].quantity <= 0) {
    state.cart.splice(index, 1);
  }
  saveCart();
  updateCartUI();
}

function removeCartItem(index) {
  state.cart.splice(index, 1);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('typica_cart', JSON.stringify(state.cart));
}

function updateCartUI() {
  // Count
  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartBadge) {
    cartBadge.innerText = totalCount;
    cartBadge.style.display = totalCount > 0 ? 'flex' : 'none';
  }

  // Items Render
  if (!cartItemsContainer) return;
  cartItemsContainer.innerHTML = '';

  if (state.cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; display: block; opacity: 0.5;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <h4 class="font-serif" style="font-size: 1.25rem; color: var(--espresso); margin-bottom: 6px;">سلتك فارغة حالياً</h4>
        <p style="font-size: 0.875rem;">تصفح محاصيلنا الفاخرة واختر قهوتك المفضلة.</p>
      </div>
    `;
    if (cartSubtotalEl) cartSubtotalEl.innerText = '0.00 ج.م';
    if (cartShippingEl) cartShippingEl.innerText = '95.00 ج.م';
    if (cartTotalEl) cartTotalEl.innerText = '0.00 ج.م';
    if (freeShippingBar) freeShippingBar.style.width = '0%';
    if (freeShippingText) freeShippingText.innerText = 'شحن وتوصيل سريع متاح لجميع محافظات مصر.';
    return;
  }

  let subtotal = 0;

  state.cart.forEach((item, index) => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-meta">${item.weight} · ${item.grind}</div>
        <div class="cart-item-bottom">
          <div class="cart-qty-ctrl">
            <button class="cart-qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
            <span class="cart-qty-val">${item.quantity}</span>
            <button class="cart-qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="cart-item-price">${itemTotal.toFixed(2)} ج.م</span>
            <button class="cart-item-remove" onclick="removeCartItem(${index})">حذف</button>
          </div>
        </div>
      </div>
    `;
    cartItemsContainer.appendChild(row);
  });

  const shippingFee = Number(state.settings.shippingFee) || 95;
  const discount = (subtotal * state.discountPercent) / 100;
  const grandTotal = Math.max(0, subtotal - discount);

  if (cartSubtotalEl) cartSubtotalEl.innerText = `${subtotal.toFixed(2)} ج.م`;
  if (cartShippingEl) cartShippingEl.innerText = `${shippingFee.toFixed(2)} ج.م`;
  if (cartTotalEl) cartTotalEl.innerText = `${grandTotal.toFixed(2)} ج.م`;

  // Shipping note
  if (freeShippingBar && freeShippingText) {
    freeShippingBar.style.width = '100%';
    freeShippingText.innerHTML = `🚚 <strong>رسوم الشحن 95 ج.م</strong> تُدفع مسبقاً عبر إنستاباي/المحفظة، أو اختر الدفع عند الاستلام بالكامل!`;
  }
}

// Cart Drawer Toggles
function openCartDrawer() {
  cartDrawer.classList.add('active');
  cartOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  cartDrawer.classList.remove('active');
  cartOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// Product Quick View Modal
function openProductModal(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  state.currentProduct = product;
  state.activeWeight = '250g';
  state.activeGrind = 'Whole Bean';

  const modalBody = document.getElementById('product-modal-content');
  if (!modalBody) return;

  let dotsHtml = '';
  if (product.roastLevel > 0) {
    for (let i = 1; i <= 5; i++) {
      dotsHtml += `<div class="roast-dot ${i <= product.roastLevel ? 'filled' : ''}"></div>`;
    }
  }

  const notesHtml = (product.notes || [])
    .map(n => `<span class="note-tag" style="padding: 4px 12px; font-size: 0.8125rem;">${n}</span>`)
    .join('');

  modalBody.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 36px; padding: 36px;">
      <div>
        <div style="border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--shadow-md); aspect-ratio: 1/1; background: #f1ece4;">
          <img src="${product.image}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
      </div>
      <div>
        <div style="font-size: 0.8125rem; color: var(--copper); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">
          ${product.origin}
        </div>
        <h2 class="font-serif" style="font-size: 2.2rem; color: var(--espresso); margin-bottom: 12px; line-height: 1.1;">
          ${product.name}
        </h2>

        ${product.roastLevel > 0 ? `
          <div class="roast-meter" style="margin-bottom: 20px;">
            <span class="roast-meter-label">درجة التحميص:</span>
            <div class="roast-dots">${dotsHtml}</div>
            <span style="font-size: 0.8125rem; font-weight: 500; margin-left: 8px; color: var(--espresso);">${product.roastLabel}</span>
          </div>
        ` : ''}

        <p style="color: var(--text-muted); font-size: 0.9375rem; margin-bottom: 20px; line-height: 1.6;">
          ${product.description || ''}
        </p>

        <div style="margin-bottom: 20px;">
          <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 8px;">إيحاءات النكهة (Flavor Notes)</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">${notesHtml}</div>
        </div>

        <!-- Weight Selection -->
        <div style="margin-bottom: 20px;">
          <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 8px;">حجم العبوة (Weight)</label>
          <div style="display: flex; gap: 10px;" id="weight-selector">
            <button class="filter-tab active" onclick="selectWeight('250g', 1, this)">250g</button>
            <button class="filter-tab" onclick="selectWeight('500g', 1.9, this)">500g (وفر 5%)</button>
            <button class="filter-tab" onclick="selectWeight('1kg', 3.6, this)">1kg (وفر 10%)</button>
          </div>
        </div>

        <!-- Grind Selection -->
        <div style="margin-bottom: 24px;">
          <label style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 8px;">درجة الطحن (Grind Profile)</label>
          <select id="grind-select" style="width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-family: var(--font-sans); background: #fff;">
            <option value="Whole Bean">حبوب كاملة (Whole Bean - للحفاظ على أقصى درجات الطزاجة)</option>
            <option value="Pour Over / V60">فلتر / تقطير (V60, Chemex, Kalita)</option>
            <option value="Espresso">إسبريسو ناعم (Fine Espresso)</option>
            <option value="French Press">فرنش بريس / كولد برو (Coarse)</option>
            <option value="Aeropress">ايروبرس / موكا بوت (Medium Fine)</option>
          </select>
        </div>

        <!-- Price & Add -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 20px; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 16px;">
          <div id="modal-price" style="font-family: var(--font-display); font-size: 2rem; font-weight: 500; color: var(--espresso);">
            ${product.price} ج.م
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-secondary" style="color: var(--espresso); border-color: var(--border-color); padding: 12px 18px;" onclick="addCurrentProductToCart(false)">
              + إضافة للسلة
            </button>
            <button class="btn-primary" onclick="addCurrentProductToCart(true)">
              اطلب الآن (شراء فوري) ←
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const pModal = document.getElementById('product-modal');
  if (pModal) pModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function selectWeight(weight, multiplier, btn) {
  state.activeWeight = weight;
  document.querySelectorAll('#weight-selector button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (state.currentProduct) {
    const newPrice = Math.round(state.currentProduct.price * multiplier);
    document.getElementById('modal-price').innerText = `${newPrice} ج.م`;
  }
}

function addCurrentProductToCart(buyNow = false) {
  if (!state.currentProduct) return;

  const grind = document.getElementById('grind-select').value;
  const priceText = document.getElementById('modal-price').innerText.replace(/[^\d.]/g, '');
  const price = Number(priceText) || state.currentProduct.price;

  addToCart({
    id: state.currentProduct.id,
    name: state.currentProduct.name,
    price: price,
    image: state.currentProduct.image,
    weight: state.activeWeight,
    grind: grind,
    quantity: 1
  });

  closeProductModal();

  if (buyNow) {
    setTimeout(() => {
      openCheckoutModal();
    }, 150);
  } else {
    showToast(`تمت إضافة ${state.currentProduct.name} (${state.activeWeight}) إلى سلتك`);
  }
}

function closeProductModal() {
  const pModal = document.getElementById('product-modal');
  if (pModal) pModal.classList.remove('active');
  document.body.style.overflow = '';
}

// Payment Methods & Screenshot Proof Upload Logic
function selectPaymentMethod(method) {
  state.selectedPaymentMethod = method;

  const optInstapay = document.getElementById('method-opt-instapay');
  const optWallet = document.getElementById('method-opt-wallet');
  const optCod = document.getElementById('method-opt-cod');

  const transferContainer = document.getElementById('transfer-payment-details');
  const codContainer = document.getElementById('cod-payment-details');

  const labelEl = document.getElementById('transfer-label');
  const valEl = document.getElementById('transfer-display-val');
  const nameEl = document.getElementById('transfer-name-info');
  const copyBtn = document.getElementById('copy-btn-text');
  const submitBtn = document.getElementById('btn-place-order');

  const depositEl = document.getElementById('checkout-deposit-required');
  const codEl = document.getElementById('checkout-cod-remaining');

  if (copyBtn) copyBtn.innerText = 'نسخ';

  const paySettings = (state.settings && state.settings.paymentSettings) || {
    walletNumber: "01099887766",
    instapayId: "typica@instapay"
  };

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingFee = Number(state.settings.shippingFee) || 95;
  const grandTotal = subtotal + shippingFee;

  // Toggle active classes
  if (optInstapay) optInstapay.classList.toggle('active', method === 'instapay');
  if (optWallet) optWallet.classList.toggle('active', method === 'wallet');
  if (optCod) optCod.classList.toggle('active', method === 'cod');

  const radio = document.querySelector(`input[name="pay-method"][value="${method}"]`);
  if (radio) radio.checked = true;

  if (method === 'cod') {
    // CASH ON DELIVERY
    if (transferContainer) transferContainer.style.display = 'none';
    if (codContainer) codContainer.style.display = 'block';

    if (depositEl) depositEl.innerText = '0.00 ج.م (لا يوجد دفع مسبق)';
    if (codEl) codEl.innerText = `${grandTotal.toFixed(2)} ج.م (كامل الطلب عند الاستلام)`;

    if (submitBtn) {
      submitBtn.innerText = `تأكيد الأوردر والدفع عند الاستلام (${grandTotal.toFixed(2)} ج.م) ←`;
    }
  } else {
    // INSTAPAY OR WALLET
    if (transferContainer) transferContainer.style.display = 'block';
    if (codContainer) codContainer.style.display = 'none';

    if (depositEl) depositEl.innerText = `${shippingFee.toFixed(2)} ج.م`;
    if (codEl) codEl.innerText = `${subtotal.toFixed(2)} ج.م`;

    if (submitBtn) {
      submitBtn.innerText = `تأكيد الأوردر وإرسال إيصال التحويل (المطلوب ${shippingFee.toFixed(2)} ج.م) ←`;
    }

    if (method === 'instapay') {
      if (labelEl) labelEl.innerText = 'حساب إنستاباي للتحويل (اضغط نسخ ثم حوّل من تطبيق إنستاباي أو بنكك):';
      if (valEl) valEl.innerText = paySettings.instapayId || 'typica@instapay';
      if (nameEl) nameEl.innerText = '* قم بتحويل 95 ج.م لحساب: ' + (paySettings.instapayName || 'حساب إنستاباي الرسمي') + ' وارفع الاسكرين شوت بالأسفل.';
    } else {
      if (labelEl) labelEl.innerText = 'رقم المحفظة الإلكترونية (فودافون كاش / اتصالات / أورنج / وي):';
      if (valEl) valEl.innerText = paySettings.walletNumber || '01099887766';
      if (nameEl) nameEl.innerText = '* قم بتحويل 95 ج.م كاش للرقم أعلاه، وارفع اسكرين شوت التحويل بالأسفل.';
    }
  }
}

function copyTransferValue() {
  const valEl = document.getElementById('transfer-display-val');
  if (!valEl) return;
  const text = valEl.innerText.trim();
  navigator.clipboard.writeText(text).then(() => {
    const copyBtn = document.getElementById('copy-btn-text');
    if (copyBtn) {
      copyBtn.innerText = 'تم النسخ!';
      setTimeout(() => {
        copyBtn.innerText = 'نسخ';
      }, 2000);
    }
    showToast(`تم نسخ (${text}) بنجاح`);
  }).catch(err => {
    console.error(err);
  });
}

// Receipt Screenshot File Upload
function handleReceiptFileSelect(input) {
  const emptyBox = document.getElementById('receipt-dropzone-empty');
  const previewBox = document.getElementById('receipt-dropzone-preview');
  const previewImg = document.getElementById('receipt-preview-img');
  const errorMsg = document.getElementById('receipt-error-msg');

  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      state.receiptBase64 = e.target.result;
      if (previewImg) previewImg.src = state.receiptBase64;
      if (emptyBox) emptyBox.style.display = 'none';
      if (previewBox) previewBox.style.display = 'block';
      if (errorMsg) errorMsg.style.display = 'none';
      showToast('تم إرفاق صورة إيصال التحويل بنجاح');
    };
    reader.readAsDataURL(file);
  }
}

function clearReceiptImage() {
  state.receiptBase64 = null;
  const input = document.getElementById('cust-receipt-file');
  if (input) input.value = '';

  const emptyBox = document.getElementById('receipt-dropzone-empty');
  const previewBox = document.getElementById('receipt-dropzone-preview');
  const previewImg = document.getElementById('receipt-preview-img');

  if (previewImg) previewImg.src = '';
  if (previewBox) previewBox.style.display = 'none';
  if (emptyBox) emptyBox.style.display = 'block';
}

// Checkout Modal & Processing
function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('سلتك فارغة، يرجى اختيار قهوة أولاً');
    return;
  }
  closeCartDrawer();

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingFee = Number(state.settings.shippingFee) || 95;

  const subtotalEl = document.getElementById('checkout-subtotal');
  const shippingEl = document.getElementById('checkout-shipping');

  if (subtotalEl) subtotalEl.innerText = `${subtotal.toFixed(2)} ج.م`;
  if (shippingEl) shippingEl.innerText = `${shippingFee.toFixed(2)} ج.م`;

  clearReceiptImage();
  selectPaymentMethod(state.selectedPaymentMethod || 'instapay');

  const modal = document.getElementById('checkout-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

async function handlePlaceOrder(e) {
  e.preventDefault();
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const phone2 = document.getElementById('cust-phone2') ? document.getElementById('cust-phone2').value.trim() : '';
  const governorate = document.getElementById('cust-governorate').value;
  const city = document.getElementById('cust-city').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const senderNumber = document.getElementById('cust-sender-number') ? document.getElementById('cust-sender-number').value.trim() : '';
  const errorMsg = document.getElementById('receipt-error-msg');

  if (!name || !phone || !governorate || !city || !address) {
    showToast('يرجى ملء جميع بيانات الشحن والعنوان بالكامل');
    return;
  }

  const isCod = state.selectedPaymentMethod === 'cod';

  // If paying via InstaPay or Wallet, receipt screenshot & sender verification are required
  if (!isCod) {
    if (!senderNumber) {
      showToast('يرجى إدخال رقم الهاتف المحول منه أو اسمك في إنستاباي');
      if (document.getElementById('cust-sender-number')) {
        document.getElementById('cust-sender-number').focus();
      }
      return;
    }

    if (!state.receiptBase64) {
      if (errorMsg) errorMsg.style.display = 'block';
      showToast('⚠️ يرجى رفع صورة إيصال التحويل (اسكرين شوت) لتأكيد الأوردر');
      return;
    }
  }

  const submitBtn = document.getElementById('btn-place-order');
  submitBtn.disabled = true;
  submitBtn.innerText = 'جاري تسجيل الطلب وتأكيد الشحن...';

  try {
    let receiptUrl = '';

    // If receipt screenshot is attached, upload it to /api/upload
    if (!isCod && state.receiptBase64) {
      submitBtn.innerText = 'جاري رفع صورة الإيصال...';
      const fileInput = document.getElementById('cust-receipt-file');
      const filename = (fileInput && fileInput.files[0]) ? fileInput.files[0].name : 'receipt.jpg';
      const upRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'receipt',
          base64: state.receiptBase64,
          filename: filename
        })
      });
      const upData = await upRes.json();
      if (upData.success && upData.url) {
        receiptUrl = upData.url;
      }
    }

    submitBtn.innerText = 'جاري إرسال بيانات الأوردر...';

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name,
          phone,
          phone2,
          governorate,
          city,
          address: `${governorate} - ${city} - ${address}`
        },
        items: state.cart,
        paymentMethod: state.selectedPaymentMethod || 'instapay',
        senderNumber: isCod ? '' : senderNumber,
        receiptImage: receiptUrl,
        shippingDeposit: isCod ? 0 : 95
      })
    });

    const data = await res.json();
    if (data.success) {
      const order = data.data;
      state.cart = [];
      saveCart();
      updateCartUI();
      closeCheckoutModal();
      clearReceiptImage();

      showOrderConfirmation(order);
    } else {
      showToast(data.error || 'تعذر تأكيد الطلب');
    }
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ في الاتصال، يرجى المحاولة ثانية');
  } finally {
    submitBtn.disabled = false;
    selectPaymentMethod(state.selectedPaymentMethod);
  }
}

function showOrderConfirmation(order) {
  const content = document.getElementById('confirm-modal-content');
  if (!content) return;

  const govCity = `${order.customer.governorate || ''} - ${order.customer.city || ''}`;
  const isCod = order.paymentMethod === 'cod';

  let paymentSummaryHtml = '';
  if (isCod) {
    paymentSummaryHtml = `
      <div style="background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 22px; max-width: 440px; margin: 0 auto 28px auto; text-align: right;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--cream); padding-bottom: 10px; margin-bottom: 10px;">
          <span style="color: var(--text-muted);">كود تتبع الشحنة:</span>
          <strong style="font-family: monospace; font-size: 1.25rem; color: var(--copper);">${order.id}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>طريقة الدفع:</span>
          <span style="color: #2563eb; font-weight: 600;">الدفع عند الاستلام نقداً (COD)</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>مصاريف الشحن:</span>
          <span>95.00 ج.م</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.15rem; font-weight: 700; color: var(--espresso); border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 8px;">
          <span>المطلوب دفعه للمندوب عند الاستلام:</span>
          <span style="color: var(--copper);">${(order.total).toFixed(2)} ج.م</span>
        </div>
      </div>
    `;
  } else {
    paymentSummaryHtml = `
      <div style="background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 22px; max-width: 440px; margin: 0 auto 28px auto; text-align: right;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--cream); padding-bottom: 10px; margin-bottom: 10px;">
          <span style="color: var(--text-muted);">كود تتبع الشحنة:</span>
          <strong style="font-family: monospace; font-size: 1.25rem; color: var(--copper);">${order.id}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>مصاريف الشحن المحولة:</span>
          <span style="color: #059669; font-weight: 600;">95.00 ج.م (تم إرفاق الإيصال)</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 700; color: var(--espresso); border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 8px;">
          <span>المتبقي للدفع نقداً عند الاستلام (COD):</span>
          <span style="color: var(--copper);">${(order.codAmount || order.subtotal).toFixed(2)} ج.م</span>
        </div>
        ${order.receiptImage ? `
          <div style="margin-top: 12px; border-top: 1px dashed #e2e8f0; padding-top: 10px; text-align: center;">
            <button type="button" onclick="openImageLightbox('${order.receiptImage}')" style="background: none; border: none; color: var(--copper); font-size: 0.8125rem; cursor: pointer; text-decoration: underline; font-weight: 600;">
              👁️ معاينة اسكرين شوت الإيصال المرفق
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  content.innerHTML = `
    <div style="text-align: center; padding: 40px 24px;" dir="rtl">
      <div style="width: 68px; height: 68px; background: #ecfdf5; border-radius: 50%; color: #059669; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="section-tag">تم تأكيد الحجز وجاري التجهيز</span>
      <h2 class="font-serif" style="font-size: 2.2rem; color: var(--espresso); margin-bottom: 12px;">
        شكراً لك، ${order.customer.name}!
      </h2>
      <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto 24px auto; line-height: 1.6;">
        ${isCod 
          ? `تم تسجيل طلبك بنجاح برقم <strong>#${order.id}</strong> بنظام الدفع عند الاستلام. سيتم شحن الطلب فوراً لعنوانك في <strong>${govCity}</strong> وسداد كامل القيمة لمندوب الشحن.`
          : `تم تسجيل طلبك بنجاح برقم <strong>#${order.id}</strong>. سيتم مراجعة تحويل الـ 95 ج.م عبر <strong>${order.paymentMethod === 'instapay' ? 'إنستاباي' : 'المحفظة'}</strong> والبدء فوراً في تجهيز وتحميص شحنتك لعنوانك في <strong>${govCity}</strong>.`
        }
      </p>

      ${paymentSummaryHtml}

      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button class="btn-primary" onclick="closeConfirmModal(); openTrackModal('${order.id}');">
          تتبع مراحل الشحن والتوصيل
        </button>
        <button class="btn-secondary" style="color: var(--espresso); border-color: var(--border-color);" onclick="closeConfirmModal()">
          متابعة التسوق
        </button>
      </div>
    </div>
  `;

  document.getElementById('confirm-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('active');
  document.body.style.overflow = '';
}

// Order Tracking System
function openTrackModal(prefillId = '') {
  trackModal.classList.add('active');
  document.body.style.overflow = 'hidden';

  if (prefillId) {
    document.getElementById('track-input').value = prefillId;
    fetchOrderTracking(prefillId);
  }
}

function closeTrackModal() {
  trackModal.classList.remove('active');
  document.body.style.overflow = '';
}

async function handleTrackSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('track-input').value.trim();
  if (!id) return;
  await fetchOrderTracking(id);
}

async function fetchOrderTracking(orderId) {
  const resultContainer = document.getElementById('track-results');
  resultContainer.innerHTML = '<div style="text-align: center; padding: 30px;"><p>جاري فحص لوجستيات الشحنة...</p></div>';

  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();

    if (!data.success) {
      resultContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: var(--cream); border-radius: var(--radius-sm);" dir="rtl">
          <h4 class="font-serif" style="color: #c0392b; margin-bottom: 8px;">لم يتم العثور على الطلب</h4>
          <p style="color: var(--text-muted); font-size: 0.875rem;">تأكد من إدخال كود الطلب الصحيح (مثال: TYP-1001) أو تواصل مع خدمة العملاء.</p>
        </div>
      `;
      return;
    }

    const order = data.data;
    const stages = ['confirmed', 'roasting', 'quality_check', 'dispatched', 'delivered'];
    const stageLabels = ['تأكيد الطلب', 'التحميص الحرفي', 'فحص الجودة والتغليف', 'خرج للشحن', 'تم التوصيل'];
    const currentStageIndex = stages.indexOf(order.status);

    let timelineHtml = '<div class="timeline">';
    stages.forEach((st, idx) => {
      let statusClass = '';
      if (idx < currentStageIndex) statusClass = 'done';
      else if (idx === currentStageIndex) statusClass = 'active';

      timelineHtml += `
        <div class="timeline-step ${statusClass}">
          <div class="timeline-icon">${idx + 1}</div>
          <div class="timeline-title">${stageLabels[idx]}</div>
        </div>
      `;
    });
    timelineHtml += '</div>';

    let itemsHtml = (order.items || []).map(i => `
      <div style="display: flex; justify-content: space-between; font-size: 0.875rem; padding: 8px 0; border-bottom: 1px solid var(--cream);">
        <span>${i.name} (${i.weight || '250g'} · ${i.grind || 'Whole Bean'}) × ${i.quantity}</span>
        <strong>${(i.price * i.quantity).toFixed(2)} ج.م</strong>
      </div>
    `).join('');

    resultContainer.innerHTML = `
      <div style="margin-top: 24px;" dir="rtl">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px;">
          <div>
            <span class="badge-status ${order.status}">${order.status.replace('_', ' ')}</span>
            <h3 class="font-serif" style="font-size: 1.5rem; margin-top: 8px; color: var(--espresso);">طلب #${order.id}</h3>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-muted);">تاريخ الطلب: ${new Date(order.date).toLocaleDateString()}</div>
        </div>

        ${timelineHtml}

        <div style="background: var(--cream); padding: 20px; border-radius: var(--radius-sm); margin-top: 24px;">
          <h4 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; color: var(--espresso);">تفاصيل المنتجات</h4>
          ${itemsHtml}
          <div style="display: flex; justify-content: space-between; font-weight: 600; padding-top: 12px; margin-top: 8px; border-top: 1px solid var(--border-color); font-size: 1rem;">
            <span>إجمالي قيمة الطلب:</span>
            <span style="color: var(--copper);">${order.total.toFixed(2)} ج.م</span>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 0.8125rem; color: var(--text-muted);">
          <strong>عنوان التوصيل:</strong> ${order.customer.address} (${order.customer.name} - 📞 ${order.customer.phone})
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    resultContainer.innerHTML = '<p style="color: red; text-align: center;">خطأ أثناء جلب تفاصيل التتبع.</p>';
  }
}

// Lightbox Modal for Receipt Screenshots
function openImageLightbox(src) {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = src;
    modal.classList.add('active');
  }
}

function closeImageLightbox() {
  const modal = document.getElementById('image-lightbox-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Toast Notifications
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Event Listeners Setup
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.searchQuery = e.target.value.trim();
        loadProducts();
      }, 300);
    });
  }

  // Cart drawer open/close
  const cartBtn = document.getElementById('btn-cart-toggle');
  if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);

  const cartCloseBtn = document.getElementById('btn-cart-close');
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCartDrawer);

  if (cartOverlay) cartOverlay.addEventListener('click', closeCartDrawer);

  // Modals close on click outside
  [productModal, checkoutModal, trackModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  });

  // Forms
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) checkoutForm.addEventListener('submit', handlePlaceOrder);

  const trackForm = document.getElementById('track-form');
  if (trackForm) trackForm.addEventListener('submit', handleTrackSubmit);
}

// Explicit global exports for inline HTML onclick handlers
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.selectPaymentMethod = selectPaymentMethod;
window.copyTransferValue = copyTransferValue;
window.handlePlaceOrder = handlePlaceOrder;
window.quickAddToCart = quickAddToCart;
window.addCurrentProductToCart = addCurrentProductToCart;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.selectWeight = selectWeight;
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;
window.updateCartQty = updateCartQty;
window.removeCartItem = removeCartItem;
window.openTrackModal = openTrackModal;
window.closeTrackModal = closeTrackModal;
window.closeConfirmModal = closeConfirmModal;
window.handleReceiptFileSelect = handleReceiptFileSelect;
window.clearReceiptImage = clearReceiptImage;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
