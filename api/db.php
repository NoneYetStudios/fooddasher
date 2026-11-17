<?php
/* Food Dasher - shared leaderboard helpers (PHP 8+, SQLite via PDO). */

@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
error_reporting(E_ALL);

const FD_DB_PATH = __DIR__ . '/../data/leaderboard.sqlite';
const FD_BOARD_SIZE = 25;
const FD_MAX_ROWS_PER_VEHICLE = 200;
const FD_MIN_SUBMIT_GAP = 3; // seconds between submissions per IP
const FD_VEHICLES = ['scooter', 'hatchback', 'van', 'hover_moped'];

function fd_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fd_db(): PDO
{
    if (!extension_loaded('pdo_sqlite')) {
        fd_json(['ok' => false, 'error' => 'Server is missing the pdo_sqlite PHP extension.'], 500);
    }
    $dir = dirname(FD_DB_PATH);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    try {
        $pdo = new PDO('sqlite:' . FD_DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA busy_timeout = 4000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                name_key TEXT NOT NULL,
                vehicle_id TEXT NOT NULL,
                score INTEGER NOT NULL,
                deliveries INTEGER NOT NULL,
                shifts_completed INTEGER NOT NULL,
                peak_rating REAL NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE (name_key, vehicle_id)
            )'
        );
        $pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_scores_rank
             ON scores (score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC)'
        );
        $pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_scores_vehicle
             ON scores (vehicle_id, score DESC)'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS rate_limit (
                ip_hash TEXT PRIMARY KEY,
                last_submit INTEGER NOT NULL
            )'
        );
        return $pdo;
    } catch (Throwable $e) {
        fd_json(['ok' => false, 'error' => 'Leaderboard database unavailable. Is the data/ folder writable?'], 500);
    }
    return new PDO('sqlite::memory:');
}

function fd_supports_window_functions(PDO $pdo): bool
{
    $ver = (string) $pdo->query('SELECT sqlite_version()')->fetchColumn();
    return version_compare($ver, '3.25.0', '>=');
}

/** Fetch best-per-player leaderboard entries overall or filtered by vehicle_id. */
function fd_fetch_board(PDO $pdo, ?string $vehicleId, int $limit): array
{
    if (fd_supports_window_functions($pdo)) {
        $sql = 'WITH f AS (
                    SELECT * FROM scores
                    WHERE (:v IS NULL OR vehicle_id = :v2)
                ), best AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY name_key
                        ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
                    ) AS rn
                    FROM f
                )
                SELECT player_name, vehicle_id, score, deliveries, shifts_completed, peak_rating, created_at
                FROM best
                WHERE rn = 1
                ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
                LIMIT :n';
        $st = $pdo->prepare($sql);
        $st->bindValue(':v', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':v2', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':n', $limit, PDO::PARAM_INT);
    } else {
        $sql = 'SELECT a.player_name, a.vehicle_id, a.score, a.deliveries, a.shifts_completed, a.peak_rating, a.created_at
                FROM scores a
                WHERE (:v IS NULL OR a.vehicle_id = :v2)
                  AND NOT EXISTS (
                    SELECT 1 FROM scores b
                    WHERE b.name_key = a.name_key
                      AND (:v3 IS NULL OR b.vehicle_id = :v4)
                      AND (
                        b.score > a.score
                        OR (b.score = a.score AND (
                            b.deliveries > a.deliveries
                            OR (b.deliveries = a.deliveries AND (
                                b.shifts_completed > a.shifts_completed
                                OR (b.shifts_completed = a.shifts_completed AND (
                                    b.peak_rating > a.peak_rating
                                    OR (b.peak_rating = a.peak_rating AND (
                                        b.created_at < a.created_at
                                        OR (b.created_at = a.created_at AND b.id < a.id)
                                    ))
                                ))
                            ))
                        ))
                      )
                  )
                ORDER BY a.score DESC, a.deliveries DESC, a.shifts_completed DESC, a.peak_rating DESC, a.created_at ASC, a.id ASC
                LIMIT :n';
        $st = $pdo->prepare($sql);
        $st->bindValue(':v', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':v2', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':v3', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':v4', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':n', $limit, PDO::PARAM_INT);
    }

    $st->execute();
    $entries = [];
    $rank = 1;
    foreach ($st->fetchAll() as $row) {
        $entries[] = [
            'rank' => $rank++,
            'name' => $row['player_name'],
            'player_name' => $row['player_name'],
            'vehicle_id' => $row['vehicle_id'],
            'score' => (int) $row['score'],
            'deliveries' => (int) $row['deliveries'],
            'shifts_completed' => (int) $row['shifts_completed'],
            'peak_rating' => round((float) $row['peak_rating'], 2),
            'created_at' => (int) $row['created_at'],
        ];
    }
    return $entries;
}

/** 1-based best-per-player rank within the optional vehicle_id scope. */
function fd_rank(
    PDO $pdo,
    string $nameKey,
    int $fallbackScore,
    int $fallbackDeliveries,
    int $fallbackShifts,
    float $fallbackRating,
    int $fallbackCreated,
    int $fallbackId,
    ?string $vehicleId = null
): int {
    $selfSt = $pdo->prepare(
        'SELECT id, score, deliveries, shifts_completed, peak_rating, created_at
         FROM scores
         WHERE name_key = :nk
           AND (:v IS NULL OR vehicle_id = :v2)
         ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
         LIMIT 1'
    );
    $selfSt->bindValue(':nk', $nameKey, PDO::PARAM_STR);
    $selfSt->bindValue(':v', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->bindValue(':v2', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $selfSt->execute();
    $self = $selfSt->fetch();

    $s = $self ? (int) $self['score'] : $fallbackScore;
    $d = $self ? (int) $self['deliveries'] : $fallbackDeliveries;
    $sh = $self ? (int) $self['shifts_completed'] : $fallbackShifts;
    $pr = $self ? (float) $self['peak_rating'] : $fallbackRating;
    $ca = $self ? (int) $self['created_at'] : $fallbackCreated;
    $rid = $self ? (int) $self['id'] : $fallbackId;

    if (fd_supports_window_functions($pdo)) {
        $sql = 'WITH f AS (
                    SELECT * FROM scores
                    WHERE (:v IS NULL OR vehicle_id = :v2)
                ), best AS (
                    SELECT *, ROW_NUMBER() OVER (
                        PARTITION BY name_key
                        ORDER BY score DESC, deliveries DESC, shifts_completed DESC, peak_rating DESC, created_at ASC, id ASC
                    ) AS rn
                    FROM f
                )
                SELECT COUNT(*) FROM best
                WHERE rn = 1
                  AND (
                    score > :s
                    OR (score = :s2 AND deliveries > :d)
                    OR (score = :s3 AND deliveries = :d2 AND shifts_completed > :sh)
                    OR (score = :s4 AND deliveries = :d3 AND shifts_completed = :sh2 AND peak_rating > :pr)
                    OR (score = :s5 AND deliveries = :d4 AND shifts_completed = :sh3 AND peak_rating = :pr2 AND created_at < :ca)
                    OR (score = :s6 AND deliveries = :d5 AND shifts_completed = :sh4 AND peak_rating = :pr3 AND created_at = :ca2 AND id < :id)
                  )';
        $st = $pdo->prepare($sql);
        $st->bindValue(':v', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':v2', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(':s', $s, PDO::PARAM_INT);
        $st->bindValue(':s2', $s, PDO::PARAM_INT);
        $st->bindValue(':s3', $s, PDO::PARAM_INT);
        $st->bindValue(':s4', $s, PDO::PARAM_INT);
        $st->bindValue(':s5', $s, PDO::PARAM_INT);
        $st->bindValue(':s6', $s, PDO::PARAM_INT);
        $st->bindValue(':d', $d, PDO::PARAM_INT);
        $st->bindValue(':d2', $d, PDO::PARAM_INT);
        $st->bindValue(':d3', $d, PDO::PARAM_INT);
        $st->bindValue(':d4', $d, PDO::PARAM_INT);
        $st->bindValue(':d5', $d, PDO::PARAM_INT);
        $st->bindValue(':sh', $sh, PDO::PARAM_INT);
        $st->bindValue(':sh2', $sh, PDO::PARAM_INT);
        $st->bindValue(':sh3', $sh, PDO::PARAM_INT);
        $st->bindValue(':sh4', $sh, PDO::PARAM_INT);
        $st->bindValue(':pr', $pr);
        $st->bindValue(':pr2', $pr);
        $st->bindValue(':pr3', $pr);
        $st->bindValue(':ca', $ca, PDO::PARAM_INT);
        $st->bindValue(':ca2', $ca, PDO::PARAM_INT);
        $st->bindValue(':id', $rid, PDO::PARAM_INT);
        $st->execute();
        return (int) $st->fetchColumn() + 1;
    }

    $sql = 'SELECT COUNT(*) FROM scores a
            WHERE (:v IS NULL OR a.vehicle_id = :v2)
              AND NOT EXISTS (
                SELECT 1 FROM scores b
                WHERE b.name_key = a.name_key
                  AND (:v3 IS NULL OR b.vehicle_id = :v4)
                  AND (
                    b.score > a.score
                    OR (b.score = a.score AND (
                        b.deliveries > a.deliveries
                        OR (b.deliveries = a.deliveries AND (
                            b.shifts_completed > a.shifts_completed
                            OR (b.shifts_completed = a.shifts_completed AND (
                                b.peak_rating > a.peak_rating
                                OR (b.peak_rating = a.peak_rating AND (
                                    b.created_at < a.created_at
                                    OR (b.created_at = a.created_at AND b.id < a.id)
                                ))
                            ))
                        ))
                    ))
                  )
              )
              AND (
                a.score > :s
                OR (a.score = :s2 AND a.deliveries > :d)
                OR (a.score = :s3 AND a.deliveries = :d2 AND a.shifts_completed > :sh)
                OR (a.score = :s4 AND a.deliveries = :d3 AND a.shifts_completed = :sh2 AND a.peak_rating > :pr)
                OR (a.score = :s5 AND a.deliveries = :d4 AND a.shifts_completed = :sh3 AND a.peak_rating = :pr2 AND a.created_at < :ca)
                OR (a.score = :s6 AND a.deliveries = :d5 AND a.shifts_completed = :sh4 AND a.peak_rating = :pr3 AND a.created_at = :ca2 AND a.id < :id)
              )';
    $st = $pdo->prepare($sql);
    $st->bindValue(':v', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':v2', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':v3', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':v4', $vehicleId, $vehicleId === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $st->bindValue(':s', $s, PDO::PARAM_INT);
    $st->bindValue(':s2', $s, PDO::PARAM_INT);
    $st->bindValue(':s3', $s, PDO::PARAM_INT);
    $st->bindValue(':s4', $s, PDO::PARAM_INT);
    $st->bindValue(':s5', $s, PDO::PARAM_INT);
    $st->bindValue(':s6', $s, PDO::PARAM_INT);
    $st->bindValue(':d', $d, PDO::PARAM_INT);
    $st->bindValue(':d2', $d, PDO::PARAM_INT);
    $st->bindValue(':d3', $d, PDO::PARAM_INT);
    $st->bindValue(':d4', $d, PDO::PARAM_INT);
    $st->bindValue(':d5', $d, PDO::PARAM_INT);
    $st->bindValue(':sh', $sh, PDO::PARAM_INT);
    $st->bindValue(':sh2', $sh, PDO::PARAM_INT);
    $st->bindValue(':sh3', $sh, PDO::PARAM_INT);
    $st->bindValue(':sh4', $sh, PDO::PARAM_INT);
    $st->bindValue(':pr', $pr);
    $st->bindValue(':pr2', $pr);
    $st->bindValue(':pr3', $pr);
    $st->bindValue(':ca', $ca, PDO::PARAM_INT);
    $st->bindValue(':ca2', $ca, PDO::PARAM_INT);
    $st->bindValue(':id', $rid, PDO::PARAM_INT);
    $st->execute();
    return (int) $st->fetchColumn() + 1;
}
