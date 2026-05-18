"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag, Plus, Loader2, Pencil, Trash2, Package, ShoppingCart,
  RefreshCw, X, ExternalLink, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Store {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  currency: string;
  primary_color: string;
  default_view_mode: string;
  payment_provider: string;
  google_sheet_id: string | null;
  chatbot_id: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  category: string | null;
  sku: string | null;
  in_stock: boolean;
  sort_order: number;
}

interface Purchase {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  amount: number;
  currency: string;
  status: string;
  items: { name: string; price: number; quantity: number }[];
  created_at: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "AED", "INR"];
const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-muted text-muted-foreground",
};

type StoreView = "list" | "settings" | "products" | "purchases";

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<StoreView>("list");
  const [activeStore, setActiveStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Store form
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [storeCurrency, setStoreCurrency] = useState("USD");
  const [storeColor, setStoreColor] = useState("#6366f1");
  const [storeViewMode, setStoreViewMode] = useState("grid");
  const [storeSheetId, setStoreSheetId] = useState("");
  const [savingStore, setSavingStore] = useState(false);

  // Product form
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodCompare, setProdCompare] = useState("");
  const [prodImage, setProdImage] = useState("");
  const [prodCategory, setProdCategory] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodInStock, setProdInStock] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/stores?limit=100");
      setStores(res.data.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadProducts(store: Store) {
    setActiveStore(store);
    setSubLoading(true);
    setView("products");
    try {
      const res = await apiClient.get(`/api/v1/stores/${store.id}/products?limit=200`);
      setProducts(res.data.data ?? []);
    } catch {}
    setSubLoading(false);
  }

  async function loadPurchases(store: Store) {
    setActiveStore(store);
    setSubLoading(true);
    setView("purchases");
    try {
      const res = await apiClient.get(`/api/v1/stores/${store.id}/purchases?limit=100`);
      setPurchases(res.data.data ?? []);
    } catch {}
    setSubLoading(false);
  }

  function openCreateStore() {
    setEditingStore(null);
    setStoreName(""); setStoreDesc(""); setStoreCurrency("USD");
    setStoreColor("#6366f1"); setStoreViewMode("grid"); setStoreSheetId("");
    setShowStoreModal(true);
  }

  function openEditStore(s: Store) {
    setEditingStore(s);
    setStoreName(s.name); setStoreDesc(s.description ?? "");
    setStoreCurrency(s.currency); setStoreColor(s.primary_color);
    setStoreViewMode(s.default_view_mode);
    setStoreSheetId(s.google_sheet_id ?? "");
    setShowStoreModal(true);
  }

  async function saveStore() {
    if (!storeName.trim()) return;
    setSavingStore(true);
    const payload = {
      name: storeName.trim(),
      description: storeDesc || null,
      currency: storeCurrency,
      primary_color: storeColor,
      default_view_mode: storeViewMode,
      google_sheet_id: storeSheetId || null,
    };
    try {
      if (editingStore) {
        await apiClient.patch(`/api/v1/stores/${editingStore.id}`, payload);
      } else {
        await apiClient.post("/api/v1/stores", payload);
      }
      setShowStoreModal(false);
      await load();
    } catch {}
    setSavingStore(false);
  }

  async function deleteStore(id: string) {
    if (!confirm("Delete this store and all its products?")) return;
    try {
      await apiClient.delete(`/api/v1/stores/${id}`);
      setStores((p) => p.filter((s) => s.id !== id));
    } catch {}
  }

  async function syncSheet(storeId: string) {
    setSyncing(true);
    try {
      const res = await apiClient.post(`/api/v1/stores/${storeId}/sync`);
      alert(`Synced ${res.data.data.synced} product(s) from Google Sheet.`);
      if (activeStore?.id === storeId) await loadProducts(activeStore);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Sync failed");
    }
    setSyncing(false);
  }

  // Product helpers
  function openCreateProduct() {
    setEditingProduct(null);
    setProdName(""); setProdDesc(""); setProdPrice(""); setProdCompare("");
    setProdImage(""); setProdCategory(""); setProdSku(""); setProdInStock(true);
    setShowProductModal(true);
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p);
    setProdName(p.name); setProdDesc(p.description ?? "");
    setProdPrice(String(p.price)); setProdCompare(p.compare_at_price ? String(p.compare_at_price) : "");
    setProdImage(p.image_url ?? ""); setProdCategory(p.category ?? "");
    setProdSku(p.sku ?? ""); setProdInStock(p.in_stock);
    setShowProductModal(true);
  }

  async function saveProduct() {
    if (!activeStore || !prodName.trim() || !prodPrice) return;
    setSavingProduct(true);
    const payload = {
      name: prodName.trim(),
      description: prodDesc || null,
      price: parseFloat(prodPrice),
      compare_at_price: prodCompare ? parseFloat(prodCompare) : null,
      image_url: prodImage || null,
      category: prodCategory || null,
      sku: prodSku || null,
      in_stock: prodInStock,
    };
    try {
      if (editingProduct) {
        await apiClient.patch(`/api/v1/stores/${activeStore.id}/products/${editingProduct.id}`, payload);
      } else {
        await apiClient.post(`/api/v1/stores/${activeStore.id}/products`, payload);
      }
      setShowProductModal(false);
      await loadProducts(activeStore);
    } catch {}
    setSavingProduct(false);
  }

  async function deleteProduct(productId: string) {
    if (!activeStore || !confirm("Delete this product?")) return;
    try {
      await apiClient.delete(`/api/v1/stores/${activeStore.id}/products/${productId}`);
      setProducts((p) => p.filter((pr) => pr.id !== productId));
    } catch {}
  }

  const publicBase = typeof window !== "undefined" ? window.location.origin : "";

  // ── Sub-views ───────────────────────────────────────────────────────────────

  if (view === "products" && activeStore) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setView("list")}>← Back</Button>
            <div>
              <h1 className="text-xl font-semibold">{activeStore.name} — Products</h1>
              <p className="text-xs text-muted-foreground">{products.length} product{products.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {activeStore.google_sheet_id && (
              <Button variant="outline" size="sm" onClick={() => syncSheet(activeStore.id)} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sync Sheet
              </Button>
            )}
            <Button size="sm" onClick={openCreateProduct}>
              <Plus className="h-4 w-4 mr-1" /> Add Product
            </Button>
          </div>
        </div>

        {subLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : products.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No products yet</p>
            <p className="text-sm text-muted-foreground mb-4">Add products manually or sync from a Google Sheet.</p>
            <Button onClick={openCreateProduct}><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {products.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex gap-4">
                  {p.image_url && (
                    <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.category && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{p.category}</span>}
                        {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEditProduct(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteProduct(p.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className="font-semibold">{activeStore.currency} {p.price.toFixed(2)}</span>
                      {p.compare_at_price && (
                        <span className="line-through text-muted-foreground">{p.compare_at_price.toFixed(2)}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.in_stock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {p.in_stock ? "In Stock" : "Out of Stock"}
                      </span>
                      {p.sku && <span className="text-xs text-muted-foreground">SKU: {p.sku}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Product modal */}
        {showProductModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">{editingProduct ? "Edit Product" : "Add Product"}</h2>
                <button onClick={() => setShowProductModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="Product name" />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} placeholder="Short description" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Price * ({activeStore.currency})</Label>
                    <Input type="number" step="0.01" min="0" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1">
                    <Label>Compare-at Price</Label>
                    <Input type="number" step="0.01" min="0" value={prodCompare} onChange={(e) => setProdCompare(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Image URL</Label>
                  <Input value={prodImage} onChange={(e) => setProdImage(e.target.value)} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input value={prodCategory} onChange={(e) => setProdCategory(e.target.value)} placeholder="e.g. Shirts" />
                  </div>
                  <div className="space-y-1">
                    <Label>SKU</Label>
                    <Input value={prodSku} onChange={(e) => setProdSku(e.target.value)} placeholder="SKU-001" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="in-stock" checked={prodInStock} onChange={(e) => setProdInStock(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="in-stock" className="cursor-pointer">In stock</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowProductModal(false)}>Cancel</Button>
                <Button onClick={saveProduct} disabled={savingProduct || !prodName.trim() || !prodPrice}>
                  {savingProduct ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editingProduct ? "Save Changes" : "Add Product"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "purchases" && activeStore) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" onClick={() => setView("list")}>← Back</Button>
          <h1 className="text-xl font-semibold">{activeStore.name} — Purchases</h1>
        </div>
        {subLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : purchases.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No purchases yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Items</th>
                    <th className="px-4 py-3 text-left font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{p.customer_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.customer_email ?? ""}</p>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {p.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                      </td>
                      <td className="px-4 py-2 font-semibold">{p.currency} {p.amount.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? "bg-muted text-muted-foreground"}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── Main store list ─────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Stores</h1>
        </div>
        <Button onClick={openCreateStore}>
          <Plus className="h-4 w-4 mr-1" /> New Store
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stores.length === 0 ? (
        <Card className="p-12 text-center">
          <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No stores yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a store to sell products via your chatbot.</p>
          <Button onClick={openCreateStore}><Plus className="h-4 w-4 mr-1" /> New Store</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {stores.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold"
                    style={{ background: s.primary_color }}>
                    {s.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>/store/{s.slug}</span>
                      <span>{s.currency}</span>
                      <a href={`${publicBase}/store/${s.slug}`} target="_blank" rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5">
                        Open <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => loadProducts(s)} title="Products">
                    <Package className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => loadPurchases(s)} title="Purchases">
                    <DollarSign className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEditStore(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteStore(s.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Store create/edit modal */}
      {showStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{editingStore ? "Store Settings" : "New Store"}</h2>
              <button onClick={() => setShowStoreModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="space-y-1">
                <Label>Store Name *</Label>
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. My Shop" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={storeDesc} onChange={(e) => setStoreDesc(e.target.value)} placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <select value={storeCurrency} onChange={(e) => setStoreCurrency(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Default View</Label>
                  <select value={storeViewMode} onChange={(e) => setStoreViewMode(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="grid">Grid</option>
                    <option value="list">List</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Primary Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={storeColor} onChange={(e) => setStoreColor(e.target.value)} className="h-9 w-14 rounded border cursor-pointer" />
                  <Input value={storeColor} onChange={(e) => setStoreColor(e.target.value)} className="font-mono text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Google Sheet ID <span className="text-muted-foreground font-normal">(for catalog sync)</span></Label>
                <Input value={storeSheetId} onChange={(e) => setStoreSheetId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
                <p className="text-xs text-muted-foreground">Sheet must be published publicly. Columns: name, price, description, category, image_url, sku, in_stock</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowStoreModal(false)}>Cancel</Button>
              <Button onClick={saveStore} disabled={savingStore || !storeName.trim()}>
                {savingStore ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editingStore ? "Save Changes" : "Create Store"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
