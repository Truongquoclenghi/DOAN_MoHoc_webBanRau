<?php

namespace App\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Uploads product photos, farm diary media and complaint images.
 * Uses Cloudinary (signed upload over HTTP) when configured, otherwise the local public disk.
 */
class MediaStorage
{
    /** @param  'image'|'video'  $resourceType */
    public function store(UploadedFile $file, string $folder, string $resourceType = 'image'): string
    {
        $cloud = config('cloudinary.cloud_name');
        $key = config('cloudinary.api_key');
        $secret = config('cloudinary.api_secret');

        if (filled($cloud) && filled($key) && filled($secret)) {
            return $this->uploadToCloudinary($file, $folder, $resourceType, $cloud, $key, $secret);
        }

        return Storage::disk('public')->url($file->store($folder, 'public'));
    }

    private function uploadToCloudinary(
        UploadedFile $file,
        string $folder,
        string $resourceType,
        string $cloud,
        string $key,
        string $secret,
    ): string {
        $timestamp = time();

        // Cloudinary signature: sorted params as key=value joined by &, plus the API secret, SHA-1.
        $toSign = "folder={$folder}&timestamp={$timestamp}";
        $signature = sha1($toSign.$secret);

        try {
            $response = Http::attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName())
                ->post("https://api.cloudinary.com/v1_1/{$cloud}/{$resourceType}/upload", [
                    'api_key' => $key,
                    'timestamp' => $timestamp,
                    'folder' => $folder,
                    'signature' => $signature,
                ])
                ->throw()
                ->json();
        } catch (RequestException $e) {
            // Fall back to local storage so an upload failure does not block the farm's workflow.
            report($e);

            return Storage::disk('public')->url($file->store($folder, 'public'));
        }

        return $response['secure_url'];
    }
}
