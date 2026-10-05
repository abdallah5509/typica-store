const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// Ensure upload folders exist
const UPLOAD_DIR = path.join(PUBLIC_DIR, "assets", "uploads");
const RECEIPTS_DIR = path.join(PUBLIC_DIR, "assets", "receipts");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

// MIME types dictionary
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

// Read store helper
function getStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading database:", err);
    return { products: [], orders: [], categories: [], settings: {} };
  }
}

// Write store helper
function saveStore(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error saving database:", err);
    return false;
  }
}

// Helper to parse JSON body (supports larger image payloads)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) { // 20MB limit
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS pre-flight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // --- API ROUTES ---
  if (pathname.startsWith("/api/")) {
    const store = getStore();

    // POST /api/upload (Upload image via base64 for product photos or payment receipts)
    if (pathname === "/api/upload" && method === "POST") {
      try {
        const body = await parseBody(req);
        if (!body.base64) {
          return sendJSON(res, 400, { success: false, error: "Image base64 is required" });
        }

        const matches = body.base64.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
        let buffer;
        let ext = ".jpg";
        if (matches) {
          const mime = matches[1];
          if (mime.includes("png")) ext = ".png";
          else if (mime.includes("webp")) ext = ".webp";
          else if (mime.includes("gif")) ext = ".gif";
          else if (mime.includes("jpeg")) ext = ".jpg";
          buffer = Buffer.from(matches[2], "base64");
        } else {
          buffer = Buffer.from(body.base64, "base64");
        }

        if (body.filename && path.extname(body.filename)) {
          ext = path.extname(body.filename);
        }

        const isReceipt = body.type === "receipt";
        const folder = isReceipt ? "receipts" : "uploads";
        const targetDir = isReceipt ? RECEIPTS_DIR : UPLOAD_DIR;

        const uniqueName = `${folder.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
        const targetPath = path.join(targetDir, uniqueName);
        fs.writeFileSync(targetPath, buffer);

        const publicUrl = `/assets/${folder}/${uniqueName}`;
        return sendJSON(res, 200, { success: true, url: publicUrl });
      } catch (err) {
        console.error("Upload error:", err);
        return sendJSON(res, 500, { success: false, error: "Upload failed: " + err.message });
      }
    }

    // GET /api/products
    if (pathname === "/api/products" && method === "GET") {
      let results = store.products;
      const category = parsedUrl.query.category;
      const search = parsedUrl.query.search;

      if (category && category !== "all") {
        results = results.filter(p => p.category === category || p.collection === category);
      }
      if (search) {
        const q = search.toLowerCase();
        results = results.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.origin.toLowerCase().includes(q) ||
          (p.notes && p.notes.some(n => n.toLowerCase().includes(q)))
        );
      }
      return sendJSON(res, 200, { success: true, count: results.length, data: results });
    }

    // GET /api/products/:id
    const productMatch = pathname.match(/^\/api\/products\/([^\/]+)$/);
    if (productMatch && method === "GET") {
      const id = productMatch[1];
      const product = store.products.find(p => p.id === id);
      if (!product) return sendJSON(res, 404, { success: false, error: "Product not found" });
      return sendJSON(res, 200, { success: true, data: product });
    }

    // POST /api/products (Admin create)
    if (pathname === "/api/products" && method === "POST") {
      try {
        const body = await parseBody(req);
        if (!body.name || !body.price) {
          return sendJSON(res, 400, { success: false, error: "Name and price are required" });
        }
        const newProduct = {
          id: "p_" + Date.now(),
          name: body.name,
          origin: body.origin || "Specialty Single Lot",
          process: body.process || "Washed",
          roastLevel: Number(body.roastLevel) || 2,
          roastLabel: body.roastLabel || "Medium",
          price: Number(body.price),
          category: body.category || "single-origin",
          collection: body.collection || "new-arrivals",
          notes: Array.isArray(body.notes) ? body.notes : (body.notes ? body.notes.split(",").map(n => n.trim()) : ["Fruity", "Caramel"]),
          image: body.image || "/assets/roast-1.jpg",
          badge: body.badge || "New",
          stock: Number(body.stock) || 20,
          description: body.description || "Freshly roasted specialty coffee lot.",
          cuppingScore: Number(body.cuppingScore) || 87.0
        };
        store.products.push(newProduct);
        saveStore(store);
        return sendJSON(res, 201, { success: true, data: newProduct });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // PUT /api/products/:id (Admin update)
    if (productMatch && method === "PUT") {
      try {
        const id = productMatch[1];
        const body = await parseBody(req);
        const index = store.products.findIndex(p => p.id === id);
        if (index === -1) return sendJSON(res, 404, { success: false, error: "Product not found" });

        store.products[index] = { ...store.products[index], ...body, id };
        saveStore(store);
        return sendJSON(res, 200, { success: true, data: store.products[index] });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // DELETE /api/products/:id
    if (productMatch && method === "DELETE") {
      const id = productMatch[1];
      const initialLength = store.products.length;
      store.products = store.products.filter(p => p.id !== id);
      if (store.products.length === initialLength) {
        return sendJSON(res, 404, { success: false, error: "Product not found" });
      }
      saveStore(store);
      return sendJSON(res, 200, { success: true, message: "Product deleted successfully" });
    }

    // GET /api/categories
    if (pathname === "/api/categories" && method === "GET") {
      return sendJSON(res, 200, { success: true, data: store.categories });
    }

    // GET /api/orders
    if (pathname === "/api/orders" && method === "GET") {
      const sorted = [...store.orders].sort((a, b) => new Date(b.date) - new Date(a.date));
      return sendJSON(res, 200, { success: true, count: sorted.length, data: sorted });
    }

    // GET /api/orders/:id (Order tracking / details)
    const orderMatch = pathname.match(/^\/api\/orders\/([^\/]+)$/);
    if (orderMatch && method === "GET") {
      const id = orderMatch[1].toUpperCase();
      const order = store.orders.find(o => o.id.toUpperCase() === id);
      if (!order) return sendJSON(res, 404, { success: false, error: `Order ${id} not found` });
      return sendJSON(res, 200, { success: true, data: order });
    }

    // POST /api/orders (Create order from checkout)
    if (pathname === "/api/orders" && method === "POST") {
      try {
        const body = await parseBody(req);
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
          return sendJSON(res, 400, { success: false, error: "Order must contain at least one item" });
        }
        if (!body.customer || !body.customer.name || !body.customer.phone) {
          return sendJSON(res, 400, { success: false, error: "Customer name and phone number are required" });
        }

        const now = new Date();
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const orderId = `TYP-${randNum}`;

        const subtotal = body.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
        const shippingFee = Number(store.settings.shippingFee) || 95;
        const total = subtotal + shippingFee;
        const paymentMethod = body.paymentMethod || "instapay"; // 'cod', 'instapay', 'wallet'
        
        let shippingDepositPaid = 0;
        let codAmount = total;
        let statusDesc = "";

        if (paymentMethod === "cod") {
          shippingDepositPaid = 0;
          codAmount = total;
          statusDesc = `تم تسجيل الطلب - الدفع عند الاستلام نقداً بالكامل للمندوب (إجمالي التحصيل: ${codAmount} ج.م)`;
        } else {
          shippingDepositPaid = Number(body.shippingDeposit) || shippingFee;
          codAmount = subtotal;
          statusDesc = `تم تسجيل الطلب - تم تحويل 95 ج.م مصاريف شحن عبر ${paymentMethod === 'instapay' ? 'إنستاباي' : 'المحفظة الإلكترونية'} (المتبقي عند الاستلام: ${codAmount} ج.م)`;
        }

        const newOrder = {
          id: orderId,
          date: now.toISOString(),
          customer: {
            name: body.customer.name,
            email: body.customer.email || "",
            phone: body.customer.phone || "",
            phone2: body.customer.phone2 || "",
            governorate: body.customer.governorate || "القاهرة",
            city: body.customer.city || "",
            address: body.customer.address || ""
          },
          items: body.items,
          subtotal,
          shipping: shippingFee,
          total,
          shippingDepositPaid,
          codAmount,
          paymentMethod,
          senderNumber: body.senderNumber || "",
          receiptImage: body.receiptImage || "",
          transferNote: body.transferNote || "",
          status: "confirmed",
          statusHistory: [
            {
              status: "confirmed",
              time: now.toISOString().replace("T", " ").substring(0, 16),
              desc: statusDesc
            }
          ]
        };

        // Deduct stock
        body.items.forEach(item => {
          const product = store.products.find(p => p.id === item.id);
          if (product && product.stock !== undefined) {
            product.stock = Math.max(0, product.stock - (item.quantity || 1));
          }
        });

        store.orders.unshift(newOrder);
        saveStore(store);

        return sendJSON(res, 201, { success: true, data: newOrder });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // PUT /api/orders/:id/status (Admin change order status)
    const orderStatusMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/status$/);
    if (orderStatusMatch && method === "PUT") {
      try {
        const id = orderStatusMatch[1].toUpperCase();
        const body = await parseBody(req);
        const order = store.orders.find(o => o.id.toUpperCase() === id);
        if (!order) return sendJSON(res, 404, { success: false, error: "Order not found" });

        const validStatuses = ["confirmed", "roasting", "quality_check", "dispatched", "delivered", "cancelled"];
        if (!validStatuses.includes(body.status)) {
          return sendJSON(res, 400, { success: false, error: `Invalid status. Choose from: ${validStatuses.join(", ")}` });
        }

        order.status = body.status;
        const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);
        const descMap = {
          confirmed: "Order confirmed",
          roasting: "Master roaster started batch profile",
          quality_check: "Cupping test passed and freshness nitrogen-flushed",
          dispatched: "Handed over to express courier",
          delivered: "Delivered to customer address",
          cancelled: "Order cancelled"
        };
        order.statusHistory.push({
          status: body.status,
          time: nowStr,
          desc: body.desc || descMap[body.status]
        });

        saveStore(store);
        return sendJSON(res, 200, { success: true, data: order });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // GET /api/stats (Admin analytics)
    if (pathname === "/api/stats" && method === "GET") {
      const orders = store.orders || [];
      const totalRevenue = orders
        .filter(o => o.status !== "cancelled")
        .reduce((sum, o) => sum + (o.total || 0), 0);
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;
      const lowStockProducts = store.products.filter(p => p.stock !== undefined && p.stock <= 20);

      return sendJSON(res, 200, {
        success: true,
        data: {
          totalRevenue: totalRevenue.toFixed(2),
          totalOrders,
          avgOrderValue,
          totalProducts: store.products.length,
          lowStockCount: lowStockProducts.length,
          recentOrders: orders.slice(0, 5)
        }
      });
    }

    // GET & PUT /api/settings
    if (pathname === "/api/settings") {
      if (method === "GET") {
        return sendJSON(res, 200, { success: true, data: store.settings });
      }
      if (method === "PUT") {
        const body = await parseBody(req);
        store.settings = { ...store.settings, ...body };
        saveStore(store);
        return sendJSON(res, 200, { success: true, data: store.settings });
      }
    }

    // Fallback 404 for unknown /api
    return sendJSON(res, 404, { success: false, error: "API endpoint not found" });
  }

  // --- STATIC FILE SERVING ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "/index.html";
  }

  let filePath = path.join(PUBLIC_DIR, safePath);

  // If path doesn't have an extension, try checking if it's an SPA route or html
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + ".html")) {
      filePath += ".html";
    } else {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Return index.html for SPA client-side routes
      const fallback = path.join(PUBLIC_DIR, "index.html");
      if (fs.existsSync(fallback)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return fs.createReadStream(fallback).pipe(res);
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`☕ Typica Specialty Coffee Server Running!`);
  console.log(`🌐 Local URL:   http://localhost:${PORT}`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/#admin`);
  console.log(`🚚 Track Order: http://localhost:${PORT}/#track`);
  console.log(`====================================================`);
});
