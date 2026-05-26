<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/bootstrap.php';

$passed = 0;
$failed = 0;

function check(bool $expr, string $label): void
{
    global $passed, $failed;
    if ($expr) {
        echo "  \u{2713} $label\n";
        $passed++;
    } else {
        echo "  \u{2717} $label  <-- FAIL\n";
        $failed++;
    }
}

$dir = __DIR__;
foreach (glob("$dir/*Test.php") ?: [] as $file) {
    echo "\n── " . basename($file) . " ──\n";
    require $file;
}

echo "\n";
if ($failed > 0) {
    echo "FAILED  ($passed passed, $failed failed)\n";
    exit(1);
}
echo "OK  ($passed passed)\n";
