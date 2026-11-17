<?php
/* CLI-only dev seed script for Food Dasher leaderboard. */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "CLI only.\n";
    exit(1);
}

require __DIR__ . '/db.php';

$pdo = fd_db();
$now = time();

$samples = [
    ['HOTWHEELZ', 'hover_moped', 412, 26, 7, 4.96, $now - 7200],
    ['BURRITO_KNG', 'van', 318, 21, 6, 4.88, $now - 6400],
    ['PHO_DRIFT', 'hatchback', 224, 15, 4, 4.79, $now - 5100],
    ['MOPED_MIKE', 'scooter', 145, 11, 3, 4.65, $now - 4200],
    ['GOOSE_DODGR', 'van', 276, 18, 5, 4.84, $now - 3600],
    ['TIP_CHILLI', 'hover_moped', 365, 22, 6, 4.91, $now - 2400],
    ['SCOOT_STAR', 'scooter', 112, 9, 3, 4.52, $now - 1800],
    ['MAT_SNIPER', 'hatchback', 189, 14, 4, 4.72, $now - 900],
];

$st = $pdo->prepare(
    'INSERT OR IGNORE INTO scores (player_name, name_key, vehicle_id, score, deliveries, shifts_completed, peak_rating, created_at)
     VALUES (:n, :k, :v, :s, :d, :sh, :pr, :ca)'
);

$inserted = 0;
foreach ($samples as $row) {
    $st->execute([
        ':n' => $row[0],
        ':k' => strtolower($row[0]),
        ':v' => $row[1],
        ':s' => $row[2],
        ':d' => $row[3],
        ':sh' => $row[4],
        ':pr' => $row[5],
        ':ca' => $row[6],
    ]);
    $inserted += $st->rowCount();
}

echo "Seeded {$inserted} Food Dasher leaderboard entries.\n";
