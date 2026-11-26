import { ObjectId } from "mongodb";
import { canUseShop, currentIdentity, database, objectId, safeObjectId } from "../../../lib/inventory-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const numeric = (value, minimum = 1) => Number.isFinite(Number(value)) && Number(value) >= minimum;
const productUnits = new Set(["pcs", "g", "kg", "ml", "l"]);
const dayStart = () => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); return date; };
let indexPromise;

async function ensureIndexes(db) {
  if (!indexPromise) indexPromise = Promise.all([
    db.collection("shops").createIndex({ active: 1, name: 1 }),
    db.collection("products").createIndex({ sku: 1 }, { unique: true, sparse: true }),
    db.collection("products").createIndex({ barcode: 1 }, { unique: true, sparse: true }),
    db.collection("product_batches").createIndex({ shopId: 1, productId: 1, batchNumber: 1 }, { unique: true }),
    db.collection("product_batches").createIndex({ shopId: 1, expiryDate: 1 }),
    db.collection("purchases").createIndex({ shopId: 1, createdAt: -1 }),
    db.collection("sales").createIndex({ shopId: 1, createdAt: -1 }),
    db.collection("audit_logs").createIndex({ shopId: 1, createdAt: -1 }),
  ]);
  await indexPromise;
}

export async function GET(request) {
  try {
    const identity = await currentIdentity();
    if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const db = await database();
    await ensureIndexes(db);
    const url = new URL(request.url);
    const selectedShop = url.searchParams.get("shopId");
    if (selectedShop && !safeObjectId(selectedShop)) return Response.json({ error: "Invalid shop filter." }, { status: 400 });
    const assignedIds = identity.role === "SUPER_ADMIN" ? null : (identity.shopIds || []).map(String);
    const shopsQuery = identity.role === "SUPER_ADMIN" ? { ...(selectedShop ? { _id: safeObjectId(selectedShop) } : {}) } : { _id: { $in: assignedIds.map(safeObjectId).filter(Boolean) }, active: { $ne: false } };
    const shops = await db.collection("shops").find(shopsQuery).sort({ name: 1 }).limit(5000).toArray();
    const shopIds = identity.role === "SUPER_ADMIN" ? null : shops.map((shop) => shop._id.toString());
    if (selectedShop && identity.role === "EMPLOYEE" && !shopIds.includes(selectedShop)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const shopFilter = selectedShop ? { shopId: selectedShop } : shopIds ? { shopId: { $in: shopIds } } : {};
    const salesFilter = { ...shopFilter, createdAt: { $gte: dayStart() } };
    const [products, batches, purchasesToday, salesSummary, recentActivity, activeEmployees, pendingDispatches] = await Promise.all([
      db.collection("products").find({ active: { $ne: false } }).sort({ name: 1 }).limit(10000).toArray(),
      db.collection("product_batches").find({ ...shopFilter, active: { $ne: false } }).limit(10000).toArray(),
      db.collection("purchases").countDocuments({ ...shopFilter, createdAt: { $gte: dayStart() } }),
      db.collection("sales").aggregate([{ $match: salesFilter }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$total" } } }]).toArray(),
      identity.role === "SUPER_ADMIN" ? db.collection("audit_logs").find(selectedShop ? { shopId: selectedShop } : {}).sort({ createdAt: -1 }).limit(12).toArray() : db.collection("audit_logs").find({ ...shopFilter, actorId: identity.id }).sort({ createdAt: -1 }).limit(12).toArray(),
      identity.role === "SUPER_ADMIN" ? db.collection("employees").countDocuments({ active: true }) : Promise.resolve(0),
      identity.role === "SUPER_ADMIN" ? db.collection("stock_transfers").countDocuments({ status: { $in: ["PENDING", "DISPATCHED"] } }) : Promise.resolve(0),
    ]);
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));
    const shopNames = new Map(shops.map((shop) => [shop._id.toString(), shop.name]));
    const stockUnits = batches.reduce((sum, batch) => sum + (batch.availableQty || 0), 0);
    const stockValue = batches.reduce((sum, batch) => sum + (batch.availableQty || 0) * (batch.unitCost || 0), 0);
    const now = new Date();
    const expiryRows = batches.filter((batch) => batch.availableQty > 0 && batch.expiryDate).map((batch) => {
      const expiryDate = new Date(batch.expiryDate);
      const remainingDays = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
      return { ...batch, _id: batch._id.toString(), product: productMap.get(batch.productId)?.name || "Unknown product", category: productMap.get(batch.productId)?.category || "Other", shopName: shopNames.get(batch.shopId) || "Unknown shop", remainingDays, stockValue: batch.availableQty * (batch.unitCost || 0) };
    }).sort((a, b) => a.remainingDays - b.remainingDays);
    const expired = expiryRows.filter((batch) => batch.remainingDays < 0);
    const expiring = (days) => expiryRows.filter((batch) => batch.remainingDays >= 0 && batch.remainingDays <= days);
    const lowStock = products.filter((product) => {
      const total = batches.filter((batch) => batch.productId === product._id.toString()).reduce((sum, batch) => sum + (batch.availableQty || 0), 0);
      return total <= (product.lowStockThreshold || 10);
    });
    const salesMetric = salesSummary[0] || { count: 0, revenue: 0 };
    return Response.json({ shops, products: products.map((product) => ({ ...product, _id: product._id.toString() })), batches: batches.map((batch) => ({ ...batch, _id: batch._id.toString(), product: productMap.get(batch.productId)?.name || "Unknown product" })), expiryRows, activity: recentActivity.map((entry) => ({ ...entry, _id: entry._id.toString() })), metrics: { shopCount: shops.filter((shop) => shop.active !== false).length, employeeCount: activeEmployees, productCount: products.length, stockUnits, stockValue, purchasesToday, salesToday: salesMetric.count, revenueToday: salesMetric.revenue || 0, expiredCount: expired.length, expiring7Count: expiring(7).length, expiring15Count: expiring(15).length, expiring30Count: expiring(30).length, expiring60Count: expiring(60).length, expiring90Count: expiring(90).length, nearExpiryCount: expiring(30).length, lowStockCount: lowStock.length, pendingDispatches } });
  } catch (error) {
    console.error("Inventory overview failed:", error);
    return Response.json({ error: "Inventory data is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request) {
  const identity = await currentIdentity();
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const db = await database();
    await ensureIndexes(db);
    const shops = db.collection("shops");
    const products = db.collection("products");
    const batches = db.collection("product_batches");
    const audit = db.collection("audit_logs");
    const now = new Date();

    if (body.action === "create-shop") {
      if (identity.role !== "SUPER_ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 100) return Response.json({ error: "Shop name must be 2–100 characters." }, { status: 400 });
      const result = await shops.insertOne({ name, code: String(body.code || "").trim().toUpperCase(), address: String(body.address || "").trim(), active: true, createdAt: now, updatedAt: now });
      await audit.insertOne({ action: "SHOP_CREATED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId: result.insertedId.toString(), createdAt: now, changes: { name } });
      return Response.json({ ok: true, id: result.insertedId.toString() }, { status: 201 });
    }

    const shopId = String(body.shopId || "");
    if (!safeObjectId(shopId) || !await canUseShop(identity, shopId, body.action === "sale" ? "sales" : body.action === "purchase" ? "purchases" : "inventory")) return Response.json({ error: "Forbidden" }, { status: 403 });
    const shop = await shops.findOne({ _id: objectId(shopId), active: { $ne: false } });
    if (!shop) return Response.json({ error: "Shop not found or inactive." }, { status: 404 });

    if (body.action === "create-product-with-batch") {
      if (identity.role !== "SUPER_ADMIN" && !identity.permissions?.includes("inventory")) return Response.json({ error: "Forbidden" }, { status: 403 });
      const name = String(body.name || "").trim();
      const batchNumber = String(body.batchNumber || "").trim();
      const supplier = String(body.supplier || "").trim();
      const flavor = String(body.flavor || "").trim();
      const quantity = Number(body.quantity);
      const unitValue = Number(body.unitValue ?? 0);
      const unit = String(body.unit || "pcs");
      const unitPrice = Number(body.unitPrice);
      const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
      const manufacturingDate = body.manufacturingDate ? new Date(body.manufacturingDate) : null;
      if (name.length < 2 || name.length > 140 || !batchNumber || batchNumber.length > 60 || supplier.length > 120 || flavor.length > 100 || !Number.isInteger(quantity) || quantity < 0 || quantity > 1000000 || !numeric(unitValue, 0) || unitValue > 1000000 || !productUnits.has(unit) || !numeric(unitPrice, 0.01) || unitPrice > 10000000 || !expiryDate || Number.isNaN(expiryDate.getTime()) || expiryDate <= now || (manufacturingDate && (Number.isNaN(manufacturingDate.getTime()) || manufacturingDate > now || manufacturingDate >= expiryDate))) return Response.json({ error: "Enter a product name, batch code, valid quantity, price, unit, and future expiry date." }, { status: 400 });
      const productId = new ObjectId();
      const purchaseId = quantity > 0 ? new ObjectId() : null;
      const client = db.client;
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await products.insertOne({ _id: productId, name, category: "Supplements", flavor, unitValue, unit, unitPrice, lowStockThreshold: 10, active: true, createdAt: now, updatedAt: now }, { session });
          await batches.insertOne({ shopId, productId: productId.toString(), batchNumber, supplier, expiryDate, manufacturingDate, purchaseDate: now, unitCost: unitPrice, unitPrice, availableQty: quantity, purchasedQty: quantity, active: true, createdAt: now, updatedAt: now }, { session });
          await audit.insertOne({ action: "PRODUCT_CREATED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, createdAt: now, changes: { name, batchNumber, flavor, quantity, unitValue, unit, unitPrice } }, { session });
          if (purchaseId) {
            await db.collection("purchases").insertOne({ _id: purchaseId, shopId, productId: productId.toString(), batchNumber, quantity, unitCost: unitPrice, unitPrice, supplier, invoiceNumber: "", purchaseDate: now, paymentStatus: "unpaid", createdAt: now, actorId: identity.id, actorName: identity.name }, { session });
            await audit.insertOne({ action: "PURCHASE_RECORDED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, reference: purchaseId.toString(), createdAt: now, changes: { product: name, batchNumber, quantity, unitCost: unitPrice, stockChange: "created" } }, { session });
          }
        });
      } finally {
        await session.endSession();
      }
      return Response.json({ ok: true, id: productId.toString() }, { status: 201 });
    }

    if (body.action === "create-product") {
      if (identity.role !== "SUPER_ADMIN" && !identity.permissions?.includes("inventory")) return Response.json({ error: "Forbidden" }, { status: 403 });
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const sku = String(body.sku || "").trim().toUpperCase();
      if (name.length < 2 || name.length > 140 || !category || category.length > 80) return Response.json({ error: "Product name and category are required." }, { status: 400 });
      const unitPrice = Number(body.unitPrice);
      if (!numeric(unitPrice, 0.01) || unitPrice > 10000000) return Response.json({ error: "Enter a valid selling price." }, { status: 400 });
      const barcode = String(body.barcode || "").trim();
      const product = { name, category, ...(sku ? { sku } : {}), ...(barcode ? { barcode } : {}), brand: String(body.brand || "").trim(), unitPrice, lowStockThreshold: numeric(body.lowStockThreshold, 0) ? Number(body.lowStockThreshold) : 10, active: true, createdAt: now, updatedAt: now };
      const result = await products.insertOne(product);
      await audit.insertOne({ action: "PRODUCT_CREATED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, createdAt: now, changes: { name, category, sku } });
      return Response.json({ ok: true, id: result.insertedId.toString() }, { status: 201 });
    }

    if (body.action === "edit-product-batch") {
      if (identity.role !== "SUPER_ADMIN" && !identity.permissions?.includes("inventory")) return Response.json({ error: "Forbidden" }, { status: 403 });
      const productId = String(body.productId || "");
      const batchId = String(body.batchId || "");
      if (!safeObjectId(productId) || !safeObjectId(batchId)) return Response.json({ error: "Product or batch not found." }, { status: 404 });
      const product = await products.findOne({ _id: objectId(productId), active: { $ne: false } });
      const batch = await batches.findOne({ _id: objectId(batchId), productId, shopId, active: { $ne: false } });
      if (!product || !batch) return Response.json({ error: "Product or batch not found." }, { status: 404 });
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const sku = String(body.sku || "").trim().toUpperCase();
      const barcode = String(body.barcode || "").trim();
      const batchNumber = String(body.batchNumber || "").trim();
      const supplier = String(body.supplier || "").trim();
      const unitPrice = Number(body.unitPrice);
      const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
      const manufacturingDate = body.manufacturingDate ? new Date(body.manufacturingDate) : null;
      const flavor = String(body.flavor ?? product.flavor ?? "").trim();
      const unitValue = body.unitValue === undefined ? Number(product.unitValue || 0) : Number(body.unitValue);
      const unit = String(body.unit ?? product.unit ?? "pcs");
      if (name.length < 2 || name.length > 140 || !category || category.length > 80 || batchNumber.length < 1 || batchNumber.length > 60 || supplier.length > 120 || flavor.length > 100 || !numeric(unitValue, 0) || unitValue > 1000000 || !productUnits.has(unit) || !numeric(unitPrice, 0.01) || unitPrice > 10000000 || !expiryDate || Number.isNaN(expiryDate.getTime()) || (manufacturingDate && Number.isNaN(manufacturingDate.getTime())) || expiryDate <= new Date(batch.purchaseDate || batch.createdAt || 0) || (manufacturingDate && manufacturingDate >= expiryDate)) return Response.json({ error: "Enter valid product details, batch number, price, unit, and dates." }, { status: 400 });
      const productChanges = { name, category, brand: String(body.brand || "").trim().slice(0, 80), flavor, unitValue, unit, unitPrice, updatedAt: now };
      if (sku) productChanges.sku = sku;
      if (barcode) productChanges.barcode = barcode;
      await products.updateOne({ _id: product._id }, { $set: productChanges, $unset: { ...(sku ? {} : { sku: "" }), ...(barcode ? {} : { barcode: "" }) } });
      await batches.updateOne({ _id: batch._id }, { $set: { batchNumber, supplier, unitPrice, expiryDate, manufacturingDate, updatedAt: now } });
      await audit.insertOne({ action: "PRODUCT_BATCH_UPDATED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, createdAt: now, changes: { product: name, batchNumber, unitPrice } });
      return Response.json({ ok: true });
    }

    if (body.action === "archive-product-batch") {
      if (identity.role !== "SUPER_ADMIN" && !identity.permissions?.includes("inventory")) return Response.json({ error: "Forbidden" }, { status: 403 });
      const productId = String(body.productId || "");
      const batchId = String(body.batchId || "");
      if (!safeObjectId(productId) || !safeObjectId(batchId)) return Response.json({ error: "Product or batch not found." }, { status: 404 });
      const batch = await batches.findOne({ _id: objectId(batchId), productId, shopId, active: { $ne: false } });
      if (!batch) return Response.json({ error: "Product or batch not found." }, { status: 404 });
      if (Number(batch.availableQty || 0) > 0) return Response.json({ error: "This batch still has stock. Record its sale or transfer before deleting it." }, { status: 409 });
      const archived = await batches.updateOne({ _id: batch._id, availableQty: 0, active: { $ne: false } }, { $set: { active: false, archivedAt: now, updatedAt: now } });
      if (!archived.modifiedCount) return Response.json({ error: "Stock changed before the batch could be deleted. Refresh and try again." }, { status: 409 });
      await audit.insertOne({ action: "PRODUCT_BATCH_ARCHIVED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, createdAt: now, changes: { product: String(body.productName || "Product"), batchNumber: batch.batchNumber } });
      return Response.json({ ok: true });
    }

    if (body.action === "purchase") {
      const productId = String(body.productId || "");
      const quantity = Number(body.quantity);
      const unitCost = Number(body.unitCost);
      const enteredPrice = Number(body.unitPrice);
      const batchNumber = String(body.batchNumber || "").trim();
      const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
      const manufacturingDate = body.manufacturingDate ? new Date(body.manufacturingDate) : null;
      const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : now;
      const product = safeObjectId(productId) ? await products.findOne({ _id: objectId(productId), active: true }) : null;
      const unitPrice = numeric(enteredPrice, 0.01) ? enteredPrice : Number(product?.unitPrice);
      if (!safeObjectId(productId) || !numeric(quantity) || !Number.isInteger(quantity) || quantity > 1000000 || !numeric(unitCost, 0) || !numeric(unitPrice, 0.01) || !batchNumber || !expiryDate || Number.isNaN(expiryDate.getTime()) || Number.isNaN(purchaseDate.getTime()) || (manufacturingDate && Number.isNaN(manufacturingDate.getTime()))) return Response.json({ error: "Enter a whole quantity, prices, batch, and valid purchase, manufacture, and expiry dates." }, { status: 400 });
      if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
      if (purchaseDate > new Date(Date.now() + 86400000) || expiryDate <= purchaseDate || (manufacturingDate && (manufacturingDate > purchaseDate || manufacturingDate >= expiryDate))) return Response.json({ error: "Purchase, manufacturing, and expiry dates must be in chronological order." }, { status: 400 });
      const client = db.client;
      const session = client.startSession();
      let purchaseId;
      try {
        await session.withTransaction(async () => {
          const batchFilter = { shopId, productId, batchNumber };
          const existing = await batches.findOne(batchFilter, { session });
          if (existing && new Date(existing.expiryDate).getTime() !== expiryDate.getTime()) throw new Error("Batch number already exists with a different expiry date.");
          const priorPurchased = Number(existing?.purchasedQty || 0);
          const weightedCost = (priorPurchased * Number(existing?.unitCost || 0) + quantity * unitCost) / (priorPurchased + quantity);
          const result = await batches.updateOne(batchFilter, {
            $setOnInsert: { ...batchFilter, expiryDate, manufacturingDate, purchaseDate, unitPrice, supplier: String(body.supplier || "").trim(), createdAt: now },
            $inc: { availableQty: quantity, purchasedQty: quantity },
            $set: { unitCost: weightedCost, unitPrice, active: true, updatedAt: now },
          }, { upsert: true, session });
          purchaseId = new ObjectId();
          await db.collection("purchases").insertOne({ _id: purchaseId, shopId, productId, batchNumber, quantity, unitCost, unitPrice, supplier: String(body.supplier || "").trim(), invoiceNumber: String(body.invoiceNumber || "").trim(), purchaseDate, paymentStatus: String(body.paymentStatus || "unpaid"), createdAt: now, actorId: identity.id, actorName: identity.name }, { session });
          await audit.insertOne({ action: "PURCHASE_RECORDED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, reference: purchaseId.toString(), createdAt: now, changes: { product: product.name, batchNumber, quantity, unitCost, stockChange: result.modifiedCount ? "increased" : "created" } }, { session });
        });
      } finally { await session.endSession(); }
      return Response.json({ ok: true, id: purchaseId.toString() }, { status: 201 });
    }

    if (body.action === "sale") {
      const productId = String(body.productId || "");
      const quantity = Number(body.quantity);
      if (!safeObjectId(productId) || !numeric(quantity)) return Response.json({ error: "Product and a positive whole quantity are required." }, { status: 400 });
      if (!Number.isInteger(quantity)) return Response.json({ error: "Quantity must be a whole number." }, { status: 400 });
      const product = await products.findOne({ _id: objectId(productId), active: true });
      if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
      if (quantity > 1000000) return Response.json({ error: "Quantity exceeds the allowed limit." }, { status: 400 });
      const discount = Number(body.discount || 0);
      const taxPercent = Number(body.taxPercent || 0);
      const paymentMethod = String(body.paymentMethod || "cash");
      if (!numeric(discount, 0) || discount > 10000000 || !numeric(taxPercent, 0) || taxPercent > 28 || !["cash", "upi", "card", "bank"].includes(paymentMethod)) return Response.json({ error: "Invalid discount, tax, or payment method." }, { status: 400 });
      if (discount > 0 && identity.role !== "SUPER_ADMIN" && !identity.permissions?.includes("billing")) return Response.json({ error: "Discounts require billing permission." }, { status: 403 });
      const client = db.client;
      const session = client.startSession();
      let saleId;
      let invoiceNumber;
      let saleTotal = 0;
      try {
        await session.withTransaction(async () => {
          const eligible = await batches.find({ shopId, productId, availableQty: { $gt: 0 }, expiryDate: { $gt: now } }, { session }).sort({ expiryDate: 1, createdAt: 1 }).toArray();
          if (eligible.reduce((sum, batch) => sum + batch.availableQty, 0) < quantity) throw new Error("Insufficient unexpired stock.");
          let remaining = quantity;
          let subtotal = 0;
          for (const batch of eligible) {
            if (!remaining) break;
            const take = Math.min(remaining, batch.availableQty);
            const result = await batches.updateOne({ _id: batch._id, availableQty: { $gte: take } }, { $inc: { availableQty: -take, soldQty: take }, $set: { updatedAt: now } }, { session });
            if (!result.modifiedCount) throw new Error("Stock changed during sale; retry the transaction.");
            const unitPrice = Number(batch.unitPrice) || Number(product.unitPrice) || 0;
            subtotal += unitPrice * take;
            remaining -= take;
          }
          const taxableAmount = Math.max(0, subtotal - discount);
          const taxAmount = taxableAmount * taxPercent / 100;
          const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
          saleTotal = total;
          saleId = new ObjectId();
          invoiceNumber = `SS-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${saleId.toString().slice(-6).toUpperCase()}`;
          await db.collection("sales").insertOne({ _id: saleId, invoiceNumber, shopId, productId, quantity, subtotal, discount, taxPercent, taxAmount, total, customerName: String(body.customerName || "").trim().slice(0, 120), paymentMethod, createdAt: now, actorId: identity.id, actorName: identity.name }, { session });
          await audit.insertOne({ action: "SALE_COMPLETED", actorId: identity.id, actorName: identity.name, actorRole: identity.role, shopId, reference: saleId.toString(), createdAt: now, changes: { product: product.name, quantity, subtotal, discount, taxPercent, total, invoiceNumber } }, { session });
        });
      } finally { await session.endSession(); }
      return Response.json({ ok: true, id: saleId.toString(), invoiceNumber, total: saleTotal }, { status: 201 });
    }
    return Response.json({ error: "Unsupported inventory action." }, { status: 400 });
  } catch (error) {
    if (error?.code === 11000) return Response.json({ error: "That SKU, barcode, or shop batch already exists." }, { status: 409 });
    const status = /Insufficient|Stock changed|different expiry/.test(error.message) ? 409 : 500;
    if (status === 500) console.error("Inventory operation failed:", error);
    return Response.json({ error: status === 500 ? "Inventory operation could not be completed." : error.message }, { status });
  }
}
