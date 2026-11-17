<?php
/* GET api/leaderboard.php -> top 25 best-per-player scores (overall or by vehicle). */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    header('Allow: GET, HEAD');
    fd_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$vehicleId = null;
if (isset($_GET['vehicle_id']) && $_GET['vehicle_id'] !== '') {
    $v = is_string($_GET['vehicle_id']) ? trim($_GET['vehicle_id']) : '';
    if (!in_array($v, FD_VEHICLES, true)) {
        fd_json(['ok' => false, 'error' => 'Unknown vehicle_id.'], 422);
    }
    $vehicleId = $v;
}

$view = 'overall';
if (isset($_GET['view']) && $_GET['view'] !== '') {
    $vw = is_string($_GET['view']) ? trim($_GET['view']) : '';
    if (in_array($vw, ['overall', 'vehicle'], true)) {
        $view = $vw;
    }
}

$limit = FD_BOARD_SIZE;
if (isset($_GET['limit']) && is_string($_GET['limit']) && ctype_digit($_GET['limit'])) {
    $limit = max(1, min(FD_BOARD_SIZE, (int) $_GET['limit']));
}

try {
    $pdo = fd_db();
    $entries = fd_fetch_board($pdo, $vehicleId, $limit);
    fd_json([
        'ok' => true,
        'view' => $view,
        'filters' => [
            'vehicle_id' => $vehicleId,
        ],
        'entries' => $entries,
    ]);
} catch (Throwable $e) {
    fd_json(['ok' => false, 'error' => 'Could not read the leaderboard.'], 500);
}
