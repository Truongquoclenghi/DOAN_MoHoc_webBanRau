<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    public function categories(): JsonResponse
    {
        return response()->json(Category::orderBy('name')->get(['id', 'name', 'slug']));
    }

    public function products(Request $request): JsonResponse
    {
        $query = Product::query()
            ->where('is_active', true)
            ->with('category:id,name,slug')
            ->withSum(['batches as sellable_stock' => fn ($q) => $q->sellable()], 'quantity_on_hand');

        if ($slug = $request->query('category')) {
            $query->whereHas('category', fn ($q) => $q->where('slug', $slug));
        }

        if ($term = trim((string) $request->query('q'))) {
            $query->where('name', 'like', '%'.$term.'%');
        }

        $sort = $request->query('sort');
        if ($sort === 'price_asc') {
            $query->orderBy('price');
        } elseif ($sort === 'price_desc') {
            $query->orderByDesc('price');
        } else {
            $query->latest('id');
        }

        return response()->json($query->paginate(12));
    }

    public function show(Product $product): JsonResponse
    {
        abort_unless($product->is_active, 404);

        // Only batches that can still be sold are shown, each with its origin and expiry.
        $product->load([
            'category:id,name,slug',
            'batches' => fn ($q) => $q->sellable()
                ->with('farmPlot:id,code,name,location,certification')
                ->orderBy('expires_on'),
        ]);
        $product->setAttribute('sellable_stock', (int) $product->batches->sum('quantity_on_hand'));

        return response()->json($product);
    }

    public function subscriptionPlans(): JsonResponse
    {
        $plans = SubscriptionPlan::where('is_active', true)
            ->with('items.product:id,name,unit,price,is_active')
            ->get()
            ->map(function (SubscriptionPlan $plan) {
                $subtotal = $plan->items->sum(fn ($i) => ($i->product?->price ?? 0) * $i->quantity);

                return [
                    'id' => $plan->id,
                    'name' => $plan->name,
                    'description' => $plan->description,
                    'discount_percent' => $plan->discount_percent,
                    'subtotal' => $subtotal,
                    'total' => intdiv($subtotal * (100 - $plan->discount_percent), 100),
                    'items' => $plan->items->map(fn ($i) => [
                        'product_id' => $i->product_id,
                        'name' => $i->product?->name,
                        'unit' => $i->product?->unit,
                        'quantity' => $i->quantity,
                    ])->values(),
                ];
            });

        return response()->json($plans);
    }
}
