<?php

$config = require __DIR__ . '/../config.php';

$dsn = sprintf(
    'mysql:host=%s;dbname=%s;charset=%s',
    $config['host'],
    $config['name'],
    $config['charset']
);

$pdo = new PDO($dsn, $config['user'], $config['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

$count = (int)$pdo->query('SELECT COUNT(*) AS total FROM graph_nodes')->fetch()['total'];
if ($count > 0) {
    echo "graph_nodes already populated\n";
    exit(0);
}

$pdo->beginTransaction();
$nodeInsert = $pdo->prepare('INSERT INTO graph_nodes (external_ref, lat, lng) VALUES (:ref, :lat, :lng)');
$nodeInsert->execute(['ref' => 'N1', 'lat' => 27.7172, 'lng' => 85.3240]);
$nodeInsert->execute(['ref' => 'N2', 'lat' => 27.7190, 'lng' => 85.3280]);
$nodeInsert->execute(['ref' => 'N3', 'lat' => 27.7210, 'lng' => 85.3305]);
$nodeInsert->execute(['ref' => 'N4', 'lat' => 27.7235, 'lng' => 85.3340]);

$nodes = $pdo->query('SELECT id, external_ref FROM graph_nodes')->fetchAll();
$map = [];
foreach ($nodes as $node) {
    $map[$node['external_ref']] = (int)$node['id'];
}

$edgeInsert = $pdo->prepare(
    'INSERT INTO graph_edges (from_node_id, to_node_id, distance_km, travel_time_min, road_type, is_bidirectional)
     VALUES (:from_id, :to_id, :distance_km, :travel_time_min, :road_type, :is_bidirectional)'
);
$edgeInsert->execute([
    'from_id' => $map['N1'],
    'to_id' => $map['N2'],
    'distance_km' => 0.6,
    'travel_time_min' => 2.5,
    'road_type' => 'local',
    'is_bidirectional' => 1
]);
$edgeInsert->execute([
    'from_id' => $map['N2'],
    'to_id' => $map['N3'],
    'distance_km' => 0.7,
    'travel_time_min' => 3.0,
    'road_type' => 'local',
    'is_bidirectional' => 1
]);
$edgeInsert->execute([
    'from_id' => $map['N3'],
    'to_id' => $map['N4'],
    'distance_km' => 0.8,
    'travel_time_min' => 3.2,
    'road_type' => 'local',
    'is_bidirectional' => 1
]);
$edgeInsert->execute([
    'from_id' => $map['N1'],
    'to_id' => $map['N3'],
    'distance_km' => 1.1,
    'travel_time_min' => 4.0,
    'road_type' => 'main',
    'is_bidirectional' => 1
]);

$pdo->commit();
echo "Seeded graph_nodes and graph_edges\n";
