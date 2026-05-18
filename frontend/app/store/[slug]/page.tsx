"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ShoppingCart, Minus, Plus, X, Loader2, CheckCircle2, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Store {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  primary_color: string;
  default_view_mode: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  category: string | null;
  in_stock: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type CheckoutStep = "cart" | "details" | "payment" | "confirmed";

export default function StorefrontPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");

  // Checkout form
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [processing, setProcessing] = useState(false);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const [storeRes, productsRes] = await Promise.all([
          apiClient.get(`/api/public/stores/${slug}`),
          apiClient.get(`/api/public/stores/${slug}/products?limit=200`),
        ]);
        setStore(storeRes.data.data);
        setProducts(productsRes.data.data ?? []);
        setViewMode(storeRes.data.data.default_view_mode ?? "grid");
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    })();
  }, [slug]);

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]];
  const filtered = categoryFilter === "all" ? products : products.filter((p) => p.category === categoryFilter);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.product.id !== productId) return i;
      return { ...i, quantity: Math.max(0, i.quantity + delta) };
    }).filter((i) => i.quantity > 0));
  }

  async function checkout() {
    if (!store || !custName.trim() || !custEmail.trim()) return;
    setProcessing(true);
    try {
      // Create payment intent
      const intentRes = await apiClient.post("/api/commerce/checkout/create-payment-intent", {
        store_slug: store.slug,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      });
      const { payment_intent_id } = intentRes.data.data;

      // Confirm payment (in production this would use Stripe.js to collect card details)
      const confirmRes = await apiClient.post("/api/commerce/checkout/confirm", {
        payment_intent_id,
        name: custName.trim(),
        email: custEmail.trim(),
      });
      setOrderId(confirmRes.data.data.order_id);
      setCheckoutStep("confirmed");
      setCart([]);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Checkout failed. Please try again.");
    }
    setProcessing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <ShoppingCart className="h-12 w-12 text-gray-300" />
        <h1 className="text-xl font-semibold">Store not found</h1>
        <p className="text-gray-500">This store doesn't exist or is not active.</p>
      </div>
    );
  }

  const primary = store.primary_color;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: primary }}>{store.name}</h1>
            {store.description && <p className="text-xs text-gray-500">{store.description}</p>}
          </div>
          <button
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: primary }}
            onClick={() => { setCartOpen(true); setCheckoutStep("cart"); }}
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Filters */}
      {categories.length > 2 && (
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border transition-colors ${
                categoryFilter === cat
                  ? "text-white border-transparent"
                  : "bg-white text-gray-600 hover:border-gray-400"
              }`}
              style={categoryFilter === cat ? { background: primary, borderColor: primary } : {}}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              className={`p-1.5 rounded ${viewMode === "grid" ? "bg-gray-200" : "hover:bg-gray-100"}`}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={`p-1.5 rounded ${viewMode === "list" ? "bg-gray-200" : "hover:bg-gray-100"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Products */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No products available.</div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-gray-100 flex items-center justify-center text-gray-300">
                    <ShoppingCart className="h-10 w-10" />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-medium text-sm line-clamp-2">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-bold text-sm">{store.currency} {p.price.toFixed(2)}</span>
                    {p.compare_at_price && (
                      <span className="text-xs line-through text-gray-400">{p.compare_at_price.toFixed(2)}</span>
                    )}
                  </div>
                  <button
                    className="mt-2 w-full py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ background: primary }}
                    disabled={!p.in_stock}
                    onClick={() => addToCart(p)}
                  >
                    {p.in_stock ? "Add to Cart" : "Out of Stock"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border p-4 flex gap-4 hover:shadow-md transition-shadow">
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">{store.currency} {p.price.toFixed(2)}</span>
                      {p.compare_at_price && (
                        <span className="text-sm line-through text-gray-400">{p.compare_at_price.toFixed(2)}</span>
                      )}
                    </div>
                    <button
                      className="px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                      style={{ background: primary }}
                      disabled={!p.in_stock}
                      onClick={() => addToCart(p)}
                    >
                      {p.in_stock ? "Add to Cart" : "Out of Stock"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Cart / Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">
                {checkoutStep === "confirmed" ? "Order Confirmed" : checkoutStep === "details" ? "Your Details" : "Cart"}
              </h2>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5 text-gray-500" /></button>
            </div>

            {checkoutStep === "confirmed" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 className="h-14 w-14 mb-3" style={{ color: primary }} />
                <h3 className="text-xl font-semibold mb-1">Thank you!</h3>
                <p className="text-gray-500 text-sm mb-2">Your order has been placed successfully.</p>
                <p className="text-xs text-gray-400">Order ID: {orderId}</p>
                <button
                  className="mt-6 px-6 py-2.5 rounded-lg text-white font-medium"
                  style={{ background: primary }}
                  onClick={() => { setCartOpen(false); setCheckoutStep("cart"); }}
                >
                  Continue Shopping
                </button>
              </div>
            ) : checkoutStep === "details" ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {cart.map((i) => (
                      <div key={i.product.id} className="flex justify-between text-sm">
                        <span>{i.product.name} ×{i.quantity}</span>
                        <span className="font-medium">{store.currency} {(i.product.price * i.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-2 border-t mt-2">
                      <span>Total</span>
                      <span>{store.currency} {cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Full Name *</Label>
                      <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Your name" />
                    </div>
                    <div className="space-y-1">
                      <Label>Email *</Label>
                      <Input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="you@example.com" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Payment is processed via Stripe. Your card details are entered securely on the payment page.
                  </p>
                </div>
                <div className="p-4 border-t space-y-2">
                  <button
                    className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: primary }}
                    disabled={processing || !custName.trim() || !custEmail.trim()}
                    onClick={checkout}
                  >
                    {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {processing ? "Processing..." : `Pay ${store.currency} ${cartTotal.toFixed(2)}`}
                  </button>
                  <button className="w-full text-sm text-gray-500 py-1" onClick={() => setCheckoutStep("cart")}>
                    ← Back to Cart
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <ShoppingCart className="h-10 w-10 mx-auto mb-2" />
                      <p>Your cart is empty</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((i) => (
                        <div key={i.product.id} className="flex gap-3 items-start">
                          {i.product.image_url && (
                            <img src={i.product.image_url} alt={i.product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{i.product.name}</p>
                            <p className="text-sm text-gray-500">{store.currency} {i.product.price.toFixed(2)}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <button className="p-1 rounded border" onClick={() => updateQty(i.product.id, -1)}>
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="text-sm w-5 text-center">{i.quantity}</span>
                              <button className="p-1 rounded border" onClick={() => updateQty(i.product.id, 1)}>
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-semibold">{store.currency} {(i.product.price * i.quantity).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {cart.length > 0 && (
                  <div className="p-4 border-t">
                    <div className="flex justify-between font-semibold mb-3">
                      <span>Total</span>
                      <span>{store.currency} {cartTotal.toFixed(2)}</span>
                    </div>
                    <button
                      className="w-full py-3 rounded-xl text-white font-semibold"
                      style={{ background: primary }}
                      onClick={() => setCheckoutStep("details")}
                    >
                      Checkout
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
