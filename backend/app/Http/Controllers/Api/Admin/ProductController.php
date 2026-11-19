<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Services\MediaStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::query()
            ->with('category:id,name')
            ->withSum(['batches as stock' => fn ($q) => $q->where('status', ProductBatch::STATUS_AVAILABLE)], 'quantity_on_hand')
            ->latest('id')
            ->paginate(20);

        return response()->json($products);
    }

    public function store(Request $request, MediaStorage $media): JsonResponse
    {
        $data = $this->validated($request, creating: true);

        $data['slug'] = Str::slug($data['name']).'-'.Str::lower(Str::random(4));
        if ($request->hasFile('image')) {
            $data['image_url'] = $media->store($request->file('image'), 'products');
        }

        return response()->json(Product::create($data), 201);
    }

    public function update(Request $request, Product $product, MediaStorage $media): JsonResponse
    {
        $data = $this->validated($request, creating: false);

        if ($request->hasFile('image')) {
            $data['image_url'] = $media->store($request->file('image'), 'products');
        }

        $product->update($data);

        return response()->json($product->fresh());
    }

    /** Products that already have sales history are deactivated rather than deleted. */
    public function destroy(Product $product): JsonResponse
    {
        $product->update(['is_active' => false]);

        return response()->json(['message' => 'Đã ngừng bán sản phẩm.']);
    }

    private function validated(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'name' => [$required, 'string', 'max:150'],
            'description' => ['nullable', 'string'],
            'unit' => [$required, 'string', 'max:20'],
            'price' => [$required, 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'image' => ['nullable', 'image', 'max:4096'],
        ]);
    }
}
