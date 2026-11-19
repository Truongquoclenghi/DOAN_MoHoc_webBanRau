<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductBatch;
use Illuminate\Http\JsonResponse;

/** Public traceability page: what a QR code on a batch reveals to the customer. */
class TraceController extends Controller
{
    public function show(string $traceCode): JsonResponse
    {
        $batch = ProductBatch::query()
            ->with([
                'product:id,name,slug,unit,image_url',
                'farmPlot:id,code,name,location,area_m2,certification,description',
                'farmPlot.logs' => fn ($q) => $q->latest('logged_on')->limit(30),
            ])
            ->where('trace_code', strtoupper($traceCode))
            ->firstOrFail();

        return response()->json([
            'trace_code' => $batch->trace_code,
            'batch_code' => $batch->batch_code,
            'product' => $batch->product,
            'farm_plot' => $batch->farmPlot,
            'harvested_on' => $batch->harvested_on->toDateString(),
            'expires_on' => $batch->expires_on->toDateString(),
            'is_expired' => $batch->expires_on->isPast(),
            'logs' => $batch->farmPlot?->logs ?? [],
        ]);
    }
}
