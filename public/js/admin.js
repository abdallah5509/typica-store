// Typica Roastery — Admin Dashboard & Operations Portal Logic

let adminState = {
  stats: {},
  orders: [],
  products: []
};

let newProductImageBase64 = null;

// --- AUTH TOKEN MANAGEMENT ---
const ADMIN_TOKEN_KEY = 'typica_admin_token';

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    clearAdminToken();
    showAdminLoginForm();
    throw new Error('جلسة الأدمن انتهت، يرجى تسجيل الدخول مجدداً');
  }
  return res;
}

function showAdminLoginForm() {
  const loginCard = document.getElementById('admin-login-card');
  const adminContent = document.getElementById('admin-content');
  if (loginCard) loginCard.style.display = 'block';
  if (adminContent) adminContent.style.display = 'none';
  const userInput = document.getElementById('admin-user-input');
  if (userInput) userInput.focus();
}

function showAdminDashboard() {
  const loginCard = document.getElementById('admin-login-card');
  const adminContent = document.getElementById('admin-content');
  if (loginCard) loginCard.style.display = 'none';
  if (adminContent) adminContent.style.display = 'block';
}

async function checkAdminAuth() {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

// Initialize Admin View
async function initAdmin() {
  const isAuth = await checkAdminAuth();
  if (!isAuth) {
    showAdminLoginForm();
    return;
  }

  showAdminDashboard();
  await loadAdminStats();
  await loadAdminOrders();
  await loadAdminProducts();
  await loadAdminSettings();

  const settingsForm = document.getElementById('admin-settings-form');
  if (settingsForm) {
    settingsForm.onsubmit = handleSettingsSubmit;
  }
}

// Login Handler
async function handleAdminLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('admin-user-input');
  const passInput = document.getElementById('admin-pass-input');
  const errorBox = document.getElementById('admin-login-error');
  const loginBtn = document.getElementById('admin-login-btn');

  const username = userInput ? userInput.value.trim() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (errorBox) errorBox.style.display = 'none';
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerText = 'جاري التحقق...';
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      setAdminToken(data.token);
      if (passInput) passInput.value = '';
      if (typeof showToast === 'function') showToast('مرحباً بك! تم تسجيل الدخول بنجاح');
      showAdminDashboard();
      await initAdmin();
    } else {
      if (errorBox) {
        errorBox.innerText = data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة';
        errorBox.style.display = 'block';
      }
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
  } catch (err) {
    console.error(err);
    if (errorBox) {
      errorBox.innerText = 'حدث خطأ في الاتصال بالسيرفر';
      errorBox.style.display = 'block';
    }
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerText = 'تسجيل الدخول ←';
    }
  }
}

function handleAdminLogout() {
  clearAdminToken();
  showAdminLoginForm();
  if (typeof showToast === 'function') showToast('تم تسجيل الخروج بنجاح');
  window.location.hash = '';
}

// Load stats
async function loadAdminStats() {
  try {
    const res = await adminFetch('/api/stats');
    const data = await res.json();
    if (data.success) {
      adminState.stats = data.data;
      renderStats();
    }
  } catch (err) {
    console.error('Error loading admin stats:', err);
  }
}

// Load orders
async function loadAdminOrders() {
  try {
    const res = await adminFetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      adminState.orders = data.data;
      renderAdminOrders();
    }
  } catch (err) {
    console.error('Error loading admin orders:', err);
  }
}

// Load products
async function loadAdminProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success) {
      adminState.products = data.data;
      renderAdminProducts();
    }
  } catch (err) {
    console.error('Error loading admin products:', err);
  }
}

function renderStats() {
  const statsContainer = document.getElementById('admin-stats');
  if (!statsContainer) return;

  const s = adminState.stats;
  statsContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-title">إجمالي المبيعات (Gross Revenue)</div>
      <div class="stat-card-val">${s.totalRevenue || '0.00'} ج.م</div>
      <div style="font-size: 0.75rem; color: #16a34a; margin-top: 4px;">↑ تحديث لحظي</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">عدد الطلبات (Total Orders)</div>
      <div class="stat-card-val">${s.totalOrders || 0}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">جميع شحنات المحمص</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">متوسط قيمة الطلب (Avg Order)</div>
      <div class="stat-card-val">${s.avgOrderValue || '0.00'} ج.م</div>
      <div style="font-size: 0.75rem; color: var(--copper); margin-top: 4px;">لكل عميل</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">أنواع القهوة بالكتالوج</div>
      <div class="stat-card-val">${s.totalProducts || 0}</div>
      <div style="font-size: 0.75rem; color: ${s.lowStockCount > 0 ? '#b91c1c' : 'var(--text-muted)'}; margin-top: 4px;">
        ${s.lowStockCount > 0 ? `⚠️ ${s.lowStockCount} محاصيل أوشكت على النفاد` : 'المخزون مستقر'}
      </div>
    </div>
  `;
}

// Render Orders Management Table
function renderAdminOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  if (adminState.orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px;">No roastery orders logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = adminState.orders.map(order => {
    const itemsSummary = (order.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ');
    const customer = order.customer || {};
    const govCity = `${customer.governorate || 'القاهرة'} - ${customer.city || ''}`;
    const codDue = order.codAmount !== undefined ? order.codAmount : (order.subtotal || 0);
    const isCod = order.paymentMethod === 'cod';

    let paymentBadge = '';
    if (isCod) {
      paymentBadge = `
        <div style="color: #2563eb; font-weight: 700; font-size: 0.8125rem;">
          💵 دفع عند الاستلام بالكامل (COD)
        </div>
        <div style="font-weight: 700; color: var(--espresso); font-size: 0.8125rem; background: var(--cream); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">
          المطلوب تحصيله: ${(order.total || (order.subtotal + 95)).toFixed(2)} ج.م
        </div>
      `;
    } else {
      const methodLabel = order.paymentMethod === 'instapay' ? 'إنستاباي' : 'المحفظة';
      paymentBadge = `
        <div style="color: #059669; font-weight: 600; font-size: 0.8125rem;">
          ✓ مسدد شحن: 95 ج.م (${methodLabel})
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin: 2px 0;">
          رقم المحول: <strong>${order.senderNumber || 'غير مسجل'}</strong>
        </div>
        <div style="font-weight: 700; color: var(--espresso); font-size: 0.8125rem; background: var(--cream); padding: 2px 6px; border-radius: 4px; display: inline-block;">
          متبقي استلام (COD): ${codDue.toFixed(2)} ج.م
        </div>
      `;
    }

    let receiptButton = '';
    if (order.receiptImage) {
      receiptButton = `
        <div style="margin-top: 6px;">
          <button type="button" onclick="openImageLightbox('${order.receiptImage}')" style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 4px; padding: 3px 8px; font-size: 0.75rem; cursor: pointer; color: #1d4ed8; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
            🖼️ عرض اسكرين شوت الإيصال
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td><strong>#${order.id}</strong></td>
        <td>
          <div style="font-weight: 600;">${customer.name}</div>
          <div style="font-size: 0.8125rem; color: var(--copper); font-family: monospace;">📞 ${customer.phone || ''}</div>
          ${customer.phone2 ? `<div style="font-size: 0.75rem; color: var(--text-muted);">هاتف 2: ${customer.phone2}</div>` : ''}
        </td>
        <td>
          <div style="font-weight: 500; font-size: 0.875rem;">${govCity}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); max-width: 180px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${customer.address || ''}">
            ${customer.address || ''}
          </div>
        </td>
        <td style="max-width: 200px; font-size: 0.8125rem;" title="${itemsSummary}">
          ${itemsSummary}
        </td>
        <td>
          ${paymentBadge}
          ${receiptButton}
        </td>
        <td><span class="badge-status ${order.status}">${order.status.replace('_', ' ')}</span></td>
        <td>
          <select onchange="updateOrderStatus('${order.id}', this.value)" style="padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.75rem; background: #fff;">
            <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed (تأكيد الشحن)</option>
            <option value="roasting" ${order.status === 'roasting' ? 'selected' : ''}>Roasting (جاري التجهيز)</option>
            <option value="quality_check" ${order.status === 'quality_check' ? 'selected' : ''}>QC / Packing (التغليف)</option>
            <option value="dispatched" ${order.status === 'dispatched' ? 'selected' : ''}>Dispatched (خرج للشحن)</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered (تم التوصيل)</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled (إلغاء)</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await adminFetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast(`Order #${orderId} updated to "${newStatus}"`);
      await loadAdminOrders();
      await loadAdminStats();
    } else {
      if (typeof showToast === 'function') showToast(data.error || 'Failed to update order');
    }
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast(err.message || 'Network error updating status');
  }
}

// Render Products Management Table
function renderAdminProducts() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  tbody.innerHTML = adminState.products.map(p => `
    <tr>
      <td>
        <img src="${p.image}" alt="${p.name}" style="width: 44px; height: 44px; border-radius: 4px; object-fit: cover; background: #eee;">
      </td>
      <td>
        <div style="font-weight: 500;">${p.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.origin}</div>
      </td>
      <td><span class="note-tag">${p.category}</span></td>
      <td style="font-weight: 600; color: var(--espresso);">${p.price} ج.م</td>
      <td>
        <input type="number" value="${p.stock}" min="0" onchange="updateProductStock('${p.id}', this.value)" style="width: 64px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.8125rem;">
      </td>
      <td>
        <button onclick="deleteProduct('${p.id}')" style="background: none; border: none; color: #b91c1c; cursor: pointer; font-size: 0.75rem; text-decoration: underline;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function updateProductStock(productId, newStock) {
  try {
    const res = await adminFetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: Number(newStock) })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast('Stock level updated');
      await loadAdminProducts();
      await loadAdminStats();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to remove this coffee lot from the roastery catalog?')) return;
  try {
    const res = await adminFetch(`/api/products/${productId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast('Product lot removed');
      await loadAdminProducts();
      await loadAdminStats();
    }
  } catch (err) {
    console.error(err);
  }
}

// Add Product Modal & Image Handling
function openAddProductModal() {
  newProductImageBase64 = null;
  const wrap = document.getElementById('new-prod-preview-wrap');
  if (wrap) wrap.style.display = 'none';
  document.getElementById('add-product-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').classList.remove('active');
  document.body.style.overflow = '';
}

function previewNewProductFile(input) {
  const wrap = document.getElementById('new-prod-preview-wrap');
  const img = document.getElementById('new-prod-preview-img');
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      newProductImageBase64 = e.target.result;
      if (img) img.src = newProductImageBase64;
      if (wrap) wrap.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
}

async function handleAddProductSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-prod-name').value;
  const origin = document.getElementById('new-prod-origin').value;
  const price = document.getElementById('new-prod-price').value;
  const roastLevel = document.getElementById('new-prod-roast').value;
  const category = document.getElementById('new-prod-cat').value;
  const notes = document.getElementById('new-prod-notes').value;
  const stock = document.getElementById('new-prod-stock').value;

  const saveBtn = document.getElementById('btn-save-product');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'جاري حفظ المنتج ورفع الصورة...';
  }

  let imageUrl = '/assets/roast-1.jpg';

  try {
    // If user selected an image file, upload it (authenticated)
    if (newProductImageBase64) {
      const fileInput = document.getElementById('new-prod-file');
      const filename = (fileInput && fileInput.files[0]) ? fileInput.files[0].name : 'product.jpg';
      const upRes = await adminFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product',
          base64: newProductImageBase64,
          filename: filename
        })
      });
      const upData = await upRes.json();
      if (upData.success && upData.url) {
        imageUrl = upData.url;
      }
    }

    const res = await adminFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, origin, price, roastLevel, category, notes, stock,
        image: imageUrl
      })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast(`تمت إضافة المحصول الجديد: ${name}`);
      closeAddProductModal();
      e.target.reset();
      newProductImageBase64 = null;
      const wrap = document.getElementById('new-prod-preview-wrap');
      if (wrap) wrap.style.display = 'none';

      await loadAdminProducts();
      await loadAdminStats();
    } else {
      if (typeof showToast === 'function') showToast(data.error || 'Failed to add product');
    }
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast(err.message || 'Network error adding product');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = 'حفظ وإضافة إلى الكتالوج';
    }
  }
}

// Settings Form
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      const s = data.data;
      const p = s.paymentSettings || {};
      if (document.getElementById('setting-instapay')) {
        document.getElementById('setting-instapay').value = p.instapayId || 'typica@instapay';
      }
      if (document.getElementById('setting-wallet')) {
        document.getElementById('setting-wallet').value = p.walletNumber || '01099887766';
      }
      if (document.getElementById('setting-shipping')) {
        document.getElementById('setting-shipping').value = s.shippingFee !== undefined ? s.shippingFee : 95;
      }
      if (document.getElementById('setting-announcement')) {
        document.getElementById('setting-announcement').value = s.announcement || '';
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const instapayId = document.getElementById('setting-instapay').value.trim();
  const walletNumber = document.getElementById('setting-wallet').value.trim();
  const shippingFee = Number(document.getElementById('setting-shipping').value) || 95;
  const announcement = document.getElementById('setting-announcement').value.trim();

  try {
    const res = await adminFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shippingFee,
        announcement,
        paymentSettings: {
          walletNumber,
          walletName: 'فودافون كاش / المحافظ الإلكترونية',
          instapayId,
          instapayName: 'حساب إنستاباي الرسمي'
        }
      })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast('تم حفظ وتحديث أرقام الكاش وإنستاباي ومصاريف الشحن بنجاح!');
      if (typeof loadSettings === 'function') {
        loadSettings();
      }
    }
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast(err.message || 'خطأ أثناء حفظ الإعدادات');
  }
}

// Switch tabs inside admin
function switchAdminTab(tab) {
  const tabs = ['orders', 'products', 'settings'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const panel = document.getElementById(`admin-${t}-panel`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
}

// Global exports
window.initAdmin = initAdmin;
window.handleAdminLogin = handleAdminLogin;
window.handleAdminLogout = handleAdminLogout;
window.switchAdminTab = switchAdminTab;
window.openAddProductModal = openAddProductModal;
window.closeAddProductModal = closeAddProductModal;
window.handleAddProductSubmit = handleAddProductSubmit;
window.updateProductStock = updateProductStock;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;
window.previewNewProductFile = previewNewProductFile;
