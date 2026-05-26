<?php
declare(strict_types=1);

namespace App\Http;

class Json
{
    public static function ok(array $data, int $code = 200, array $headers = []): never
    {
        http_response_code($code);
        header('Content-Type: application/json');
        foreach ($headers as $name => $value) {
            header("$name: $value");
        }
        echo json_encode($data, JSON_THROW_ON_ERROR);
        exit;
    }

    public static function error(string $message, int $code = 400): never
    {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode(['error' => $message], JSON_THROW_ON_ERROR);
        exit;
    }

    public static function notFound(string $message = 'Not found'): never
    {
        self::error($message, 404);
    }

    public static function unauthorized(string $message = 'Unauthorized'): never
    {
        self::error($message, 401);
    }

    public static function methodNotAllowed(): never
    {
        self::error('Method not allowed', 405);
    }

    public static function notModified(): never
    {
        http_response_code(304);
        exit;
    }
}
