<?php
// canvas で作った PNG を受け取って out/ に置くだけの口。このディレクトリ限定で使う
$name = isset($_GET['name']) ? basename($_GET['name']) : '';
if (!preg_match('/^[A-Za-z0-9._-]+\.png$/', $name)) { http_response_code(400); echo 'bad name'; exit; }
$body = file_get_contents('php://input');
$comma = strpos($body, ',');
$b64 = $comma === false ? $body : substr($body, $comma + 1);
$bin = base64_decode($b64, true);
if ($bin === false || strlen($bin) < 1000) { http_response_code(400); echo 'bad data'; exit; }
file_put_contents(__DIR__ . '/out/' . $name, $bin);
echo 'ok ' . $name . ' ' . strlen($bin);
