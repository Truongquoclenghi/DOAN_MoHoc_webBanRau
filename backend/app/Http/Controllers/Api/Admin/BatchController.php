<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Batch (lô) management: receive harvests, record waste, preview FEFO picks. */
class BatchController extends Controller
{
    public function index(Product $product): JsonResponse
    {
        return response()->json(
            $product->batches()->with('farmPlot:id,name')->orderBy('expires_on')->get()
        );
    }

    public function store(Request $request, Product $product, InventoryService $inventory): JsonResponse
    {
        $data = $request->validate([
            'farm_plot_id' => ['nullable', 'integer', 'exists:farm_plots,id'],
            'batch_code' => ['nullable', 'string', 'max:50', 'unique:product_batches,batch_code'],
            'quantity_received' => ['required', 'integer', 'min:1'],
            'harvested_on' => ['required', 'date'],
            'expires_on' => ['required', 'date', 'after_or_equal:harvested_on'],
        ]);

        $batch = $inventory->receive(
            [...$data, 'product_id' => $product->id],
            $request->user()->id,
        );

        return response()->json($batch->load('farmPlot:id,name'), 201);
    }

    /** Which batches FEFO would pick for a given quantity, without changing stock. */
    public function fefoPreview(Request $request, Product $product, InventoryService $inventory): JsonResponse
    {
        $data = $request->validate(['quantity' => ['required', 'integer', 'min:1']]);

        $plan = collect($inventory->allocateFefo($product, $data['quantity']))->map(fn ($line) => [
            'batch_id' => $line['batch']->id,
            'batch_code' => $line['batch']->batch_code,
            'expires_on' => $line['batch']->expires_on->toDateString(),
            'quantity' => $line['quantity'],
        ]);

        return response()->json(['product' => $product->name, 'plan' => $plan->values()]);
    }

    public function waste(Request $request, ProductBatch $batch, InventoryService $inventory): JsonResponse
    {
        $data = $request->validate([
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $batch = $inventory->recordWaste($batch, $data['quantity'], $data['reason'], $request->user()->id);

        return response()->json($batch);
    }

    public function expireDue(InventoryService $inventory): JsonResponse
    {
        return response()->json(['expired_batches' => $inventory->expireDueBatches()]);
    }
}
