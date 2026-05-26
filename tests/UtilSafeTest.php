<?php
declare(strict_types=1);

use App\Util\Safe;

// str()
check(Safe::str(null) === '',    'str(null) → ""');
check(Safe::str(42) === '42',    'str(42) → "42"');
check(Safe::str(['x']) === '',   'str(array) → default ""');

// int()
check(Safe::int('5') === 5,   'int("5") → 5');
check(Safe::int('abc') === 0, 'int("abc") → default 0');
check(Safe::int(null) === 0,  'int(null) → default 0');

// float()
check(abs(Safe::float('3.14') - 3.14) < 0.0001, 'float("3.14") → 3.14');

// bool()
check(Safe::bool('true') === true,   'bool("true") → true');
check(Safe::bool('false') === false, 'bool("false") → false');
check(Safe::bool('yes') === true,    'bool("yes") → true');
check(Safe::bool('no') === false,    'bool("no") → false');
check(Safe::bool(null) === false,    'bool(null) → default false');

// arr()
check(Safe::arr(['x']) === ['x'], 'arr(["x"]) → ["x"]');
check(Safe::arr('str') === [],    'arr("str") → default []');

// get()
check(Safe::get(['a' => ['b' => 1]], 'a.b') === 1,           'get a.b → 1');
check(Safe::get(['a' => ['b' => 1]], 'a.c', 99) === 99,      'get missing a.c → 99');
check(Safe::get([], 'missing.key', 'default') === 'default', 'get missing.key → "default"');
