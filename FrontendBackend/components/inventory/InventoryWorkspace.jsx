"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Boxes, Building2, ChevronDown, CircleDollarSign, ClipboardList, LogOut, Package, Pencil, Plus, Search, ShoppingCart, Trash2, Users, X } from "lucide-react";
import InventoryLoadingBackdrop from "./InventoryLoadingBackdrop.jsx";
import { PageLoadingIndicator } from "../page-refresh-overlay.jsx";

const fetcher = async (url) => { const response = await fetch(url, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load inventory."); return data; };
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(amount) || 0);
const dayLabel = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

const navItems = [
    { id: "overview", label: "Shop Dashboard", icon: Boxes },
,
  { id: "shops", label: "Shops", icon: Building2, admin: true },
  { id: "employees", label: "Employees", icon: Users, admin: true },
  { id: "transfers", label: "Transfers", icon: ArrowLeftRight, admin: true },
  { id: "inventory", label: "Products", icon: Package },
  { id: "billing", label: "Billing", icon: CircleDollarSign, admin: true },
  { id: "expiry", label: "Expiry", icon: AlertTriangle },
  { id: "transactions", label: "Activity", icon: Activity }
];

export default function InventoryWorkspace({ user, onSignOut }) {
  const [section, setSection] = useState("overview");
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const [shopId, setShopId] = useState("");
  const [query, setQuery] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("30");
  const [auditPage, setAuditPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [dialog, setDialog] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const [selectedProductBatch, setSelectedProductBatch] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");
  const [noticeVersion, setNoticeVersion] = useState(0);
  const [dataErrorDismissed, setDataErrorDismissed] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  function showNotification(message, type = "success") {
    if (!message) {
      setNotice("");
      return;
    }
    setNoticeType(type);
    setNotice(message);
    setNoticeVersion((version) => version + 1);
  }
  const { data, error, isLoading, mutate } = useSWR(`/api/inventory${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`, fetcher, { revalidateOnFocus: true });

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 6500);
    return () => window.clearTimeout(timer);
  }, [notice, noticeVersion]);

  useEffect(() => {
    if (!error) {
      setDataErrorDismissed(false);
      return undefined;
    }
    setDataErrorDismissed(false);
    const timer = window.setTimeout(() => setDataErrorDismissed(true), 6500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const { data: employeeData, mutate: mutateEmployees } = useSWR(section === "employees" && user.role === "SUPER_ADMIN" ? "/api/employees" : null, fetcher, { revalidateOnFocus: true });
  const { data: transferData, mutate: mutateTransfers } = useSWR(section === "transfers" && user.role === "SUPER_ADMIN" ? "/api/transfers" : null, fetcher, { revalidateOnFocus: true });
  const { data: auditData } = useSWR(section === "transactions" && user.role === "SUPER_ADMIN" ? `/api/audit?page=${auditPage}${shopId ? `&shopId=${encodeURIComponent(shopId)}` : ""}` : null, fetcher, { revalidateOnFocus: true });
  const { data: salesData, error: salesError, isLoading: salesLoading } = useSWR(section === "billing" && (user.role === "SUPER_ADMIN" || user.permissions?.some((permission) => ["sales", "billing"].includes(permission))) ? `/api/sales?page=${salesPage}${shopId ? `&shopId=${encodeURIComponent(shopId)}` : ""}${salesFrom ? `&from=${salesFrom}` : ""}${salesTo ? `&to=${salesTo}` : ""}` : null, fetcher, { revalidateOnFocus: true });
  const sales = salesData?.sales || [];
  const transfers = transferData?.transfers || [];
  const employees = employeeData?.employees || [];
  const shops = data?.shops || [];
  const products = data?.products || [];
  const batches = data?.batches || [];
  const expiryRows = data?.expiryRows || [];
  const filteredExpiry = expiryRows.filter((batch) => expiryFilter === "expired" ? batch.remainingDays < 0 : batch.remainingDays >= 0 && batch.remainingDays <= Number(expiryFilter));
  const activity = data?.activity || [];
  const visibleActivity = user.role === "SUPER_ADMIN" ? auditData?.logs || [] : activity;
  const metrics = data?.metrics || {};
  const activeShop = shops.find((shop) => shop._id === shopId);
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.sku || ""} ${product.category || ""} ${product.barcode || ""} ${product.brand || ""} ${product.flavor || ""} ${product.unitValue || ""} ${product.unit || ""}`.toLowerCase().includes(query.toLowerCase()) || batches.some((batch) => batch.productId === product._id && `${batch.batchNumber || ""} ${batch.supplier || ""}`.toLowerCase().includes(query.toLowerCase()))), [products, batches, query]);
  const visibleNav = navItems.filter((item) => !item.admin || user.role === "SUPER_ADMIN" || (item.id === "billing" && user.permissions?.some((permission) => ["sales", "billing"].includes(permission))));
  const canManageInventory = user.role === "SUPER_ADMIN" || user.permissions?.includes("inventory") === true;

  async function submitAction(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.action = dialog === "create-product" ? "create-product-with-batch" : dialog === "transfer" ? "create" : dialog === "edit-employee" ? "update" : dialog;
    if (dialog === "edit-product-batch") {
      payload.productId = selectedProductBatch?.product._id;
      payload.batchId = selectedProductBatch?.batch._id;
      payload.shopId = selectedProductBatch?.batch.shopId;
      payload.unitPrice = Number(payload.unitPrice);
    }
    if (dialog === "edit-shop") payload.id = selectedShop?._id;
    else if (dialog === "create-employee" || dialog === "edit-employee") {
      payload.shopIds = form.getAll("shopIds");
      payload.permissions = form.getAll("permissions");
      if (dialog === "edit-employee") payload.id = selectedEmployee?._id;
    } else if (dialog !== "create-shop" && dialog !== "edit-product-batch") payload.shopId = shopId || shops[0]?._id || "";
    if (payload.quantity !== undefined && payload.quantity !== "") payload.quantity = Number(payload.quantity);
    if (payload.unitCost) payload.unitCost = Number(payload.unitCost);
    if (payload.unitPrice) payload.unitPrice = Number(payload.unitPrice);
    if (payload.unitValue !== undefined && payload.unitValue !== "") payload.unitValue = Number(payload.unitValue);
    setBusy(true);
    showNotification("");
    setDialogError("");
    try {
      const isEmployee = dialog === "create-employee" || dialog === "edit-employee";
      const isTransfer = dialog === "transfer";
      const employeeEdit = dialog === "edit-employee";
      const shopEdit = dialog === "edit-shop";
      const response = await fetch(isEmployee ? "/api/employees" : isTransfer ? "/api/transfers" : shopEdit ? "/api/shops" : "/api/inventory", { method: employeeEdit || shopEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The operation could not be completed.");
      setDialog("");
      setSelectedEmployee(null);
      setSelectedShop(null);
      setSelectedProductBatch(null);
      showNotification(shopEdit ? "Shop details updated." : employeeEdit ? "Employee details updated." : dialog === "edit-product-batch" ? "Product and batch details updated." : dialog === "create-product" ? "Product and opening batch added." : isEmployee ? (result.inviteSent ? "Employee created. The setup invitation was emailed." : `Employee created. Email delivery is unavailable; share this one-time setup link securely: ${result.inviteUrl}`) : isTransfer ? `Transfer ${result.reference} created. Dispatch it when ready.` : "Changes saved.");
      await mutate();
      if (isEmployee) await mutateEmployees();
      if (isTransfer) await mutateTransfers();
    } catch (requestError) {
      setDialogError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function archiveProductBatch(product, batch) {
    if (Number(batch.availableQty || 0) > 0) {
      showNotification("This batch still has stock. Record a sale or transfer before deleting it.", "warning");
      return;
    }
    showNotification("");
    setArchiveTarget({ product, batch });
  }

  async function confirmArchiveProductBatch() {
    if (!archiveTarget || busy) return;
    const { product, batch } = archiveTarget;
    setBusy(true);
    showNotification("");
    try {
      const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive-product-batch", productId: product._id, productName: product.name, batchId: batch._id, shopId: batch.shopId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The batch could not be deleted.");
      setArchiveTarget(null);
      showNotification(result.productArchived ? "Product deleted from the active catalogue; audit history was retained." : "Batch deleted from active inventory; audit history was retained.");
      await mutate();
    } catch (requestError) {
      setArchiveTarget(null);
      showNotification(requestError.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function transferAction(transfer, action) {
    const label = action === "dispatch" ? "dispatch" : action === "receive" ? "confirm receipt" : "cancel";
    if (!window.confirm(`Are you sure you want to ${label} transfer ${transfer.reference}?`)) return;
    setBusy(true);
    showNotification("");
    try {
      const response = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: transfer._id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transfer update failed.");
      showNotification(`Transfer ${transfer.reference} updated.`);
      await mutateTransfers();
      await mutate();
    } catch (requestError) { showNotification(requestError.message, "error"); }
    finally { setBusy(false); }
  }

  async function shopAction(shop) {
    const active = shop.active === false;
    if (!active && !window.confirm(`Deactivate ${shop.name}? Employees will no longer be able to record stock for this location.`)) return;
    setBusy(true);
    showNotification("");
    try {
      const response = await fetch("/api/shops", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shop._id, active }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Shop update failed.");
      showNotification(active ? "Shop activated." : "Shop deactivated.");
      await mutate();
    } catch (requestError) { showNotification(requestError.message, "error"); }
    finally { setBusy(false); }
  }

  function exportExpiryRows() {
    const columns = ["Product", "Category", "Shop", "Batch", "Available quantity", "Expiry date", "Remaining days", "Purchase price", "Stock value"];
    const rows = filteredExpiry.map((batch) => [batch.product, batch.category, batch.shopName, batch.batchNumber, batch.availableQty, batch.expiryDate, batch.remainingDays, batch.unitCost, batch.stockValue]);
    const csv = [columns, ...rows].map((row) => row.map((value) => {
      const text = String(value ?? "");
      const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ss-supplement-expiry-${expiryFilter}days.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function employeeAction(employee, action) {
    if (action === "deactivate" && !window.confirm(`Deactivate ${employee.name}? Their active sessions will be revoked.`)) return;
    setBusy(true);
    showNotification("");
    try {
      const response = await fetch("/api/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: employee._id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Employee update failed.");
      showNotification(action === "reset-password" ? (result.inviteSent ? "Password setup link emailed." : `Email delivery unavailable; share this one-time setup link securely: ${result.inviteUrl}`) : "Employee record updated.");
      await mutateEmployees();
    } catch (requestError) { showNotification(requestError.message, "error"); }
    finally { setBusy(false); }
  }

  if (isLoading) {
    return <><InventoryLoadingBackdrop /><PageLoadingIndicator label="Loading dashboard data…" /></>;
  }

  return (
    <div className={`inventory-shell ${user.role === "EMPLOYEE" ? "employee-shell" : ""}`}>
      <aside className="inventory-sidebar">
        <a className="inventory-brand" href="/inventory" aria-label="SS Supplement operations home"><span className="brand-monogram">SS</span><span><strong>SS SUPPLEMENT</strong><small>STORE OPERATIONS</small></span></a>
        <div className="side-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Operations navigation">{visibleNav.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} type="button" onClick={() => setSection(id)}><Icon size={17} />{label}{id === "inventory" && metrics.lowStockCount > 0 && <em>{metrics.lowStockCount}</em>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="shop-selector-label">ACTIVE LOCATION</div><label className="shop-select-wrap"><Building2 size={15} /><select aria-label="Choose shop" value={shopId} onChange={(event) => { setShopId(event.target.value); setAuditPage(1); setSalesPage(1); }}><option value="">{user.role === "SUPER_ADMIN" ? "All shops" : "Assigned shops"}</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select><ChevronDown size={14} /></label><div className="sidebar-user"><span className="user-avatar">{(user.name || "S").slice(0, 1).toUpperCase()}</span><span className="user-meta"><strong>{user.name}</strong><small>{user.role === "SUPER_ADMIN" ? "Super Admin" : activeShop?.name || "Shop Employee"}</small></span><button className="icon-button" onClick={onSignOut} type="button" aria-label="Sign out"><LogOut size={16} /></button></div></div>
      </aside>

      <main className="inventory-main">
        <header className="inventory-topbar"><div className="crumb">SS Supplement <span>/</span> <strong>{visibleNav.find((item) => item.id === section)?.label || "Overview"}</strong></div><div className="topbar-actions"><span className="secure-indicator"><i /> Secure workspace</span><div className="inventory-account-wrap" ref={accountRef}><button className="inventory-account-button" type="button" aria-expanded={accountOpen} aria-controls="inventory-account-menu" onClick={() => setAccountOpen((open) => !open)}><span><strong>{user.name || user.email || "Your account"}</strong><small>Product workspace</small></span><ChevronDown size={17} aria-hidden="true" /></button>{accountOpen && <div className="inventory-account-menu" id="inventory-account-menu"><p className="inventory-account-label">Your account</p><a href="/" onClick={() => setAccountOpen(false)}>Home</a><a href="/inventory" onClick={() => setAccountOpen(false)}>Dashboard</a><a href="/workspace#profile" onClick={() => setAccountOpen(false)}>Profile</a><a href="/workspace#settings" onClick={() => setAccountOpen(false)}>Settings</a><button className="inventory-account-signout" type="button" onClick={() => { setAccountOpen(false); onSignOut(); }}><LogOut size={16} aria-hidden="true" /> Sign out</button></div>}</div></div></header>
        <div className="page-content">
          {user.role === "EMPLOYEE" && section === "overview" && <section className="employee-welcome" aria-label="Employee dashboard welcome"><div className="employee-welcome-copy"><span className="employee-welcome-kicker">YOUR STORE WORKSPACE</span><h1>Welcome back, <strong>{user.name?.split(" ")[0] || "teammate"}!</strong></h1><p>Keep your supplement store running smoothly. Review stock, expiry dates, and today&apos;s activity.</p></div><div className="employee-welcome-art" aria-hidden="true"><span className="welcome-sun" /><span className="welcome-building"><i /><i /><i /></span><span className="welcome-box box-one" /><span className="welcome-box box-two" /></div></section>}
          <div className="page-heading"><div><p className="eyebrow">{activeShop?.name || (user.role === "SUPER_ADMIN" ? "BUSINESS OVERVIEW" : "YOUR STORE")}</p><h1>{section === "overview" ? (user.role === "SUPER_ADMIN" ? "Good business starts here." : "Shop Dashboard") : section === "shops" ? "Store locations" : section === "employees" ? "Team access" : section === "transfers" ? "Stock transfers" : section === "inventory" ? "Products" : section === "billing" ? "Billing & sales" : section === "expiry" ? "Expiry management" : "Recent activity"}</h1><p className="heading-subtitle">{section === "overview" ? (user.role === "SUPER_ADMIN" ? "A live view of stock and performance across your stores." : "A live view of the products, stock levels, and expiry dates at your shop.") : section === "shops" ? "Review store locations and their current operations." : section === "employees" ? "Invite teammates and manage their shop permissions." : section === "transfers" ? "Dispatch and receive stock between store locations." : section === "inventory" ? "Manage your supplement catalogue, batch quantities, and expiry dates." : section === "billing" ? "Review shop sales, revenue, and customer invoices." : section === "expiry" ? "Review expiring batches before they reach the shelf." : "A traceable record of recent inventory changes."}</p></div><div className="heading-actions"><span className="date-chip">{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>{user.role === "EMPLOYEE" && section === "overview" && user.permissions?.includes("inventory") && <button className="primary-button" type="button" disabled={!shops.length} onClick={() => setDialog("create-product")}><Plus size={16} /> Add product</button>}{user.role === "SUPER_ADMIN" && section === "shops" && <button className="primary-button" type="button" onClick={() => setDialog("create-shop")}><Plus size={16} /> Add shop</button>}{user.role === "SUPER_ADMIN" && section === "employees" && <button className="primary-button" type="button" onClick={() => setDialog("create-employee")}><Plus size={16} /> Add employee</button>}{user.role === "SUPER_ADMIN" && section === "transfers" && <button className="primary-button" type="button" onClick={() => setDialog("transfer")}><Plus size={16} /> New transfer</button>}{section === "expiry" && <button className="outline-button" type="button" onClick={exportExpiryRows}>Export CSV</button>}{section === "inventory" && (user.role === "SUPER_ADMIN" || user.permissions?.includes("inventory")) && <button className="primary-button" type="button" onClick={() => setDialog("create-product")}><Plus size={16} /> Add product</button>}</div></div>

          {notice && <ActionToast key={noticeVersion} message={notice} type={noticeType} onClose={() => showNotification("")} />}
          {error && !notice && !dataErrorDismissed && <ActionToast key={`inventory-error-${error.message}`} message={error.message} type="error" onClose={() => setDataErrorDismissed(true)} />}
          {section === "overview" && user.role !== "SUPER_ADMIN" && <>
            <section className="metric-grid" aria-label="Shop inventory summary">
              <Metric icon={Package} label="Products" value={metrics.productCount ?? "—"} caption={`${metrics.stockUnits ?? 0} units on hand`} />
              <Metric icon={CircleDollarSign} label="Inventory value" value={money(metrics.stockValue)} caption="At recorded purchase cost" />
              <Metric icon={AlertTriangle} label="Near expiry" value={metrics.nearExpiryCount ?? 0} caption="Within the next 30 days" />
              <Metric icon={Package} label="Low stock" value={metrics.lowStockCount ?? 0} caption="Items to review" />
            </section>
            <section className="surface-card table-card shop-dashboard-products">
              <div className="table-toolbar"><div><h2>Shop products</h2><p>Current batches and availability for your assigned shop.</p></div><span className="record-count">{batches.length} batches</span></div>
              <div className="inventory-filters"><label className="search-box"><Search size={16} /><input aria-label="Search shop products" placeholder="Search by product, SKU, category, or batch…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
              <div className="table-scroll"><table><thead><tr><th>BATCH</th><th>PRODUCT</th><th>SHOP</th><th>EXPIRY</th><th>AVAILABLE</th><th>UNIT COST</th></tr></thead><tbody>{batches.filter((batch) => `${batch.product} ${batch.category} ${batch.batchNumber} ${products.find((product) => product._id === batch.productId)?.sku || ""}`.toLowerCase().includes(query.toLowerCase())).map((batch) => <tr key={batch._id}><td><strong>{batch.batchNumber || "—"}</strong></td><td><strong>{batch.product}</strong><small>{batch.category}</small></td><td>{batch.shopName || shops.find((shop) => shop._id === batch.shopId)?.name || "—"}</td><td>{dayLabel(batch.expiryDate)}</td><td>{batch.availableQty ?? 0}</td><td>{money(batch.unitCost)}</td></tr>)}</tbody></table>{!batches.length && <EmptyState title="No products yet" detail="Product batches assigned to your shop will appear here." />}{batches.length > 0 && !batches.some((batch) => `${batch.product} ${batch.category} ${batch.batchNumber} ${products.find((product) => product._id === batch.productId)?.sku || ""}`.toLowerCase().includes(query.toLowerCase())) && <EmptyState title="No matching products" detail="Try another product name, category, or batch code." />}</div>
            </section>
            <section className="surface-card activity-card"><div className="card-heading"><div><h2>Latest activity</h2><p>Recent recorded changes, newest first</p></div><button className="quiet-button" type="button" onClick={() => setSection("transactions")}>Full activity <ArrowUpRight size={14} /></button></div><ActivityRows activity={activity} /></section>
          </>}

          {section === "overview" && user.role === "SUPER_ADMIN" && <>
            <section className="metric-grid" aria-label="Business summary">
              <Metric icon={Building2} label="Active shops" value={metrics.shopCount ?? "—"} caption="Across your business" />
              {user.role === "SUPER_ADMIN" && <Metric icon={Users} label="Active employees" value={metrics.employeeCount ?? "—"} caption="Assigned to store teams" />}
              <Metric icon={Package} label="Products" value={metrics.productCount ?? "—"} caption={`${metrics.stockUnits ?? 0} units on hand`} />
              <Metric icon={CircleDollarSign} label="Inventory value" value={money(metrics.stockValue)} caption="At recorded purchase cost" />
              <Metric icon={ArrowDownToLine} label="Today’s purchases" value={metrics.purchasesToday ?? "—"} caption="Received purchase records" />
              <Metric icon={ShoppingCart} label="Today’s sales" value={metrics.salesToday ?? "—"} caption={`${money(metrics.revenueToday)} revenue`} />
              {user.role === "SUPER_ADMIN" && <Metric icon={ArrowLeftRight} label="Pending dispatches" value={metrics.pendingDispatches ?? 0} caption="Transfers awaiting action" />}
            </section>
            <section className="overview-grid"><article className="surface-card stock-card"><div className="card-heading"><div><h2>Stock watch</h2><p>Items that need a closer look</p></div><AlertTriangle size={18} /></div><div className="watch-row"><span className="watch-icon amber"><AlertTriangle size={16} /></span><span><strong>Near expiry</strong><small>Within the next 30 days</small></span><b>{metrics.nearExpiryCount ?? 0}</b></div><div className="watch-row"><span className="watch-icon amber"><Package size={16} /></span><span><strong>Low stock</strong><small>At or below reorder threshold</small></span><b>{metrics.lowStockCount ?? 0}</b></div><div className="watch-row"><span className="watch-icon muted"><AlertTriangle size={16} /></span><span><strong>Expired batches</strong><small>Excluded from normal sales</small></span><b>{metrics.expiredCount ?? 0}</b></div></article>
              <article className="surface-card locations-card"><div className="card-heading"><div><h2>Store locations</h2><p>{shops.length} active {shops.length === 1 ? "location" : "locations"}</p></div><button className="quiet-button" type="button" onClick={() => setSection("shops")}>View all <ArrowUpRight size={14} /></button></div>{shops.slice(0, 4).map((shop) => <button className={`location-row ${shopId === shop._id ? "selected" : ""}`} key={shop._id} onClick={() => { setShopId(shop._id); setSection("inventory"); }} type="button"><span className="location-dot" /><span><strong>{shop.name}</strong><small>{shop.code || "Retail location"}</small></span><ArrowUpRight size={14} /></button>)}{!shops.length && !isLoading && <EmptyState title="No stores yet" detail={user.role === "SUPER_ADMIN" ? "Add your first shop to begin recording stock." : "Your account has no assigned shops."} />}</article></section>
            <section className="surface-card activity-card"><div className="card-heading"><div><h2>Latest activity</h2><p>Recent recorded changes, newest first</p></div><button className="quiet-button" type="button" onClick={() => setSection("transactions")}>Full activity <ArrowUpRight size={14} /></button></div><ActivityRows activity={activity} /></section>
          </>}

          {section === "transfers" && <section className="surface-card table-card"><div className="table-toolbar"><div><h2>Inter-store stock movements</h2><p>Stock leaves its source only when dispatched and arrives when receipt is confirmed.</p></div><span className="record-count">{transfers.filter((transfer) => ["PENDING", "DISPATCHED"].includes(transfer.status)).length} in progress</span></div><div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>ROUTE</th><th>ITEMS</th><th>REQUESTED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{transfers.map((transfer) => <tr key={transfer._id}><td><strong>{transfer.reference}</strong></td><td>{transfer.sourceShop} → {transfer.destinationShop}</td><td>{(transfer.items || []).map((item) => `${item.productName} · ${item.batchNumber} · ${item.quantity}`).join(", ")}</td><td>{dayLabel(transfer.createdAt)}</td><td><span className={`status-pill ${transfer.status === "CANCELLED" ? "warning" : ""}`}>{transfer.status}</span></td><td><div className="employee-actions">{transfer.status === "PENDING" && <><button className="row-action" disabled={busy} type="button" onClick={() => transferAction(transfer, "dispatch")}>Dispatch</button><button className="row-action" disabled={busy} type="button" onClick={() => transferAction(transfer, "cancel")}>Cancel</button></>}{transfer.status === "DISPATCHED" && <button className="row-action" disabled={busy} type="button" onClick={() => transferAction(transfer, "receive")}>Confirm receipt</button>}</div></td></tr>)}</tbody></table>{!transfers.length && <EmptyState title="No stock transfers" detail="Create a transfer to move a product batch between active shops." />}</div></section>}

          {section === "employees" && <section className="surface-card table-card"><div className="table-toolbar"><div><h2>Team directory</h2><p>Shop assignments, access permissions, and account status.</p></div><span className="record-count">{employees.length} employees</span></div><div className="table-scroll"><table><thead><tr><th>EMPLOYEE</th><th>ASSIGNED SHOPS</th><th>PERMISSIONS</th><th>LAST ACTIVE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee._id}><td><strong>{employee.name}</strong><small>{employee.email} · {employee.employeeId}</small></td><td>{(employee.shopIds || []).map((id) => shops.find((shop) => shop._id === id)?.name || "Unavailable").join(", ")}</td><td>{(employee.permissions || []).map((permission) => permission[0].toUpperCase() + permission.slice(1)).join(", ") || "View only"}</td><td>{employee.lastActiveAt ? dayLabel(employee.lastActiveAt) : "Never"}</td><td><span className={`status-pill ${employee.active ? "" : "warning"}`}>{employee.active ? employee.mustSetPassword ? "Setup pending" : "Active" : "Inactive"}</span></td><td><div className="employee-actions"><button className="row-action" disabled={busy} type="button" onClick={() => { setSelectedEmployee(employee); setDialog("edit-employee"); }}>Edit</button><button className="row-action" disabled={busy} type="button" onClick={() => employeeAction(employee, "reset-password")}>Reset password</button><button className="row-action" disabled={busy} type="button" onClick={() => employeeAction(employee, employee.active ? "deactivate" : "activate")}>{employee.active ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table>{!employees.length && !isLoading && <EmptyState title="No employees yet" detail="Invite a teammate and assign their shop access and permissions." />}</div></section>}

          {section === "shops" && <section className="surface-card table-card"><div className="table-toolbar"><div><h2>Registered shops</h2><p>Each shop keeps its own batches and transaction history.</p></div><span className="record-count">{shops.length} stores</span></div><div className="table-scroll"><table><thead><tr><th>SHOP</th><th>LOCATION CODE</th><th>STATUS</th><th>OPENED</th><th></th></tr></thead><tbody>{shops.map((shop) => <tr key={shop._id}><td><strong>{shop.name}</strong><small>{shop.address || "—"}</small></td><td>{shop.code || "—"}</td><td><span className={`status-pill ${shop.active === false ? "warning" : ""}`}>{shop.active === false ? "Inactive" : "Active"}</span></td><td>{dayLabel(shop.createdAt)}</td><td><div className="employee-actions"><button className="row-action" type="button" onClick={() => { setShopId(shop._id); setSection("inventory"); }}>View stock <ArrowUpRight size={14} /></button><button className="row-action" type="button" onClick={() => { setSelectedShop(shop); setDialog("edit-shop"); }}>Edit</button><button className="row-action" disabled={busy} type="button" onClick={() => shopAction(shop)}>{shop.active === false ? "Activate" : "Deactivate"}</button></div></td></tr>)}</tbody></table>{!shops.length && !isLoading && <EmptyState title="No shop locations" detail="Create a location to start managing inventory independently." />}</div></section>}

          {section === "inventory" && <section className="surface-card table-card"><div className="table-toolbar"><div><h2>Products catalogue</h2><p>Product details, stock batches, and expiry dates at a glance.</p></div><div className="products-toolbar-actions"><span className="record-count">{money(batches.reduce((sum, batch) => sum + Number(batch.availableQty || 0) * Number(batch.unitPrice || products.find((product) => product._id === batch.productId)?.unitPrice || 0), 0))} total value</span>{(user.role === "SUPER_ADMIN" || user.permissions?.includes("inventory")) && <button className="primary-button" type="button" disabled={!shops.length} onClick={() => setDialog("create-product")}><Plus size={16} /> Add product</button>}</div></div><div className="inventory-filters"><label className="search-box"><Search size={16} /><input aria-label="Search products" placeholder="Search name, batch code, distributor, flavor, or SKU…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by shop" value={shopId} onChange={(event) => { setShopId(event.target.value); setAuditPage(1); setSalesPage(1); }}><option value="">All assigned shops</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select>{(user.role === "SUPER_ADMIN" || user.permissions?.some((permission) => ["purchases", "sales"].includes(permission))) && <div className="transaction-actions">{(user.role === "SUPER_ADMIN" || user.permissions?.includes("purchases")) && <button className="outline-button" type="button" onClick={() => setDialog("purchase")}><ArrowDownToLine size={15} /> Stock in</button>}{(user.role === "SUPER_ADMIN" || user.permissions?.includes("sales")) && <button className="outline-button" type="button" onClick={() => setDialog("sale")}><ShoppingCart size={15} /> Record sale</button>}</div>}</div><div className="table-scroll"><table><thead><tr><th>COUNT</th><th>BATCH CODE</th><th>PRODUCT</th><th>DISTRIBUTOR</th><th>MFG</th><th>EXP</th><th>QUANTITY</th><th>PRICE</th><th>TOTAL</th><th>ACTIONS</th></tr></thead><tbody>{filteredProducts.flatMap((product, productIndex) => { const productBatches = batches.filter((batch) => batch.productId === product._id && `${product.name} ${product.sku || ""} ${product.category || ""} ${product.brand || ""} ${product.flavor || ""} ${product.unitValue || ""} ${product.unit || ""} ${batch.batchNumber || ""} ${batch.supplier || ""}`.toLowerCase().includes(query.toLowerCase())); const rows = productBatches.length ? productBatches : `${product.name} ${product.sku || ""} ${product.category || ""} ${product.brand || ""} ${product.flavor || ""} ${product.unitValue || ""} ${product.unit || ""}`.toLowerCase().includes(query.toLowerCase()) ? [null] : []; return rows.map((batch, batchIndex) => { const price = Number(batch?.unitPrice || product.unitPrice || 0); const quantity = Number(batch?.availableQty || 0); return <tr key={batch?._id || product._id}><td>{productIndex + 1}{batchIndex ? `.${batchIndex + 1}` : ""}</td><td><strong>{batch?.batchNumber || "—"}</strong></td><td><strong>{product.name}</strong><small>{[product.flavor, product.unitValue ? `${product.unitValue} ${product.unit || "pcs"} per pack` : "", product.sku || (!product.flavor ? product.category : "")].filter(Boolean).join(" · ") || "Supplement"}</small></td><td>{batch?.supplier || "—"}</td><td>{dayLabel(batch?.manufacturingDate)}</td><td>{dayLabel(batch?.expiryDate)}</td><td><strong>{quantity} {quantity === 1 ? "unit" : "units"}</strong>{product.unitValue > 0 && <small>{product.unitValue} {product.unit || "pcs"} per pack</small>}</td><td>{money(price)}</td><td>{money(quantity * price)}</td><td>{batch && canManageInventory ? <div className="employee-actions"><button className="row-action product-icon-action" type="button" aria-label={`Edit ${product.name}, batch ${batch.batchNumber}`} title="Edit product and batch" disabled={busy} onClick={() => { setSelectedProductBatch({ product, batch }); setDialog("edit-product-batch"); }}><Pencil size={16} /><span>Edit</span></button><button className="row-action product-icon-action danger" type="button" aria-label={`Delete ${product.name}, batch ${batch.batchNumber}`} title={Number(batch.availableQty || 0) > 0 ? "Clear stock before deleting this batch" : "Delete batch"} disabled={busy} onClick={() => archiveProductBatch(product, batch)}><Trash2 size={16} /><span>Delete</span></button></div> : <span className="product-action-note">{batch ? "Inventory access required" : "No batch to manage"}</span>}</td></tr>; }); })}</tbody></table>{!filteredProducts.length && <EmptyState title={query ? "No matching products" : "No products yet"} detail={query ? "Try another product name, batch code, distributor, or SKU." : "Add a product to start building your catalogue, then record stock to add batches."} />}</div></section>}

          {section === "billing" && <><section className="metric-grid billing-metrics"><Metric icon={CircleDollarSign} label="Filtered revenue" value={money(salesData?.summary?.revenue)} caption="Recorded sales in this date range" /><Metric icon={ShoppingCart} label="Invoices" value={salesData?.summary?.count ?? "—"} caption={`${salesData?.total ?? 0} matching records`} /></section><section className="surface-card table-card"><div className="table-toolbar"><div><h2>Sales register</h2><p>Completed sales with printable invoices and shop-level totals.</p></div><span className="record-count">{salesData?.total ?? 0} records</span></div><div className="inventory-filters"><label>Date from<input aria-label="Sales date from" type="date" value={salesFrom} onChange={(event) => { setSalesFrom(event.target.value); setSalesPage(1); }} /></label><label>Date to<input aria-label="Sales date to" type="date" value={salesTo} onChange={(event) => { setSalesTo(event.target.value); setSalesPage(1); }} /></label></div>{salesError && <p className="form-error" role="alert">{salesError.message}</p>}{salesLoading && <div className="loading-line" role="status">Loading sales…</div>}<div className="table-scroll"><table><thead><tr><th>INVOICE</th><th>DATE</th><th>SHOP</th><th>PRODUCT</th><th>QUANTITY</th><th>PAYMENT</th><th>TOTAL</th><th></th></tr></thead><tbody>{sales.map((sale) => <tr key={sale._id}><td><strong>{sale.invoiceNumber}</strong></td><td>{dayLabel(sale.createdAt)}</td><td>{sale.shopName}</td><td>{sale.productName}<small>{sale.productSku}</small></td><td>{sale.quantity}</td><td>{String(sale.paymentMethod || "cash").toUpperCase()}</td><td>{money(sale.total)}</td><td><button className="row-action" type="button" onClick={() => setSelectedSale(sale)}>View invoice</button></td></tr>)}</tbody></table>{!sales.length && !salesLoading && <EmptyState title="No sales in this range" detail="Sales recorded at your selected shops will appear here." />}</div>{(salesData?.pageCount || 0) > 1 && <div className="pagination-controls"><button className="outline-button" type="button" disabled={salesPage <= 1} onClick={() => setSalesPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {salesPage} of {salesData.pageCount}</span><button className="outline-button" type="button" disabled={salesPage >= salesData.pageCount} onClick={() => setSalesPage((page) => page + 1)}>Next</button></div>}</section></>}

          {section === "expiry" && <section className="surface-card table-card"><div className="table-toolbar"><div><h2>Batch expiry watch</h2><p>Expired products are blocked from sales and kept visible for stock control.</p></div><span className="record-count">{filteredExpiry.length} batches</span></div><div className="inventory-filters"><label className="search-box"><Search size={16} /><input aria-label="Search expiring products" placeholder="Search product, category, or batch…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Expiry window" value={expiryFilter} onChange={(event) => setExpiryFilter(event.target.value)}><option value="expired">Already expired ({metrics.expiredCount || 0})</option><option value="7">Within 7 days ({metrics.expiring7Count || 0})</option><option value="15">Within 15 days ({metrics.expiring15Count || 0})</option><option value="30">Within 30 days ({metrics.expiring30Count || 0})</option><option value="60">Within 60 days ({metrics.expiring60Count || 0})</option><option value="90">Within 90 days ({metrics.expiring90Count || 0})</option></select></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SHOP</th><th>BATCH</th><th>AVAILABLE</th><th>EXPIRY</th><th>DAYS LEFT</th><th>UNIT COST</th><th>STOCK VALUE</th></tr></thead><tbody>{filteredExpiry.filter((batch) => `${batch.product} ${batch.category} ${batch.batchNumber}`.toLowerCase().includes(query.toLowerCase())).map((batch) => <tr key={batch._id}><td><strong>{batch.product}</strong><small>{batch.category}</small></td><td>{batch.shopName}</td><td>{batch.batchNumber}</td><td>{batch.availableQty}</td><td>{dayLabel(batch.expiryDate)}</td><td><span className={`status-pill ${batch.remainingDays < 0 ? "warning" : ""}`}>{batch.remainingDays < 0 ? "Expired" : batch.remainingDays === 0 ? "Today" : `${batch.remainingDays} days`}</span></td><td>{money(batch.unitCost)}</td><td>{money(batch.stockValue)}</td></tr>)}</tbody></table>{!filteredExpiry.length && <EmptyState title="No batches in this window" detail="Products with stock and expiry dates matching this filter will appear here." />}</div></section>}

          {section === "transactions" && <section className="surface-card activity-card full-activity"><div className="card-heading"><div><h2>Activity history</h2><p>{user.role === "SUPER_ADMIN" ? "Append-only business audit trail across every store." : "Your own recorded actions across assigned shops."}</p></div><span className="record-count">{user.role === "SUPER_ADMIN" ? auditData?.total ?? 0 : visibleActivity.length} records</span></div><ActivityRows activity={visibleActivity} expanded />{user.role === "SUPER_ADMIN" && (auditData?.pageCount || 0) > 1 && <div className="pagination-controls"><button className="outline-button" type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {auditData.page} of {auditData.pageCount}</span><button className="outline-button" type="button" disabled={auditPage >= auditData.pageCount} onClick={() => setAuditPage((page) => page + 1)}>Next</button></div>}</section>}
        </div>
      </main>

      {selectedSale && <InvoicePreview sale={selectedSale} shop={shops.find((item) => item._id === selectedSale.shopId)} onClose={() => setSelectedSale(null)} />}
      {archiveTarget && <ArchiveBatchDialog product={archiveTarget.product} batch={archiveTarget.batch} busy={busy} onClose={() => { if (!busy) setArchiveTarget(null); }} onConfirm={confirmArchiveProductBatch} />}
      {dialog && <Dialog title={dialog === "create-shop" ? "Add a shop" : dialog === "edit-shop" ? "Edit shop details" : dialog === "create-employee" ? "Invite an employee" : dialog === "edit-employee" ? "Edit employee" : dialog === "create-product" ? "Add supplement product" : dialog === "edit-product-batch" ? "Edit product & batch" : dialog === "purchase" ? "Receive stock" : dialog === "transfer" ? "Request stock transfer" : "Record a sale"} onClose={() => { setDialog(""); setSelectedEmployee(null); setSelectedShop(null); setSelectedProductBatch(null); setDialogError(""); }} onSubmit={submitAction} busy={busy} action={dialog} shops={shops} products={products} batches={batches} employee={selectedEmployee} shop={selectedShop} productBatch={selectedProductBatch} error={dialogError} />}
    </div>
  );
}

function Metric({ icon: Icon, label, value, caption }) { return <article className="metric-card"><span className="metric-icon"><Icon size={18} /></span><span className="metric-label">{label}</span><strong>{value}</strong><small>{caption}</small></article>; }
function ActionToast({ message, type, onClose }) {
  const Icon = type === "success" ? ClipboardList : AlertTriangle;
  const heading = type === "success" ? "Action complete" : type === "warning" ? "Action needed" : "Action failed";
  return <div className={`action-toast ${type}`} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"} aria-atomic="true"><span className="action-toast-icon"><Icon size={18} aria-hidden="true" /></span><div className="action-toast-copy"><strong>{heading}</strong><p>{message}</p></div><button className="action-toast-close" type="button" onClick={onClose} aria-label="Close notification"><X size={16} aria-hidden="true" /></button></div>;
}
function EmptyState({ title, detail }) { return <div className="empty-state"><Package size={19} /><strong>{title}</strong><span>{detail}</span></div>; }
function ActivityRows({ activity, expanded = false }) { return activity.length ? <div className="activity-list">{activity.map((entry) => <div className="activity-row" key={entry._id}><span className="activity-marker"><ClipboardList size={15} /></span><span className="activity-copy"><strong>{String(entry.action || "UPDATE").replaceAll("_", " ")}</strong><small>{entry.actorName || "User"} · {entry.actorRole === "SUPER_ADMIN" ? "Admin update" : "Employee update"}{entry.changes?.product ? ` · ${entry.changes.product}` : ""}</small></span><time>{expanded ? new Date(entry.createdAt).toLocaleString() : dayLabel(entry.createdAt)}</time></div>)}</div> : <EmptyState title="No activity recorded" detail="Transactions and important updates will appear here." />; }

function Dialog({ title, action, shops, products, batches, employee, shop, productBatch, onClose, onSubmit, busy, error }) {
  const [shopId, setShopId] = useState(shops.find((shop) => shop.active !== false)?._id || "");
  const [sourceShopId, setSourceShopId] = useState(shops.find((shop) => shop.active !== false)?._id || "");
  const [destinationShopId, setDestinationShopId] = useState(shops.find((shop) => shop.active !== false && shop._id !== sourceShopId)?._id || "");
  const [productQuantity, setProductQuantity] = useState(0);
  const [productPrice, setProductPrice] = useState(0);
  const eligibleProducts = products;
  const sourceBatches = batches.filter((batch) => batch.shopId === sourceShopId && Number(batch.availableQty) > 0 && new Date(batch.expiryDate) > new Date());
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${action === "create-product" ? "product-entry-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-heading"><div><p className="eyebrow">STORE OPERATIONS</p><h2 id="dialog-title">{title}</h2></div><button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div><form onSubmit={onSubmit} className={`modal-form ${action === "create-product" ? "product-entry-form" : ""}`}>
    {(action === "create-shop" || action === "edit-shop") ? <><label>Shop name<input name="name" defaultValue={shop?.name || ""} required minLength={2} maxLength={100} placeholder="e.g. Haldia Shop" /></label><div className="form-two"><label>Location code<input name="code" defaultValue={shop?.code || ""} maxLength={20} placeholder="HAL-01" /></label><label>Address<input name="address" defaultValue={shop?.address || ""} maxLength={200} placeholder="City / area" /></label></div></> : (action === "create-employee" || action === "edit-employee") ? <><label>Full name<input name="name" defaultValue={employee?.name || ""} required minLength={2} maxLength={120} /></label><div className="form-two"><label>Email address{employee ? <input type="email" value={employee.email} readOnly /> : <input name="email" type="email" required maxLength={254} />}</label><label>Employee ID<input name="employeeId" defaultValue={employee?.employeeId || ""} required maxLength={40} /></label></div><label>Contact number<input name="contact" type="tel" defaultValue={employee?.contact || ""} maxLength={30} /></label><fieldset className="permission-group"><legend>Assign shops <span>Choose at least one</span></legend><div className="checkbox-list">{shops.filter((shop) => shop.active !== false).map((shop) => <label className="checkbox-option" key={shop._id}><input type="checkbox" name="shopIds" value={shop._id} defaultChecked={employee?.shopIds?.includes(shop._id)} /><span>{shop.name}</span></label>)}</div></fieldset><fieldset className="permission-group"><legend>Permissions</legend><div className="checkbox-list permission-list"><label className="checkbox-option"><input type="checkbox" name="permissions" value="inventory" defaultChecked={employee?.permissions?.includes("inventory")} /><span>Manage inventory</span></label><label className="checkbox-option"><input type="checkbox" name="permissions" value="purchases" defaultChecked={employee?.permissions?.includes("purchases")} /><span>Record purchases</span></label><label className="checkbox-option"><input type="checkbox" name="permissions" value="sales" defaultChecked={employee?.permissions?.includes("sales")} /><span>Record sales</span></label><label className="checkbox-option"><input type="checkbox" name="permissions" value="billing" defaultChecked={employee?.permissions?.includes("billing")} /><span>Use billing</span></label></div></fieldset></> : action === "transfer" ? <><div className="form-two"><label>From shop<select name="sourceShopId" value={sourceShopId} onChange={(event) => setSourceShopId(event.target.value)} required>{shops.filter((shop) => shop.active !== false).map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label><label>To shop<select name="destinationShopId" value={destinationShopId} onChange={(event) => setDestinationShopId(event.target.value)} required>{shops.filter((shop) => shop.active !== false && shop._id !== sourceShopId).map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label></div><label>Available batch<select name="batchId" required>{sourceBatches.map((batch) => <option key={batch._id} value={batch._id}>{batch.product} · {batch.batchNumber} · {batch.availableQty} units</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="1" max={sourceBatches[0]?.availableQty || 1} step="1" required /></label></> : <>
      {action === "edit-product-batch" ? <input name="shopId" type="hidden" value={productBatch?.batch.shopId || ""} /> : <label>Shop<select value={shopId} onChange={(event) => setShopId(event.target.value)} required>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select><input name="shopId" type="hidden" value={shopId} /></label>}
      {action === "edit-product-batch" && <><label>Product name<input name="name" defaultValue={productBatch?.product.name || ""} required maxLength={140} /></label><div className="form-two"><label>Category<input name="category" defaultValue={productBatch?.product.category || "Supplements"} required maxLength={80} /></label><label>SKU<input name="sku" defaultValue={productBatch?.product.sku || ""} maxLength={40} placeholder="Optional" /></label></div><div className="form-two"><label>Brand<input name="brand" defaultValue={productBatch?.product.brand || ""} maxLength={80} /></label><label>Barcode<input name="barcode" defaultValue={productBatch?.product.barcode || ""} maxLength={40} /></label></div><div className="form-two"><label>Flavor<input name="flavor" defaultValue={productBatch?.product.flavor || ""} maxLength={100} /></label><label>Unit value<input name="unitValue" type="number" min="0" max="1000000" step="0.01" defaultValue={productBatch?.product.unitValue ?? 0} /></label></div><div className="form-two"><label>Unit<select name="unit" defaultValue={productBatch?.product.unit || "pcs"}><option value="pcs">pcs</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select></label><label>Batch number<input name="batchNumber" defaultValue={productBatch?.batch.batchNumber || ""} required maxLength={60} /></label></div><div className="form-two"><label>Distributor<input name="supplier" defaultValue={productBatch?.batch.supplier || ""} maxLength={120} /></label><label>Selling price (₹)<input name="unitPrice" type="number" min="0.01" step="0.01" defaultValue={productBatch?.batch.unitPrice ?? productBatch?.product.unitPrice ?? ""} required /></label></div><div className="form-two"><label>Manufacturing date<input name="manufacturingDate" type="date" defaultValue={productBatch?.batch.manufacturingDate ? new Date(productBatch.batch.manufacturingDate).toISOString().slice(0, 10) : ""} /></label><label>Expiry date<input name="expiryDate" type="date" defaultValue={productBatch?.batch.expiryDate ? new Date(productBatch.batch.expiryDate).toISOString().slice(0, 10) : ""} required /></label></div></>}
      {action === "create-product" && <div className="product-form-grid"><label>Batch code<input name="batchNumber" required maxLength={60} placeholder="e.g. BATCH-2408" /></label><label>Product name<input name="name" required minLength={2} maxLength={140} placeholder="Product name" /></label><label>Distributor<input name="supplier" maxLength={120} placeholder="Distributor name (optional)" /></label><label>Flavor<input name="flavor" maxLength={100} placeholder="e.g. Mango" /></label><label>Manufacturing date<input name="manufacturingDate" type="date" /></label><label>Expiry date<input name="expiryDate" type="date" required /></label><div className="product-form-quantity"><label>Quantity<input name="quantity" type="number" min="0" max="1000000" step="1" defaultValue="0" required onChange={(event) => setProductQuantity(Number(event.target.value) || 0)} /></label><label>Unit value<input name="unitValue" type="number" min="0" max="1000000" step="0.01" defaultValue="0" /><small>Pack size</small></label><label>Unit<select name="unit" defaultValue="pcs"><option value="pcs">pcs</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select></label><label>Price (₹)<input name="unitPrice" type="number" min="0.01" max="10000000" step="0.01" required onChange={(event) => setProductPrice(Number(event.target.value) || 0)} /><small>Opening stock cost and selling price</small></label><label className="product-total-field">Total (₹)<output className="product-total-output" aria-live="polite">₹{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(productQuantity * productPrice)}</output><small>Quantity × price</small></label></div></div>}
      {action === "purchase" && <><label>Product<select name="productId" required>{eligibleProducts.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}</select></label><div className="form-two"><label>Quantity<input name="quantity" type="number" min="1" step="1" required /></label><label>Purchase price (₹)<input name="unitCost" type="number" min="0" step="0.01" required /></label></div><label>Selling price per unit (₹)<input name="unitPrice" type="number" min="0.01" step="0.01" placeholder="Optional; defaults to product price" /></label><div className="form-two"><label>Batch number<input name="batchNumber" required maxLength={60} /></label><label>Manufacturing date<input name="manufacturingDate" type="date" /></label></div><div className="form-two"><label>Expiry date<input name="expiryDate" type="date" required /></label><label>Purchase date<input name="purchaseDate" type="date" /></label></div><div className="form-two"><label>Supplier<input name="supplier" maxLength={120} /></label><label>Invoice number<input name="invoiceNumber" maxLength={60} /></label></div><label>Payment status<select name="paymentStatus"><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></label></>}
      {action === "sale" && <><label>Product<select name="productId" required>{eligibleProducts.map((product) => <option key={product._id} value={product._id}>{product.name} · {money(product.unitPrice)}</option>)}</select></label><div className="form-two"><label>Quantity<input name="quantity" type="number" min="1" step="1" required /></label><label>Customer<input name="customerName" maxLength={120} placeholder="Walk-in customer" /></label></div><div className="form-two"><label>Discount (₹)<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Tax (0–28%)<input name="taxPercent" type="number" min="0" max="28" step="0.01" defaultValue="0" /></label></div><label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></label></>}
    </>}
    {shops.length === 0 && action !== "create-shop" && <p className="form-error">Add a shop before recording inventory.</p>}{(action === "purchase" || action === "sale") && products.length === 0 && <p className="form-error">Add a product before recording a transaction.</p>}{action === "transfer" && shops.filter((shop) => shop.active !== false).length < 2 && <p className="form-error">At least two active shops are required.</p>}{action === "transfer" && shops.filter((shop) => shop.active !== false).length >= 2 && !sourceBatches.length && <p className="form-error">The selected source shop has no unexpired stock available to transfer.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || (!shops.length && action !== "create-shop") || ((action === "purchase" || action === "sale") && products.length === 0) || (action === "transfer" && (shops.filter((shop) => shop.active !== false).length < 2 || !sourceBatches.length))} type="submit">{busy ? "Saving…" : action === "edit-product-batch" ? "Update product" : action === "create-product" ? "Add product" : "Save changes"}</button></div>
  </form></section></div>;
}

function ArchiveBatchDialog({ product, batch, busy, onClose, onConfirm }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}><section className="modal-card archive-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="archive-batch-title" aria-describedby="archive-batch-description"><div className="modal-heading"><div><p className="eyebrow">PRODUCT ACTION</p><h2 id="archive-batch-title">Delete batch?</h2></div><button className="icon-button modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close delete confirmation"><X size={18} /></button></div><div className="archive-confirm-body"><p id="archive-batch-description">Delete batch <strong>{batch.batchNumber}</strong> for <strong>{product.name}</strong>? It will be removed from active inventory and kept in the audit history.</p><p className="archive-confirm-stock">Quantity on hand: <strong>{batch.availableQty || 0}</strong></p><div className="modal-actions"><button className="outline-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : "Delete batch"}</button></div></div></section></div>;
}

function InvoicePreview({ sale, shop, onClose }) {
  return <div className="modal-backdrop invoice-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="invoice-paper" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><div className="invoice-actions"><button className="outline-button" type="button" onClick={onClose}>Close</button><button className="primary-button" type="button" onClick={() => window.print()}>Print invoice</button></div><header className="invoice-header"><span className="brand-monogram">SS</span><div><p className="eyebrow">SS SUPPLEMENT</p><h2 id="invoice-title">Tax invoice</h2><small>{shop?.name || sale.shopName}{shop?.address ? ` · ${shop.address}` : ""}</small></div><div className="invoice-reference"><strong>{sale.invoiceNumber}</strong><small>{dayLabel(sale.createdAt)}</small></div></header><div className="invoice-customer"><span>Bill to</span><strong>{sale.customerName || "Walk-in customer"}</strong><small>Payment: {String(sale.paymentMethod || "cash").toUpperCase()}</small></div><div className="invoice-table-wrap"><table><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody><tr><td>{sale.productName}<small>{sale.productSku}</small></td><td>{sale.quantity}</td><td>{money(sale.quantity ? sale.subtotal / sale.quantity : 0)}</td><td>{money(sale.subtotal)}</td></tr></tbody></table></div><div className="invoice-totals"><div><span>Subtotal</span><strong>{money(sale.subtotal)}</strong></div>{Number(sale.discount) > 0 && <div><span>Discount</span><strong>−{money(sale.discount)}</strong></div>}<div><span>Tax ({sale.taxPercent || 0}%)</span><strong>{money(sale.taxAmount)}</strong></div><div className="invoice-grand-total"><span>Grand total</span><strong>{money(sale.total)}</strong></div></div><footer className="invoice-footer">Thank you for choosing SS Supplement.</footer></section></div>;
}
