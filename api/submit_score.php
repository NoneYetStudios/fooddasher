<?php
/* POST api/submit_score.php
 * Body: {"name":"DASH_99","score":148,"deliveries":12,"shifts_completed":3,"peak_rating":4.92,"vehicle_id":"hatchback"}
 *
 * Duplicate handling: one row per (player name case-insensitive, vehicle_id) combo.
 * Updates only if score is higher (or tied with more deliveries / shifts / rating).
 */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    fd_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$raw = file_get_contents('php://input', false, null, 0, 4096);
$in = [];
if ($raw !== false && $raw !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $in = $decoded;
    }
}
if (!$in && !empty($_POST)) {
    $in = $_POST;
}

$rawName = $in['name'] ?? ($in['player_name'] ?? null);
$playerName = is_string($rawName) ? trim((string) preg_replace('/\s+/', ' ', $rawName)) : '';
if ($playerName === '' || strlen($playerName) > 12 || !preg_match('/^[A-Za-z0-9 _.\-!?]+$/', $playerName)) {
    fd_json(['ok' => false, 'error' => 'Name must be 1-12 characters: letters, numbers, spaces and _ . - ! ?'], 422);
}

$vehicleId = is_string($in['vehicle_id'] ?? null) ? trim($in['vehicle_id']) : '';
if (!in_array($vehicleId, FD_VEHICLES, true)) {
    fd_json(['ok' => false, 'error' => 'Unknown vehicle_id.'], 422);
}

function fd_int($v): ?int
{
    if (is_int($v)) {
        return $v;
    }
    if (is_string($v) && preg_match('/^\d{1,9}$/', $v)) {
        return (int) $v;
    }
    if (is_float($v) && $v >= 0 && $v < 1e9 && floor($v) == $v) {
        return (int) $v;
    }
    return null;
}

$score = fd_int($in['score'] ?? null);
$deliveries = fd_int($in['deliveries'] ?? null);
$shiftsCompleted = fd_int($in['shifts_completed'] ?? null);

$rawRating = $in['peak_rating'] ?? null;
$peakRating = null;
if (is_int($rawRating) || is_float($rawRating) || (is_string($rawRating) && is_numeric($rawRating))) {
    $peakRating = round((float) $rawRating, 2);
}

if ($score === null || $deliveries === null || $shiftsCompleted === null || $peakRating === null) {
    fd_json(['ok' => false, 'error' => 'Score, deliveries, shifts_completed, and peak_rating are required.'], 422);
}
if (
    $score < 0 || $score > 1000000 ||
    $deliveries < 0 || $deliveries > 5000 ||
    $shiftsCompleted < 1 || $shiftsCompleted > 500 ||
    $peakRating < 1.00 || $peakRating > 5.00
) {
    fd_json(['ok' => false, 'error' => 'Submitted run stats are out of range.'], 422);
}

// Plausibility checks
if ($deliveries > $shiftsCompleted * 8) {
    fd_json(['ok' => false, 'error' => 'Delivery count implausible for shifts completed.'], 422);
}
if ($score > $deliveries * 150 + $shiftsCompleted * 100 + 250) {
    fd_json(['ok' => false, 'error' => 'Score failed plausibility validation.'], 422);
}

$nameKey = strtolower($playerName);
$now = time();
$skipRateLimit = getenv('FD_SKIP_RATE_LIMIT') === '1';

try {
    $pdo = fd_db();

    $ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|fooddasher');
    if (!$skipRateLimit) {
        $pdo->exec('DELETE FROM rate_limit WHERE last_submit < ' . ($now - 3600));
        $st = $pdo->prepare('SELECT last_submit FROM rate_limit WHERE ip_hash = :h');
        $st->execute([':h' => $ipHash]);
        $last = $st->fetchColumn();
        if ($last !== false && ($now - (int) $last) < FD_MIN_SUBMIT_GAP) {
            fd_json(['ok' => false, 'error' => 'Slow down! Please wait a few seconds between submissions.'], 429);
        }
    }

    $pdo->beginTransaction();
    if (!$skipRateLimit) {
        $pdo->prepare('INSERT OR REPLACE INTO rate_limit (ip_hash, last_submit) VALUES (:h, :t)')
            ->execute([':h' => $ipHash, ':t' => $now]);
    }

    $st = $pdo->prepare(
        'SELECT id, player_name, score, deliveries, shifts_completed, peak_rating, created_at
         FROM scores
         WHERE name_key = :k AND vehicle_id = :v'
    );
    $st->execute([':k' => $nameKey, ':v' => $vehicleId]);
    $existing = $st->fetch();

    if (!$existing) {
        $pdo->prepare(
            'INSERT INTO scores (player_name, name_key, vehicle_id, score, deliveries, shifts_completed, peak_rating, created_at)
             VALUES (:n, :k, :v, :s, :d, :sh, :pr, :ca)'
        )->execute([
            ':n' => $playerName,
            ':k' => $nameKey,
            ':v' => $vehicleId,
            ':s' => $score,
            ':d' => $deliveries,
            ':sh' => $shiftsCompleted,
            ':pr' => $peakRating,
            ':ca' => $now,
        ]);
        $rowId = (int) $pdo->lastInsertId();
        $status = 'new';
        $best = [$playerName, $vehicleId, $score, $deliveries, $shiftsCompleted, $peakRating, $now];
    } elseif (
        $score > (int) $existing['score'] ||
        ($score === (int) $existing['score'] && $deliveries > (int) $existing['deliveries']) ||
        ($score === (int) $existing['score'] && $deliveries === (int) $existing['deliveries'] && $shiftsCompleted > (int) $existing['shifts_completed']) ||
        ($score === (int) $existing['score'] && $deliveries === (int) $existing['deliveries'] && $shiftsCompleted === (int) $existing['shifts_completed'] && $peakRating > (float) $existing['peak_rating'])
    ) {
        $rowId = (int) $existing['id'];
        $pdo->prepare(
            'UPDATE scores
             SET player_name = :n, score = :s, deliveries = :d, shifts_completed = :sh, peak_rating = :pr, created_at = :ca
             WHERE id = :id'
        )->execute([
            ':n' => $playerName,
            ':s' => $score,
            ':d' => $deliveries,
            ':sh' => $shiftsCompleted,
            ':pr' => $peakRating,
            ':ca' => $now,
            ':id' => $rowId,
        ]);
        $status = 'improved';
        $best = [$playerName, $vehicleId, $score, $deliveries, $shiftsCompleted, $peakRating, $now];
    } else {
        $rowId = (int) $existing['id'];
        $status = (
            $score === (int) $existing['score'] &&
            $deliveries === (int) $existing['deliveries'] &&
            $shiftsCompleted === (int) $existing['shifts_completed'] &&
            abs($peakRating - (float) $existing['peak_rating']) < 0.005
        ) ? 'duplicate' : 'not_improved';
        $best = [
            $existing['player_name'],
            $vehicleId,
            (int) $existing['score'],
            (int) $existing['deliveries'],
            (int) $existing['shifts_completed'],
            round((float) $existing['peak_rating'], 2),
            (int) $existing['created_at'],
        ];
    }

    $prune = $pdo->prepare(
        'DELETE FROM scores
         WHERE vehicle_id = :v
           AND id NOT IN (
             SELECT id FROM scores
             WHERE vehicle_id = :v2
             ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
             LIMIT :lim
           )'
    );
    $prune->bindValue(':v', $vehicleId, PDO::PARAM_STR);
    $prune->bindValue(':v2', $vehicleId, PDO::PARAM_STR);
    $prune->bindValue(':lim', FD_MAX_ROWS_PER_VEHICLE, PDO::PARAM_INT);
    $prune->execute();
    $pdo->commit();

    $rankOverall = fd_rank($pdo, $nameKey, $best[2], $best[3], $best[4], $best[5], $best[6], $rowId, null);
    $rankVehicle = fd_rank($pdo, $nameKey, $best[2], $best[3], $best[4], $best[5], $best[6], $rowId, $vehicleId);

    fd_json([
        'ok' => true,
        'status' => $status,
        'rank_overall' => $rankOverall,
        'rank_vehicle' => $rankVehicle,
        'best' => [
            'name' => $best[0],
            'player_name' => $best[0],
            'vehicle_id' => $best[1],
            'score' => $best[2],
            'deliveries' => $best[3],
            'shifts_completed' => $best[4],
            'peak_rating' => $best[5],
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fd_json(['ok' => false, 'error' => 'Could not save your score. Please try again.'], 500);
}
