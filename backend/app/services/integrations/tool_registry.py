"""
E-commerce integration tool registry.

Each tool definition contains everything needed to:
  1. Build the OpenAI-format schema shown to the LLM.
  2. Execute the HTTP call against the user's API.
  3. Enforce permissions (destructive, public_safe, allow_destructive gate).

Tool name exposed to the model: "intg::{integration_id}::{tool_key}"
so _execute_tool() can route back to the correct integration.

path_params  — input keys substituted into the URL path  (e.g. {product_id})
query_params — sent as URL query string on GET/DELETE requests
body_params  — sent as JSON body on POST/PATCH requests
(any key not listed in path_params is inferred as query or body based on method)
"""

from __future__ import annotations

from typing import TypedDict


class ToolDef(TypedDict, total=False):
    key: str
    name: str           # label shown to model (without intg:: prefix)
    description: str
    method: str         # GET | POST | PATCH | DELETE
    path: str           # URL path appended to base_url; {var} = path param
    path_params: list[str]
    input_schema: dict
    group: str          # logical group within the integration type
    destructive: bool   # irreversible side-effect (delete, cancel, refund …)
    idempotent: bool    # safe to retry without side-effects
    public_safe: bool   # may be exposed on public agent share link
    requires_confirmation: bool  # should the model confirm before calling


# ── Customer-facing tools ─────────────────────────────────────────────────────

_ECOM_CUSTOMER: list[ToolDef] = [

    # Browse & Search
    {
        "key": "search_products",
        "name": "search_products",
        "description": "Search the product catalog by keyword, category, or filters. Returns a list of matching products with names, prices, and IDs.",
        "method": "GET",
        "path": "/products/search",
        "path_params": [],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "query":    {"type": "string",  "description": "Search keyword or phrase"},
                "category": {"type": "string",  "description": "Filter by category name"},
                "limit":    {"type": "integer", "description": "Max results to return (default 10)"},
                "page":     {"type": "integer", "description": "Page number for pagination"},
            },
            "required": ["query"],
        },
    },
    {
        "key": "get_product_details",
        "name": "get_product_details",
        "description": "Fetch full details for a specific product by its ID, including description, images, variants, and specs.",
        "method": "GET",
        "path": "/products/{product_id}",
        "path_params": ["product_id"],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product identifier"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "check_stock",
        "name": "check_stock",
        "description": "Check whether a product (and optionally a specific variant) is currently in stock.",
        "method": "GET",
        "path": "/products/{product_id}/stock",
        "path_params": ["product_id"],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product identifier"},
                "variant_id": {"type": "string", "description": "Specific variant (size, colour, etc.)"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "get_price",
        "name": "get_price",
        "description": "Get the current price of a product, including any active discounts or sale pricing.",
        "method": "GET",
        "path": "/products/{product_id}/price",
        "path_params": ["product_id"],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product identifier"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "get_recommendations",
        "name": "get_recommendations",
        "description": "Get related or compatible product recommendations for a given product.",
        "method": "GET",
        "path": "/products/{product_id}/recommendations",
        "path_params": ["product_id"],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product to get recommendations for"},
                "limit":      {"type": "integer", "description": "Max recommendations to return"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "check_compatibility",
        "name": "check_compatibility",
        "description": "Check whether a product is compatible with a specific vehicle or device (make, model, year).",
        "method": "POST",
        "path": "/products/compatibility",
        "path_params": [],
        "group": "browse",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id":    {"type": "string", "description": "Product to check"},
                "vehicle_make":  {"type": "string", "description": "Vehicle manufacturer (e.g. Toyota)"},
                "vehicle_model": {"type": "string", "description": "Vehicle model (e.g. Corolla)"},
                "vehicle_year":  {"type": "integer", "description": "Vehicle year"},
            },
            "required": ["product_id"],
        },
    },

    # Cart & Checkout
    {
        "key": "add_to_cart",
        "name": "add_to_cart",
        "description": "Add a product to the customer's cart.",
        "method": "POST",
        "path": "/cart/items",
        "path_params": [],
        "group": "cart",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string",  "description": "Product to add"},
                "quantity":   {"type": "integer", "description": "Number of units"},
                "variant_id": {"type": "string",  "description": "Specific product variant"},
            },
            "required": ["product_id", "quantity"],
        },
    },
    {
        "key": "view_cart",
        "name": "view_cart",
        "description": "Show the current contents of the customer's cart, including items, quantities, and totals.",
        "method": "GET",
        "path": "/cart",
        "path_params": [],
        "group": "cart",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "key": "update_cart_item",
        "name": "update_cart_item",
        "description": "Update the quantity of a cart item, or remove it by setting quantity to 0.",
        "method": "PATCH",
        "path": "/cart/items/{item_id}",
        "path_params": ["item_id"],
        "group": "cart",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "item_id":  {"type": "string",  "description": "Cart item identifier"},
                "quantity": {"type": "integer", "description": "New quantity (0 to remove)"},
            },
            "required": ["item_id", "quantity"],
        },
    },
    {
        "key": "apply_coupon",
        "name": "apply_coupon",
        "description": "Apply a discount or promo coupon code to the current cart.",
        "method": "POST",
        "path": "/cart/coupon",
        "path_params": [],
        "group": "cart",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Coupon or promo code"},
            },
            "required": ["code"],
        },
    },
    {
        "key": "generate_checkout_link",
        "name": "generate_checkout_link",
        "description": "Generate a secure checkout link for the customer to complete their purchase. Never process payment directly — always hand off via this link.",
        "method": "POST",
        "path": "/checkout",
        "path_params": [],
        "group": "cart",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "notes": {"type": "string", "description": "Optional order notes from the customer"},
            },
            "required": [],
        },
    },

    # Orders (customer)
    {
        "key": "place_order",
        "name": "place_order",
        "description": "Submit an order directly (if not using the checkout link flow). Confirm all details with the customer first.",
        "method": "POST",
        "path": "/orders",
        "path_params": [],
        "group": "orders",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "shipping_address": {"type": "object", "description": "Shipping address fields"},
                "payment_method":   {"type": "string", "description": "Payment method token or type"},
                "notes":            {"type": "string", "description": "Customer order notes"},
            },
            "required": ["shipping_address", "payment_method"],
        },
    },
    {
        "key": "check_order_status",
        "name": "check_order_status",
        "description": "Look up the current status and details of a customer's order.",
        "method": "GET",
        "path": "/orders/{order_id}",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order identifier"},
            },
            "required": ["order_id"],
        },
    },
    {
        "key": "get_order_history",
        "name": "get_order_history",
        "description": "List the customer's past orders with status and summary information.",
        "method": "GET",
        "path": "/orders",
        "path_params": [],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max orders to return"},
                "page":  {"type": "integer", "description": "Page number"},
            },
            "required": [],
        },
    },
    {
        "key": "request_cancellation",
        "name": "request_cancellation",
        "description": "Request cancellation of an order. This flags the order for staff review — it does not auto-cancel.",
        "method": "POST",
        "path": "/orders/{order_id}/cancel",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": True, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order to cancel"},
                "reason":   {"type": "string", "description": "Cancellation reason"},
            },
            "required": ["order_id", "reason"],
        },
    },
    {
        "key": "track_shipment",
        "name": "track_shipment",
        "description": "Get live delivery tracking information for a shipment by tracking number.",
        "method": "GET",
        "path": "/shipments/{tracking_number}",
        "path_params": ["tracking_number"],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "tracking_number": {"type": "string", "description": "Shipment tracking number"},
            },
            "required": ["tracking_number"],
        },
    },

    # Returns & Support
    {
        "key": "request_return",
        "name": "request_return",
        "description": "Initiate a return request for one or more items from an order.",
        "method": "POST",
        "path": "/returns",
        "path_params": [],
        "group": "returns",
        "destructive": True, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order to return items from"},
                "items":    {"type": "array",  "description": "List of item IDs to return", "items": {"type": "string"}},
                "reason":   {"type": "string", "description": "Return reason"},
            },
            "required": ["order_id", "items", "reason"],
        },
    },
    {
        "key": "check_return_status",
        "name": "check_return_status",
        "description": "Check the status of an existing return request.",
        "method": "GET",
        "path": "/returns/{return_id}",
        "path_params": ["return_id"],
        "group": "returns",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "return_id": {"type": "string", "description": "Return request identifier"},
            },
            "required": ["return_id"],
        },
    },
    {
        "key": "request_refund",
        "name": "request_refund",
        "description": "Submit a refund request for an order. Flags for staff approval — refunds are never auto-processed.",
        "method": "POST",
        "path": "/refunds",
        "path_params": [],
        "group": "returns",
        "destructive": True, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string",  "description": "Order to refund"},
                "reason":   {"type": "string",  "description": "Refund reason"},
                "amount":   {"type": "number",  "description": "Partial refund amount (omit for full refund)"},
            },
            "required": ["order_id", "reason"],
        },
    },
    {
        "key": "create_support_ticket",
        "name": "create_support_ticket",
        "description": "Escalate an issue by creating a support ticket for the human support team.",
        "method": "POST",
        "path": "/support/tickets",
        "path_params": [],
        "group": "returns",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "subject":     {"type": "string", "description": "Ticket subject"},
                "description": {"type": "string", "description": "Issue description"},
                "order_id":    {"type": "string", "description": "Related order ID (if applicable)"},
                "priority":    {"type": "string", "enum": ["low", "normal", "high"], "description": "Ticket priority"},
            },
            "required": ["subject", "description"],
        },
    },

    # Account
    {
        "key": "get_account_info",
        "name": "get_account_info",
        "description": "Retrieve the customer's account profile including name, email, and default shipping address.",
        "method": "GET",
        "path": "/account",
        "path_params": [],
        "group": "account",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "key": "update_account_info",
        "name": "update_account_info",
        "description": "Update the customer's contact or shipping details.",
        "method": "PATCH",
        "path": "/account",
        "path_params": [],
        "group": "account",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "name":  {"type": "string", "description": "Full name"},
                "email": {"type": "string", "description": "Email address"},
                "phone": {"type": "string", "description": "Phone number"},
            },
            "required": [],
        },
    },
    {
        "key": "view_saved_addresses",
        "name": "view_saved_addresses",
        "description": "List all saved shipping addresses on the customer's account.",
        "method": "GET",
        "path": "/account/addresses",
        "path_params": [],
        "group": "account",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },

    # Store Info
    {
        "key": "get_store_hours",
        "name": "get_store_hours",
        "description": "Get the store's opening hours and support availability.",
        "method": "GET",
        "path": "/store/hours",
        "path_params": [],
        "group": "store_info",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "key": "get_shipping_policy",
        "name": "get_shipping_policy",
        "description": "Retrieve the store's shipping and delivery policy.",
        "method": "GET",
        "path": "/store/shipping-policy",
        "path_params": [],
        "group": "store_info",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "key": "get_return_policy",
        "name": "get_return_policy",
        "description": "Retrieve the store's return and refund policy.",
        "method": "GET",
        "path": "/store/return-policy",
        "path_params": [],
        "group": "store_info",
        "destructive": False, "idempotent": True, "public_safe": True, "requires_confirmation": False,
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


# ── Admin / store-operator tools ──────────────────────────────────────────────

_ECOM_ADMIN: list[ToolDef] = [

    # Catalog
    {
        "key": "add_product",
        "name": "add_product",
        "description": "Create a new product in the catalog.",
        "method": "POST",
        "path": "/admin/products",
        "path_params": [],
        "group": "catalog",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "name":        {"type": "string",  "description": "Product name"},
                "description": {"type": "string",  "description": "Product description"},
                "price":       {"type": "number",  "description": "Base price"},
                "sku":         {"type": "string",  "description": "Stock-keeping unit code"},
                "category":    {"type": "string",  "description": "Category name"},
                "stock":       {"type": "integer", "description": "Initial stock quantity"},
            },
            "required": ["name", "price"],
        },
    },
    {
        "key": "update_product",
        "name": "update_product",
        "description": "Edit an existing product's details, price, description, or images.",
        "method": "PATCH",
        "path": "/admin/products/{product_id}",
        "path_params": ["product_id"],
        "group": "catalog",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id":  {"type": "string", "description": "Product to update"},
                "name":        {"type": "string", "description": "New name"},
                "description": {"type": "string", "description": "New description"},
                "price":       {"type": "number", "description": "New base price"},
                "category":    {"type": "string", "description": "New category"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "delete_product",
        "name": "delete_product",
        "description": "Permanently remove or archive a product from the catalog.",
        "method": "DELETE",
        "path": "/admin/products/{product_id}",
        "path_params": ["product_id"],
        "group": "catalog",
        "destructive": True, "idempotent": True, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string",  "description": "Product to delete"},
                "archive":    {"type": "boolean", "description": "Archive instead of hard-delete (recommended)"},
            },
            "required": ["product_id"],
        },
    },
    {
        "key": "list_products",
        "name": "list_products",
        "description": "Browse or search the full product catalog with filters.",
        "method": "GET",
        "path": "/admin/products",
        "path_params": [],
        "group": "catalog",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "query":    {"type": "string",  "description": "Search keyword"},
                "category": {"type": "string",  "description": "Filter by category"},
                "status":   {"type": "string",  "enum": ["active", "inactive", "all"], "description": "Visibility filter"},
                "limit":    {"type": "integer", "description": "Max results"},
                "page":     {"type": "integer", "description": "Page number"},
            },
            "required": [],
        },
    },
    {
        "key": "bulk_update_stock",
        "name": "bulk_update_stock",
        "description": "Update stock levels for multiple product SKUs in a single call.",
        "method": "POST",
        "path": "/admin/inventory/bulk-update",
        "path_params": [],
        "group": "catalog",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "updates": {
                    "type": "array",
                    "description": "List of {sku, quantity} objects",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sku":      {"type": "string"},
                            "quantity": {"type": "integer"},
                        },
                        "required": ["sku", "quantity"],
                    },
                },
            },
            "required": ["updates"],
        },
    },
    {
        "key": "update_product_category",
        "name": "update_product_category",
        "description": "Move a product to a different category.",
        "method": "PATCH",
        "path": "/admin/products/{product_id}/category",
        "path_params": ["product_id"],
        "group": "catalog",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product to move"},
                "category":   {"type": "string", "description": "New category name or ID"},
            },
            "required": ["product_id", "category"],
        },
    },
    {
        "key": "set_product_visibility",
        "name": "set_product_visibility",
        "description": "Show or hide a product in the storefront without deleting it.",
        "method": "PATCH",
        "path": "/admin/products/{product_id}/visibility",
        "path_params": ["product_id"],
        "group": "catalog",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string",  "description": "Product identifier"},
                "visible":    {"type": "boolean", "description": "True to show, false to hide"},
            },
            "required": ["product_id", "visible"],
        },
    },

    # Pricing
    {
        "key": "search_marketplace_price",
        "name": "search_marketplace_price",
        "description": "Check competitor prices for a product on external marketplaces.",
        "method": "GET",
        "path": "/admin/pricing/marketplace",
        "path_params": [],
        "group": "pricing",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product to benchmark"},
                "sku":        {"type": "string", "description": "SKU to benchmark"},
                "markets":    {"type": "array",  "description": "Marketplaces to check", "items": {"type": "string"}},
            },
            "required": [],
        },
    },
    {
        "key": "update_price",
        "name": "update_price",
        "description": "Change the base price of a product.",
        "method": "PATCH",
        "path": "/admin/products/{product_id}/price",
        "path_params": ["product_id"],
        "group": "pricing",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Product to reprice"},
                "price":      {"type": "number", "description": "New base price"},
                "currency":   {"type": "string", "description": "Currency code (e.g. USD)"},
            },
            "required": ["product_id", "price"],
        },
    },
    {
        "key": "apply_discount",
        "name": "apply_discount",
        "description": "Set a sale or promotional discount on a product.",
        "method": "PATCH",
        "path": "/admin/products/{product_id}/discount",
        "path_params": ["product_id"],
        "group": "pricing",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id":      {"type": "string", "description": "Product to discount"},
                "discount_type":   {"type": "string", "enum": ["percent", "fixed"], "description": "Discount type"},
                "discount_value":  {"type": "number", "description": "Discount amount or percentage"},
                "expires_at":      {"type": "string", "description": "ISO 8601 expiry datetime"},
            },
            "required": ["product_id", "discount_type", "discount_value"],
        },
    },
    {
        "key": "compare_pricing_history",
        "name": "compare_pricing_history",
        "description": "View the price change history for a product.",
        "method": "GET",
        "path": "/admin/products/{product_id}/pricing-history",
        "path_params": ["product_id"],
        "group": "pricing",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string",  "description": "Product identifier"},
                "limit":      {"type": "integer", "description": "Max history entries"},
            },
            "required": ["product_id"],
        },
    },

    # Orders (admin)
    {
        "key": "take_order",
        "name": "take_order",
        "description": "Create a new order on behalf of a customer (phone/walk-in orders).",
        "method": "POST",
        "path": "/admin/orders",
        "path_params": [],
        "group": "orders",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id":      {"type": "string", "description": "Customer account ID"},
                "items":            {"type": "array",  "description": "Order line items", "items": {"type": "object"}},
                "shipping_address": {"type": "object", "description": "Delivery address"},
                "notes":            {"type": "string", "description": "Internal order notes"},
            },
            "required": ["customer_id", "items"],
        },
    },
    {
        "key": "list_orders",
        "name": "list_orders",
        "description": "List orders with optional status, date, or customer filters.",
        "method": "GET",
        "path": "/admin/orders",
        "path_params": [],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "status":      {"type": "string",  "description": "Filter by order status"},
                "customer_id": {"type": "string",  "description": "Filter by customer"},
                "from_date":   {"type": "string",  "description": "Start date (ISO 8601)"},
                "to_date":     {"type": "string",  "description": "End date (ISO 8601)"},
                "limit":       {"type": "integer", "description": "Max results"},
                "page":        {"type": "integer", "description": "Page number"},
            },
            "required": [],
        },
    },
    {
        "key": "update_order_status",
        "name": "update_order_status",
        "description": "Update the status of an order (e.g. mark as shipped or delivered).",
        "method": "PATCH",
        "path": "/admin/orders/{order_id}/status",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id":        {"type": "string", "description": "Order identifier"},
                "status":          {"type": "string", "description": "New status (e.g. shipped, delivered, processing)"},
                "tracking_number": {"type": "string", "description": "Shipment tracking number"},
            },
            "required": ["order_id", "status"],
        },
    },
    {
        "key": "cancel_order",
        "name": "cancel_order",
        "description": "Cancel an order. Requires explicit confirmation — this action cannot be undone.",
        "method": "POST",
        "path": "/admin/orders/{order_id}/cancel",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": True, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order to cancel"},
                "reason":   {"type": "string", "description": "Cancellation reason"},
                "notify":   {"type": "boolean", "description": "Notify the customer by email"},
            },
            "required": ["order_id", "reason"],
        },
    },
    {
        "key": "edit_order",
        "name": "edit_order",
        "description": "Modify items or quantities on a pending order before it ships.",
        "method": "PATCH",
        "path": "/admin/orders/{order_id}",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order to modify"},
                "items":    {"type": "array",  "description": "Updated line items"},
                "notes":    {"type": "string", "description": "Updated notes"},
            },
            "required": ["order_id"],
        },
    },
    {
        "key": "generate_invoice",
        "name": "generate_invoice",
        "description": "Create or fetch the invoice PDF for an order.",
        "method": "POST",
        "path": "/admin/orders/{order_id}/invoice",
        "path_params": ["order_id"],
        "group": "orders",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order identifier"},
            },
            "required": ["order_id"],
        },
    },

    # Customers
    {
        "key": "list_customers",
        "name": "list_customers",
        "description": "Browse the customer list with optional search and filters.",
        "method": "GET",
        "path": "/admin/customers",
        "path_params": [],
        "group": "customers",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string",  "description": "Search by name or email"},
                "limit": {"type": "integer", "description": "Max results"},
                "page":  {"type": "integer", "description": "Page number"},
            },
            "required": [],
        },
    },
    {
        "key": "get_customer_details",
        "name": "get_customer_details",
        "description": "Get full profile and order history for a specific customer.",
        "method": "GET",
        "path": "/admin/customers/{customer_id}",
        "path_params": ["customer_id"],
        "group": "customers",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string", "description": "Customer identifier"},
            },
            "required": ["customer_id"],
        },
    },
    {
        "key": "update_customer_info",
        "name": "update_customer_info",
        "description": "Update contact or shipping details for a customer account.",
        "method": "PATCH",
        "path": "/admin/customers/{customer_id}",
        "path_params": ["customer_id"],
        "group": "customers",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string", "description": "Customer to update"},
                "name":        {"type": "string", "description": "Updated name"},
                "email":       {"type": "string", "description": "Updated email"},
                "phone":       {"type": "string", "description": "Updated phone"},
            },
            "required": ["customer_id"],
        },
    },

    # Inventory
    {
        "key": "check_low_stock",
        "name": "check_low_stock",
        "description": "List products that are at or below the low-stock threshold.",
        "method": "GET",
        "path": "/admin/inventory/low-stock",
        "path_params": [],
        "group": "inventory",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "threshold": {"type": "integer", "description": "Low-stock threshold quantity (default 10)"},
            },
            "required": [],
        },
    },
    {
        "key": "generate_sales_report",
        "name": "generate_sales_report",
        "description": "Generate a sales summary report for a date range, product, or category.",
        "method": "GET",
        "path": "/admin/reports/sales",
        "path_params": [],
        "group": "inventory",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "from_date":  {"type": "string", "description": "Report start date (ISO 8601)"},
                "to_date":    {"type": "string", "description": "Report end date (ISO 8601)"},
                "group_by":   {"type": "string", "enum": ["day", "week", "month", "product", "category"], "description": "Grouping dimension"},
                "category":   {"type": "string", "description": "Filter by category"},
                "product_id": {"type": "string", "description": "Filter by product"},
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "key": "generate_inventory_report",
        "name": "generate_inventory_report",
        "description": "Generate a full inventory snapshot showing current stock levels for all products.",
        "method": "GET",
        "path": "/admin/reports/inventory",
        "path_params": [],
        "group": "inventory",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filter by product category"},
                "status":   {"type": "string", "enum": ["active", "inactive", "all"]},
            },
            "required": [],
        },
    },

    # Fulfillment
    {
        "key": "create_shipping_label",
        "name": "create_shipping_label",
        "description": "Generate a shipping label for an order ready to be dispatched.",
        "method": "POST",
        "path": "/admin/fulfillment/shipping-labels",
        "path_params": [],
        "group": "fulfillment",
        "destructive": False, "idempotent": False, "public_safe": False, "requires_confirmation": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "Order to ship"},
                "carrier":  {"type": "string", "description": "Carrier name (e.g. DHL, FedEx, UPS)"},
                "service":  {"type": "string", "description": "Service level (e.g. standard, express)"},
                "weight_kg": {"type": "number", "description": "Package weight in kg"},
            },
            "required": ["order_id"],
        },
    },
    {
        "key": "admin_track_shipment",
        "name": "admin_track_shipment",
        "description": "Get delivery tracking details for any shipment (admin view with full history).",
        "method": "GET",
        "path": "/admin/fulfillment/shipments/{tracking_number}",
        "path_params": ["tracking_number"],
        "group": "fulfillment",
        "destructive": False, "idempotent": True, "public_safe": False, "requires_confirmation": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "tracking_number": {"type": "string", "description": "Shipment tracking number"},
            },
            "required": ["tracking_number"],
        },
    },
]


# ── Registry lookup ────────────────────────────────────────────────────────────

REGISTRY: dict[str, list[ToolDef]] = {
    "ecom_customer": _ECOM_CUSTOMER,
    "ecom_admin":    _ECOM_ADMIN,
}

GROUP_LABELS: dict[str, dict[str, str]] = {
    "ecom_customer": {
        "browse":     "Browse & Search",
        "cart":       "Cart & Checkout",
        "orders":     "Orders",
        "returns":    "Returns & Support",
        "account":    "Account",
        "store_info": "Store Info",
    },
    "ecom_admin": {
        "catalog":     "Catalog",
        "pricing":     "Pricing",
        "orders":      "Orders",
        "customers":   "Customers",
        "inventory":   "Inventory & Reports",
        "fulfillment": "Fulfillment",
    },
}


def get_tool(integration_type: str, tool_key: str) -> ToolDef | None:
    """Look up a single tool definition by integration type and key."""
    for t in REGISTRY.get(integration_type, []):
        if t["key"] == tool_key:
            return t
    return None


def get_group_tools(integration_type: str, group: str) -> list[ToolDef]:
    return [t for t in REGISTRY.get(integration_type, []) if t.get("group") == group]


def all_groups(integration_type: str) -> list[str]:
    seen: list[str] = []
    for t in REGISTRY.get(integration_type, []):
        g = t.get("group", "")
        if g and g not in seen:
            seen.append(g)
    return seen
