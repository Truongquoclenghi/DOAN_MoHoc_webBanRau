<?php

use App\Http\Controllers\Api\Admin\BatchController;
use App\Http\Controllers\Api\Admin\CategoryController;
use App\Http\Controllers\Api\Admin\ComplaintController as AdminComplaintController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\FarmLogController;
use App\Http\Controllers\Api\Admin\FarmPlotController;
use App\Http\Controllers\Api\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Api\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\Admin\SubscriptionPlanController as AdminSubscriptionPlanController;
use App\Http\Controllers\Api\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\ComplaintController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PointController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\TraceController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
});

// ----- Public -----
Route::get('categories', [CatalogController::class, 'categories']);
Route::get('products', [CatalogController::class, 'products']);
Route::get('products/{product:slug}', [CatalogController::class, 'show']);
Route::get('subscription-plans', [CatalogController::class, 'subscriptionPlans']);
Route::get('trace/{traceCode}', [TraceController::class, 'show']);
Route::get('shipping/estimate', [CheckoutController::class, 'estimate']);

// Payment callbacks from VNPay (signature is verified in the controller).
Route::get('payments/vnpay/return', [PaymentController::class, 'vnpayReturn']);
Route::get('payments/vnpay/ipn', [PaymentController::class, 'vnpayIpn']);

// ----- Logged-in customers -----
Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);
    Route::put('me', [AuthController::class, 'updateProfile']);

    Route::get('cart', [CartController::class, 'index']);
    Route::post('cart', [CartController::class, 'store']);
    Route::patch('cart/{product}', [CartController::class, 'update']);
    Route::delete('cart/{product}', [CartController::class, 'destroy']);

    Route::post('checkout', [CheckoutController::class, 'store']);
    Route::get('orders', [OrderController::class, 'index']);
    Route::get('orders/{code}', [OrderController::class, 'show']);
    Route::post('orders/{code}/cancel', [OrderController::class, 'cancel']);
    Route::post('payments/mock/{code}/complete', [PaymentController::class, 'mockComplete']);

    Route::get('points', [PointController::class, 'index']);

    Route::get('subscriptions', [SubscriptionController::class, 'index']);
    Route::post('subscriptions', [SubscriptionController::class, 'store']);
    Route::patch('subscriptions/{subscription}', [SubscriptionController::class, 'update']);

    Route::get('complaints', [ComplaintController::class, 'index']);
    Route::post('complaints', [ComplaintController::class, 'store']);

    // ----- Administrators -----
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('dashboard', [DashboardController::class, 'summary']);
        Route::get('reports/revenue', [DashboardController::class, 'revenue']);
        Route::get('expiry-alerts', [DashboardController::class, 'expiryAlerts']);

        Route::apiResource('categories', CategoryController::class)->except(['show']);

        Route::apiResource('products', AdminProductController::class)->except(['show']);
        Route::get('products/{product}/batches', [BatchController::class, 'index']);
        Route::post('products/{product}/batches', [BatchController::class, 'store']);
        Route::get('products/{product}/fefo-preview', [BatchController::class, 'fefoPreview']);
        Route::post('batches/{batch}/waste', [BatchController::class, 'waste']);
        Route::post('batches/expire-due', [BatchController::class, 'expireDue']);

        Route::apiResource('farm-plots', FarmPlotController::class)->except(['show']);
        Route::apiResource('farm-logs', FarmLogController::class)->only(['index', 'store', 'destroy']);

        Route::get('orders', [AdminOrderController::class, 'index']);
        Route::patch('orders/{order}/status', [AdminOrderController::class, 'updateStatus']);

        Route::get('complaints', [AdminComplaintController::class, 'index']);
        Route::patch('complaints/{complaint}', [AdminComplaintController::class, 'update']);

        Route::get('users', [AdminUserController::class, 'index']);
        Route::patch('users/{user}', [AdminUserController::class, 'update']);

        Route::apiResource('subscription-plans', AdminSubscriptionPlanController::class)->except(['show']);
    });
});
