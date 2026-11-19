<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\FarmLog;
use App\Services\MediaStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Cultivation diary (nhật ký canh tác) entries with photo or video evidence. */
class FarmLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = FarmLog::query()->with(['farmPlot:id,code,name', 'product:id,name'])->latest('logged_on');

        if ($plotId = $request->query('farm_plot_id')) {
            $query->where('farm_plot_id', $plotId);
        }
        if ($productId = $request->query('product_id')) {
            $query->where('product_id', $productId);
        }

        return response()->json($query->paginate(30));
    }

    public function store(Request $request, MediaStorage $media): JsonResponse
    {
        $data = $request->validate([
            'farm_plot_id' => ['required', 'integer', 'exists:farm_plots,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'type' => ['required', 'in:'.implode(',', FarmLog::TYPES)],
            'description' => ['required', 'string', 'max:2000'],
            'logged_on' => ['required', 'date'],
            'media' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,mp4', 'max:51200'],
        ]);

        $mediaUrl = null;
        $mediaType = null;

        if ($request->hasFile('media')) {
            $file = $request->file('media');
            $mediaType = str_starts_with((string) $file->getMimeType(), 'video') ? 'video' : 'image';
            $mediaUrl = $media->store($file, 'farm-logs', $mediaType);
        }

        $log = FarmLog::create([
            ...collect($data)->except('media')->all(),
            'media_url' => $mediaUrl,
            'media_type' => $mediaType,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($log->load(['farmPlot:id,code,name', 'product:id,name']), 201);
    }

    public function destroy(FarmLog $farmLog): JsonResponse
    {
        $farmLog->delete();

        return response()->json(['message' => 'Đã xóa nhật ký.']);
    }
}
