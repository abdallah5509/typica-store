const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

let MongoClient = null;
try {
  MongoClient = require("mongodb").MongoClient;
} catch (e) {
  console.log("Note: mongodb npm package not installed. Using local fallback.");
}

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// MongoDB Atlas Connection URI
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://abdallahbody967_db_user:tr1AM0TbJQQ7kC94@cluster0.ugx6ylx.mongodb.net/typica?retryWrites=true&w=majority&appName=Cluster0";

let mongoClient = null;
let db = null;

async function initMongoDB() {
  if (!MongoClient || !MONGODB_URI) return;
  try {
    console.log("Connecting to MongoDB Atlas...");
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000
    });
    await mongoClient.connect();
    db = mongoClient.db("typica");
    console.log("✅ Successfully connected to MongoDB Atlas!");

    // Seed database if empty from store.json
    await seedMongoIfEmpty();
  } catch (err) {
    console.error("⚠️ MongoDB connection error:", err.message);
    console.log("Using JSON file fallback until MongoDB reconnects.");
    db = null;
  }
}

async function seedMongoIfEmpty() {
  if (!db) return;
  try {
    const prodCount = await db.collection("products").countDocuments();
    if (prodCount === 0 && fs.existsSync(DATA_FILE)) {
      const initial = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
      if (initial.products && initial.products.length > 0) {
        await db.collection("products").insertMany(initial.products);
      }
      if (initial.categories && initial.categories.length > 0) {
        await db.collection("categories").insertMany(initial.categories);
      }
      if (initial.settings) {
        await db.collection("settings").insertOne({ _id: "store_settings", ...initial.settings });
      }
      console.log("✅ Seeded initial products and settings to MongoDB.");
    }
  } catch (e) {
    console.error("Seeding check error:", e.message);
  }
}

// --- ADMIN AUTH ---
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1111";
const AUTH_SECRET = process.env.ADMIN_SECRET ||
  crypto.createHash("sha256").update(`typica::${ADMIN_USER}::${ADMIN_PASS}::secret`).digest("hex");
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function signToken(expiry) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(String(expiry)).digest("hex");
}

function createToken() {
  const expiry = Date.now() + TOKEN_TTL_MS;
  return `${expiry}.${signToken(expiry)}`;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function isValidToken(token) {
  if (!token || typeof token !== "string") return false;
  const [expiry, sig] = token.split(".");
  if (!expiry || !sig || Number(expiry) < Date.now()) return false;
  return safeEqual(sig, signToken(expiry));
}

function isAdminRequest(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return isValidToken(token);
}

// Brute-force protection: 5 wrong attempts per IP => locked for 15 minutes
const loginAttempts = new Map();
function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

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

// Fallback JSON helpers
function getFileStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return { products: [], orders: [], categories: [], settings: {} };
  }
}

function saveFileStore(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    return false;
  }
}

// Parse JSON body
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

// Send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data));
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS pre-flight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    return res.end();
  }

  // --- API ROUTES ---
  if (pathname.startsWith("/api/")) {

    // POST /api/admin/login
    if (pathname === "/api/admin/login" && method === "POST") {
      const ip = getClientIp(req);
      const rec = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
      if (rec.lockedUntil > Date.now()) {
        const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
        return sendJSON(res, 429, { success: false, error: `محاولات كثيرة خاطئة. حاول مرة أخرى بعد ${mins} دقيقة` });
      }
      try {
        const body = await parseBody(req);
        if (safeEqual(body.username || "", ADMIN_USER) && safeEqual(body.password || "", ADMIN_PASS)) {
          loginAttempts.delete(ip);
          return sendJSON(res, 200, { success: true, token: createToken() });
        }
        rec.count += 1;
        if (rec.count >= 5) {
          rec.lockedUntil = Date.now() + 15 * 60 * 1000;
          rec.count = 0;
        }
        loginAttempts.set(ip, rec);
        return sendJSON(res, 401, { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // GET /api/admin/verify
    if (pathname === "/api/admin/verify" && method === "GET") {
      return sendJSON(res, isAdminRequest(req) ? 200 : 401, { success: isAdminRequest(req) });
    }

    // Admin endpoint guard
    const needsAdmin =
      (pathname.startsWith("/api/products") && method !== "GET") ||
      (pathname === "/api/orders" && method === "GET") ||
      (/^\/api\/orders\/[^\/]+\/status$/.test(pathname)) ||
      (pathname === "/api/stats") ||
      (pathname === "/api/settings" && method !== "GET");
    if (needsAdmin && !isAdminRequest(req)) {
      return sendJSON(res, 401, { success: false, error: "Unauthorized - admin login required" });
    }

    // POST /api/upload
    if (pathname === "/api/upload" && method === "POST") {
      try {
        const body = await parseBody(req);
        if (body.type !== "receipt" && !isAdminRequest(req)) {
          return sendJSON(res, 401, { success: false, error: "Unauthorized - admin login required" });
        }
        if (!body.base64) {
          return sendJSON(res, 400, { success: false, error: "Image base64 is required" });
        }

        const matches = body.base64.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
        let buffer;
        let ext = ".jpg";
        let mimeType = "image/jpeg";
        if (matches) {
          mimeType = matches[1];
          if (mimeType.includes("png")) ext = ".png";
          else if (mimeType.includes("webp")) ext = ".webp";
          else if (mimeType.includes("gif")) ext = ".gif";
          else if (mimeType.includes("jpeg")) ext = ".jpg";
          buffer = Buffer.from(matches[2], "base64");
        } else {
          buffer = Buffer.from(body.base64, "base64");
        }

        if (body.filename && path.extname(body.filename)) {
          const fileExt = path.extname(body.filename).toLowerCase();
          if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(fileExt)) ext = fileExt;
        }

        const isReceipt = body.type === "receipt";
        const folder = isReceipt ? "receipts" : "uploads";
        const targetDir = isReceipt ? RECEIPTS_DIR : UPLOAD_DIR;

        const uniqueName = `${folder.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
        const targetPath = path.join(targetDir, uniqueName);

        // 1. Save to local disk
        try { fs.writeFileSync(targetPath, buffer); } catch (e) {}

        // 2. Save permanently to MongoDB collection (survives Render restarts)
        if (db) {
          try {
            await db.collection("uploads").insertOne({
              _id: uniqueName,
              folder,
              filename: uniqueName,
              mimeType,
              base64: body.base64,
              createdAt: new Date()
            });
          } catch (e) {
            console.error("Error saving image to MongoDB:", e.message);
          }
        }

        const publicUrl = `/assets/${folder}/${uniqueName}`;
        return sendJSON(res, 200, { success: true, url: publicUrl });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: "Upload failed: " + err.message });
      }
    }

    // GET /api/products
    if (pathname === "/api/products" && method === "GET") {
      try {
        let results = [];
        const category = parsedUrl.query.category;
        const search = parsedUrl.query.search;

        if (db) {
          const query = {};
          if (category && category !== "all") {
            query.$or = [{ category: category }, { collection: category }];
          }
          if (search) {
            query.$or = [
              { name: { $regex: search, $options: "i" } },
              { origin: { $regex: search, $options: "i" } },
              { notes: { $elemMatch: { $regex: search, $options: "i" } } }
            ];
          }
          results = await db.collection("products").find(query, { projection: { _id: 0 } }).toArray();
        } else {
          const store = getFileStore();
          results = store.products;
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
        }
        return sendJSON(res, 200, { success: true, count: results.length, data: results });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: err.message });
      }
    }

    // GET /api/products/:id
    const productMatch = pathname.match(/^\/api\/products\/([^\/]+)$/);
    if (productMatch && method === "GET") {
      const id = productMatch[1];
      if (db) {
        const prod = await db.collection("products").findOne({ id }, { projection: { _id: 0 } });
        if (!prod) return sendJSON(res, 404, { success: false, error: "Product not found" });
        return sendJSON(res, 200, { success: true, data: prod });
      } else {
        const store = getFileStore();
        const prod = store.products.find(p => p.id === id);
        if (!prod) return sendJSON(res, 404, { success: false, error: "Product not found" });
        return sendJSON(res, 200, { success: true, data: prod });
      }
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

        if (db) {
          await db.collection("products").insertOne({ ...newProduct });
        } else {
          const store = getFileStore();
          store.products.push(newProduct);
          saveFileStore(store);
        }
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
        delete body._id;

        if (db) {
          const r = await db.collection("products").updateOne({ id }, { $set: body });
          if (r.matchedCount === 0) return sendJSON(res, 404, { success: false, error: "Product not found" });
          const updated = await db.collection("products").findOne({ id }, { projection: { _id: 0 } });
          return sendJSON(res, 200, { success: true, data: updated });
        } else {
          const store = getFileStore();
          const index = store.products.findIndex(p => p.id === id);
          if (index === -1) return sendJSON(res, 404, { success: false, error: "Product not found" });
          store.products[index] = { ...store.products[index], ...body, id };
          saveFileStore(store);
          return sendJSON(res, 200, { success: true, data: store.products[index] });
        }
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // DELETE /api/products/:id
    if (productMatch && method === "DELETE") {
      const id = productMatch[1];
      if (db) {
        const r = await db.collection("products").deleteOne({ id });
        if (r.deletedCount === 0) return sendJSON(res, 404, { success: false, error: "Product not found" });
        return sendJSON(res, 200, { success: true, message: "Product deleted successfully" });
      } else {
        const store = getFileStore();
        const initialLength = store.products.length;
        store.products = store.products.filter(p => p.id !== id);
        if (store.products.length === initialLength) {
          return sendJSON(res, 404, { success: false, error: "Product not found" });
        }
        saveFileStore(store);
        return sendJSON(res, 200, { success: true, message: "Product deleted successfully" });
      }
    }

    // GET /api/categories
    if (pathname === "/api/categories" && method === "GET") {
      if (db) {
        const cats = await db.collection("categories").find({}, { projection: { _id: 0 } }).toArray();
        return sendJSON(res, 200, { success: true, data: cats });
      } else {
        const store = getFileStore();
        return sendJSON(res, 200, { success: true, data: store.categories });
      }
    }

    // GET /api/orders (Admin list)
    if (pathname === "/api/orders" && method === "GET") {
      if (db) {
        const orders = await db.collection("orders").find({}, { projection: { _id: 0 } }).sort({ date: -1 }).toArray();
        return sendJSON(res, 200, { success: true, count: orders.length, data: orders });
      } else {
        const store = getFileStore();
        const sorted = [...store.orders].sort((a, b) => new Date(b.date) - new Date(a.date));
        return sendJSON(res, 200, { success: true, count: sorted.length, data: sorted });
      }
    }

    // GET /api/orders/:id (Tracking)
    const orderMatch = pathname.match(/^\/api\/orders\/([^\/]+)$/);
    if (orderMatch && method === "GET") {
      const id = orderMatch[1].toUpperCase();
      if (db) {
        const order = await db.collection("orders").findOne({ id: { $regex: new RegExp(`^${id}$`, "i") } }, { projection: { _id: 0 } });
        if (!order) return sendJSON(res, 404, { success: false, error: `Order ${id} not found` });
        return sendJSON(res, 200, { success: true, data: order });
      } else {
        const store = getFileStore();
        const order = store.orders.find(o => o.id.toUpperCase() === id);
        if (!order) return sendJSON(res, 404, { success: false, error: `Order ${id} not found` });
        return sendJSON(res, 200, { success: true, data: order });
      }
    }

    // POST /api/orders (Customer checkout)
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

        let shippingFee = 95;
        if (db) {
          const s = await db.collection("settings").findOne({ _id: "store_settings" });
          if (s && s.shippingFee !== undefined) shippingFee = Number(s.shippingFee);
        } else {
          const store = getFileStore();
          if (store.settings && store.settings.shippingFee !== undefined) shippingFee = Number(store.settings.shippingFee);
        }

        const subtotal = body.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
        const total = subtotal + shippingFee;
        const paymentMethod = body.paymentMethod || "instapay";

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

        if (db) {
          await db.collection("orders").insertOne({ ...newOrder });
          for (const item of body.items) {
            await db.collection("products").updateOne(
              { id: item.id },
              { $inc: { stock: -(Number(item.quantity) || 1) } }
            );
          }
        } else {
          const store = getFileStore();
          body.items.forEach(item => {
            const product = store.products.find(p => p.id === item.id);
            if (product && product.stock !== undefined) {
              product.stock = Math.max(0, product.stock - (item.quantity || 1));
            }
          });
          store.orders.unshift(newOrder);
          saveFileStore(store);
        }

        return sendJSON(res, 201, { success: true, data: newOrder });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // PUT /api/orders/:id/status (Admin status update)
    const orderStatusMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/status$/);
    if (orderStatusMatch && method === "PUT") {
      try {
        const id = orderStatusMatch[1].toUpperCase();
        const body = await parseBody(req);
        const validStatuses = ["confirmed", "roasting", "quality_check", "dispatched", "delivered", "cancelled"];
        if (!validStatuses.includes(body.status)) {
          return sendJSON(res, 400, { success: false, error: `Invalid status. Choose from: ${validStatuses.join(", ")}` });
        }

        const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);
        const descMap = {
          confirmed: "Order confirmed",
          roasting: "Master roaster started batch profile",
          quality_check: "Cupping test passed and freshness nitrogen-flushed",
          dispatched: "Handed over to express courier",
          delivered: "Delivered to customer address",
          cancelled: "Order cancelled"
        };
        const statusEntry = {
          status: body.status,
          time: nowStr,
          desc: body.desc || descMap[body.status]
        };

        if (db) {
          const r = await db.collection("orders").updateOne(
            { id: { $regex: new RegExp(`^${id}$`, "i") } },
            {
              $set: { status: body.status },
              $push: { statusHistory: statusEntry }
            }
          );
          if (r.matchedCount === 0) return sendJSON(res, 404, { success: false, error: "Order not found" });
          const updated = await db.collection("orders").findOne({ id: { $regex: new RegExp(`^${id}$`, "i") } }, { projection: { _id: 0 } });
          return sendJSON(res, 200, { success: true, data: updated });
        } else {
          const store = getFileStore();
          const order = store.orders.find(o => o.id.toUpperCase() === id);
          if (!order) return sendJSON(res, 404, { success: false, error: "Order not found" });
          order.status = body.status;
          order.statusHistory.push(statusEntry);
          saveFileStore(store);
          return sendJSON(res, 200, { success: true, data: order });
        }
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // GET /api/stats (Admin analytics)
    if (pathname === "/api/stats" && method === "GET") {
      let orders = [];
      let products = [];
      if (db) {
        orders = await db.collection("orders").find({}, { projection: { total: 1, status: 1, id: 1, customer: 1, date: 1 } }).toArray();
        products = await db.collection("products").find({}, { projection: { stock: 1 } }).toArray();
      } else {
        const store = getFileStore();
        orders = store.orders || [];
        products = store.products || [];
      }

      const totalRevenue = orders
        .filter(o => o.status !== "cancelled")
        .reduce((sum, o) => sum + (o.total || 0), 0);
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;
      const lowStockProducts = products.filter(p => p.stock !== undefined && p.stock <= 20);

      return sendJSON(res, 200, {
        success: true,
        data: {
          totalRevenue: totalRevenue.toFixed(2),
          totalOrders,
          avgOrderValue,
          totalProducts: products.length,
          lowStockCount: lowStockProducts.length,
          recentOrders: orders.slice(0, 5)
        }
      });
    }

    // GET & PUT /api/settings
    if (pathname === "/api/settings") {
      if (method === "GET") {
        if (db) {
          const s = await db.collection("settings").findOne({ _id: "store_settings" });
          return sendJSON(res, 200, { success: true, data: s || {} });
        } else {
          const store = getFileStore();
          return sendJSON(res, 200, { success: true, data: store.settings });
        }
      }
      if (method === "PUT") {
        const body = await parseBody(req);
        delete body._id;
        if (db) {
          await db.collection("settings").updateOne(
            { _id: "store_settings" },
            { $set: body },
            { upsert: true }
          );
          const updated = await db.collection("settings").findOne({ _id: "store_settings" });
          return sendJSON(res, 200, { success: true, data: updated });
        } else {
          const store = getFileStore();
          store.settings = { ...store.settings, ...body };
          saveFileStore(store);
          return sendJSON(res, 200, { success: true, data: store.settings });
        }
      }
    }

    return sendJSON(res, 404, { success: false, error: "API endpoint not found" });
  }

  // --- STATIC FILE SERVING WITH MONGODB IMAGE FALLBACK ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "/index.html";
  }

  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + ".html")) {
      filePath += ".html";
    } else {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }
  }

  // Check if file exists on disk
  fs.stat(filePath, async (err, stats) => {
    if (err || !stats.isFile()) {

      // If an uploaded image isn't found on disk, try recovering it from MongoDB uploads collection!
      const uploadMatch = pathname.match(/^\/assets\/(uploads|receipts)\/([^\/]+)$/);
      if (uploadMatch && db) {
        try {
          const filename = uploadMatch[2];
          const doc = await db.collection("uploads").findOne({ _id: filename });
          if (doc && doc.base64) {
            const matches = doc.base64.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
            const mime = doc.mimeType || (matches ? matches[1] : "image/jpeg");
            const buf = Buffer.from(matches ? matches[2] : doc.base64, "base64");
            res.writeHead(200, {
              "Content-Type": mime,
              "Cache-Control": "public, max-age=86400"
            });
            return res.end(buf);
          }
        } catch (e) {
          console.error("MongoDB image recovery error:", e.message);
        }
      }

      // Return index.html for SPA routes
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

// Start server and initialize MongoDB connection
initMongoDB().then(() => {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`☕ Typica Specialty Coffee Server Running!`);
    console.log(`🌐 Local URL:   http://localhost:${PORT}`);
    console.log(`📊 Admin Panel: http://localhost:${PORT}/#admin`);
    console.log(`🚚 Track Order: http://localhost:${PORT}/#track`);
    console.log(`🗄️ Database:    ${db ? "MongoDB Atlas (Cloud Connected)" : "Local JSON Store"}`);
    console.log(`====================================================`);
  });
});
