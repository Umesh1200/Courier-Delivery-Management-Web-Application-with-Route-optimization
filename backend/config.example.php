<?php

return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'courier',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4'
    ],
    'khalti' => [
        'api_url' => 'https://dev.khalti.com/api/v2/',
        'secret_key' => 'your-khalti-secret-key',
        'website_url' => 'http://localhost:5173',
        'return_url' => 'http://localhost:5173/create-booking?payment=khalti'
    ]
];
