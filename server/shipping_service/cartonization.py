"""
Weight/dimension resolution + box selection (cartonization) for bulk shipment
creation.

Per order line the dimensions are resolved **item first, then product**:
  items.dimension_id -> shipping_boxes   (product-type box linked to the size)
  products.dimension_id -> shipping_boxes (product-type box linked to the product)
A line is "resolved" only when the chosen box has weight + L + W + H. If neither
level resolves, the order cannot be shipped.

Box selection is a volume-based greedy fit over the company's shipping_boxes of
type='box': it fills the fewest boxes whose combined volume covers the products.
Shipment weight = sum(product weights) + sum(chosen box tare weights).
"""
from typing import Any

#: Hard ceiling on boxes for one shipment — beyond this the order must be split.
MAX_BOXES = 200


def _complete(box: dict | None) -> bool:
    return bool(box and all(box.get(k) is not None for k in ("weight", "length", "width", "height")))


def resolve_order_lines(conn, company_id: str, items: list[dict]) -> tuple[list[dict], bool]:
    """Return (lines, all_resolved). Each line: name, qty, weight(kg), length/width/height(cm),
    resolved(bool), source('item'|'product'|None)."""
    item_ids = sorted({str(i.get("itemId")) for i in items if i.get("itemId")})
    dim_by_item: dict[str, dict] = {}
    if item_ids:
        rows = conn.execute(
            """
            SELECT i.id AS item_id,
                   sbi.weight AS iw, sbi.length AS il, sbi.width AS iwd, sbi.height AS ih,
                   sbp.weight AS pw, sbp.length AS pl, sbp.width AS pwd, sbp.height AS ph
            FROM items i
            JOIN variants v ON v.id = i.variant_id
            JOIN products p ON p.id = v.product_id
            LEFT JOIN shipping_boxes sbi ON sbi.id = i.dimension_id
            LEFT JOIN shipping_boxes sbp ON sbp.id = p.dimension_id
            WHERE i.company_id = %s AND i.id = ANY(%s)
            """,
            [company_id, item_ids],
        ).fetchall()
        dim_by_item = {r["item_id"]: r for r in rows}

    lines: list[dict] = []
    all_resolved = True
    for it in items:
        qty = int(it.get("quantity") or it.get("qty") or 1)
        r = dim_by_item.get(str(it.get("itemId")))
        item_box = {"weight": r["iw"], "length": r["il"], "width": r["iwd"], "height": r["ih"]} if r else None
        prod_box = {"weight": r["pw"], "length": r["pl"], "width": r["pwd"], "height": r["ph"]} if r else None
        # item first, then product — the whole box must be complete to count.
        chosen, source = (item_box, "item") if _complete(item_box) else \
                         ((prod_box, "product") if _complete(prod_box) else (None, None))
        resolved = chosen is not None
        all_resolved = all_resolved and resolved
        descriptors = [
            f"{it.get('sizeLabel') or 'Size'}: {it.get('size')}" if it.get("size") else "",
            f"Shade: {it.get('shade')}" if it.get("shade") else "",
        ]
        descriptor = " · ".join(value for value in descriptors if value)
        base_name = it.get("name") or it.get("variantName") or "Item"
        lines.append({
            "name": f"{base_name} ({descriptor})" if descriptor else base_name,
            "qty": qty,
            "weight": (chosen or {}).get("weight"),
            "length": (chosen or {}).get("length"),
            "width":  (chosen or {}).get("width"),
            "height": (chosen or {}).get("height"),
            "resolved": resolved,
            "source": source,
        })
    return lines, all_resolved


def _vol(b: dict) -> float:
    return float(b["length"]) * float(b["width"]) * float(b["height"])


def _fits(item: dict, box: dict) -> bool:
    """Does the item physically fit inside the box, in any orientation?

    Comparing volume alone is not enough: a 100x1x1 rod has a small volume but
    fits in nothing. Sorting both sides and comparing longest-to-longest is the
    standard check.
    """
    try:
        i = sorted(float(item[k]) for k in ("length", "width", "height"))
        b = sorted(float(box[k]) for k in ("length", "width", "height"))
    except (TypeError, ValueError, KeyError):
        return True          # unmeasurable — resolution already flagged it
    return all(side <= limit + 1e-9 for side, limit in zip(i, b))


def pick_boxes(lines: list[dict], boxes: list[dict]) -> dict:
    """Choose shipping boxes (type='box') to hold the resolved product lines.

    Returns {boxes:[{name,weight,length,width,height}], boxCount, productWeight,
             boxWeight, totalWeight, hasBox}.
    Volume-based greedy: repeatedly take the smallest box that covers the
    remaining product volume, else the largest box, until everything is covered.
    """
    resolved = [l for l in lines if l.get("resolved")]
    product_weight = round(sum(float(l["weight"]) * l["qty"] for l in resolved), 3)
    total_volume = sum(_vol(l) * l["qty"] for l in resolved)

    valid = [b for b in boxes if all(b.get(k) is not None for k in ("length", "width", "height"))]
    valid.sort(key=_vol)
    if not valid or total_volume <= 0:
        # No usable boxes → ship as a single package on product weight alone.
        return {"boxes": [], "boxCount": 0, "productWeight": product_weight,
                "boxWeight": 0.0, "totalWeight": product_weight, "hasBox": False}

    # An item that does not fit the biggest box cannot be packed at all. Volume
    # arithmetic alone would happily "solve" this by stacking many boxes, which
    # would manifest — and bill — a shipment that can never be packed.
    biggest = valid[-1]
    oversized = [l for l in resolved if not _fits(l, biggest)]
    if oversized:
        names = ", ".join(str(l.get("name") or "item") for l in oversized[:3])
        return {"boxes": [], "boxCount": 0, "productWeight": product_weight,
                "boxWeight": 0.0, "totalWeight": product_weight, "hasBox": False,
                "error": f"Too large for the biggest box ({biggest['name']}): {names}"}

    chosen: list[dict] = []
    remaining = total_volume
    guard = 0
    while remaining > 1e-9 and guard < MAX_BOXES:
        guard += 1
        fit = next((b for b in valid if _vol(b) >= remaining), None)
        box = fit or valid[-1]          # smallest that covers, else the largest
        chosen.append(box)
        remaining -= _vol(box)

    if remaining > 1e-9:
        # Ran out of boxes before covering the order. Reporting success here
        # would ship it under-boxed.
        return {"boxes": [], "boxCount": 0, "productWeight": product_weight,
                "boxWeight": 0.0, "totalWeight": product_weight, "hasBox": False,
                "error": f"Order needs more than {MAX_BOXES} boxes — split it into "
                         f"separate shipments"}

    box_weight = round(sum(float(b.get("weight") or 0) for b in chosen), 3)
    return {
        "boxes": [{"name": b["name"], "weight": b.get("weight"), "length": b["length"],
                   "width": b["width"], "height": b["height"]} for b in chosen],
        "boxCount": len(chosen),
        "productWeight": product_weight,
        "boxWeight": box_weight,
        "totalWeight": round(product_weight + box_weight, 3),
        "hasBox": True,
        "error": None,
    }
