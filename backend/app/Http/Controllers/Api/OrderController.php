<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            $request->user()->orders()->with('items')->latest('id')->paginate(10)
        );
    }

    public function show(Request $request, string $code): JsonResponse
    {
        $order = $request->user()->orders()->with('items')->where('code', $code)->firstOrFail();

        return response()->json($order);
    }

    public function cancel(Request $request, string $code, OrderService $orders): JsonResponse
    {
        $order = $request->user()->orders()->where('code', $code)->firstOrFail();
        $orders->cancel($order);

        return response()->json($order->refresh()->load('items'));
    }
}
