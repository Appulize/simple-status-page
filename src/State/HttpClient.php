<?php
declare(strict_types=1);

namespace App\State;

class HttpClient
{
    public const CONNECT_TIMEOUT = 5;
    public const TIMEOUT         = 15;

    /**
     * Perform a single HTTP request and return body/status/headers.
     *
     * @param string                              $method  GET, POST, …
     * @param string                              $url
     * @param array<string, string>               $headers Request headers; ['Name' => 'value']
     * @param string|null                         $body    Raw request body (already encoded)
     * @return array{body: string, status: int, headers: array<string, string>}
     */
    public function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $ch = curl_init();
        if ($ch === false) {
            throw new \RuntimeException('curl_init failed');
        }

        $hdrLines = [];
        foreach ($headers as $k => $v) {
            $hdrLines[] = $k . ': ' . $v;
        }

        $responseHeaders = [];

        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => self::CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => self::TIMEOUT,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER     => $hdrLines,
            CURLOPT_HEADERFUNCTION => function ($_ch, string $hdr) use (&$responseHeaders): int {
                $len  = strlen($hdr);
                $line = trim($hdr);
                if ($line !== '' && str_contains($line, ':')) {
                    [$name, $value] = explode(':', $line, 2);
                    $responseHeaders[strtolower(trim($name))] = trim($value);
                }
                return $len;
            },
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $resp = curl_exec($ch);
        if ($resp === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException('cURL error: ' . $err);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return [
            'body'    => (string) $resp,
            'status'  => $status,
            'headers' => $responseHeaders,
        ];
    }
}
