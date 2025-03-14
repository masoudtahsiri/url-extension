<?php
/**
 * URL Checker - Backend API Component
 * Copyright © 2025 Refact, LLC
 * MIT License - See LICENSE file for details
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit(0);
}

// Set temp directory for Vercel
$tempDir = '/tmp';
if (!is_dir($tempDir)) {
    mkdir($tempDir, 0777, true);
}

// Get input and output file paths
$inputFile = $tempDir . '/input_' . time() . '.txt';
$outputFile = $tempDir . '/output_' . time() . '.txt';

// Get POST data
$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON data']);
    exit(1);
}

// Check if running from command line
$isCli = php_sapi_name() === 'cli';

// Get input and output file paths from command line arguments if running as CLI
if ($isCli && $argc >= 3) {
    $inputFile = $argv[1];
    $outputFile = $argv[2];
} else {
    // Handle web request
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    // Get POST data
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        exit(1);
    }
    
    // Create temporary files
    $tempDir = __DIR__ . '/../temp';
    if (!file_exists($tempDir)) {
        mkdir($tempDir, 0777, true);
    }
    
    $inputFile = $tempDir . '/input_' . time() . '.txt';
    $outputFile = $tempDir . '/output_' . time() . '.txt';
    
    // Write URLs to input file
    $urls = isset($data['urls']) ? $data['urls'] : [];
    if (empty($urls)) {
        http_response_code(400);
        echo json_encode(['error' => 'No URLs provided']);
        exit(1);
    }
    file_put_contents($inputFile, implode("\n", $urls));
}

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Function to validate URL
function isValidUrl($url) {
    // Clean the URL first
    $url = trim($url);
    
    // Add http:// if no protocol is specified
    if (!preg_match("~^(?:f|ht)tps?://~i", $url) && !preg_match("~^http://~i", $url)) {
        $url = "http://" . $url;
    }
    
    // Validate the URL
    return filter_var($url, FILTER_VALIDATE_URL) !== false;
}

// Function to check URL redirects
function checkUrl($url) {
    // Clean and validate URL
    $url = trim($url);
    if (!preg_match("~^(?:f|ht)tps?://~i", $url)) {
        $url = "http://" . $url;
    }

    // First request to get initial status
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Accept-Encoding: gzip, deflate, br',
            'Connection: keep-alive',
            'Cache-Control: no-cache',
            'Pragma: no-cache',
            'Sec-Ch-Ua: "Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile: ?0',
            'Sec-Ch-Ua-Platform: "macOS"',
            'Sec-Fetch-Dest: document',
            'Sec-Fetch-Mode: navigate',
            'Sec-Fetch-Site: none',
            'Sec-Fetch-User: ?1',
            'Upgrade-Insecure-Requests: 1'
        ],
        CURLOPT_ENCODING => '',  // Accept all encodings
        CURLOPT_REFERER => 'https://www.google.com/'  // Add a common referrer
    ]);

    $response = curl_exec($ch);
    $initialStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Now follow redirects with the same browser-like settings
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Accept-Encoding: gzip, deflate, br',
            'Connection: keep-alive',
            'Cache-Control: no-cache',
            'Pragma: no-cache',
            'Sec-Ch-Ua: "Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile: ?0',
            'Sec-Ch-Ua-Platform: "macOS"',
            'Sec-Fetch-Dest: document',
            'Sec-Fetch-Mode: navigate',
            'Sec-Fetch-Site: none',
            'Sec-Fetch-User: ?1',
            'Upgrade-Insecure-Requests: 1'
        ],
        CURLOPT_ENCODING => '',  // Accept all encodings
        CURLOPT_REFERER => 'https://www.google.com/'  // Add a common referrer
    ]);

    $response = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headers = substr($response, 0, $headerSize);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $redirectCount = curl_getinfo($ch, CURLINFO_REDIRECT_COUNT);
    $error = curl_error($ch);

    $redirectChain = [];
    
    // Parse headers to get redirect chain
    $headerGroups = explode("\r\n\r\n", $headers);
    $currentStatus = null;
    $currentUrl = $url;
    $allStatuses = [];
    $finalStatus = null;

    foreach ($headerGroups as $headerGroup) {
        if (empty(trim($headerGroup))) continue;
        
        $headerLines = explode("\r\n", $headerGroup);
        foreach ($headerLines as $line) {
            if (preg_match('/^HTTP\/\d\.\d\s+(\d{3})/', $line, $matches)) {
                $currentStatus = intval($matches[1]);
                $allStatuses[] = $currentStatus;
            } elseif (preg_match('/^Location:\s*(.+)$/i', $line, $matches) && $currentStatus) {
                $location = trim($matches[1]);
                // Handle relative URLs
                if (strpos($location, 'http') !== 0) {
                    if (strpos($location, '/') === 0) {
                        $parsedUrl = parse_url($currentUrl);
                        $location = $parsedUrl['scheme'] . '://' . $parsedUrl['host'] . $location;
                    } else {
                        $location = rtrim($currentUrl, '/') . '/' . ltrim($location, '/');
                    }
                }
                $redirectChain[] = [
                    'status' => $currentStatus,
                    'url' => $location
                ];
                $currentUrl = $location;
            }
        }
    }

    // Get the final status code (last status in the chain)
    $finalStatus = end($allStatuses);
    
    // If we have redirects and a final status
    if (!empty($redirectChain) && $finalStatus) {
        // Add the final status to the last redirect entry
        $lastIndex = count($redirectChain) - 1;
        $redirectChain[$lastIndex] = [
            'status' => $redirectChain[$lastIndex]['status'],
            'url' => $redirectChain[$lastIndex]['url'],
            'final_status' => $finalStatus
        ];
    }

    curl_close($ch);

    // Debug information
    error_log("URL Check Debug: " . print_r([
        'url' => $url,
        'initial_status' => $initialStatus,
        'final_url' => $finalUrl,
        'redirect_count' => $redirectCount,
        'redirect_chain' => $redirectChain,
        'all_statuses' => $allStatuses,
        'final_status' => $finalStatus,
        'headers' => $headers
    ], true));

    return [
        'source_url' => $url,
        'initial_status' => $initialStatus,
        'target_url' => $finalUrl,
        'redirect_chain' => $redirectChain,
        'error' => $error
    ];
}

try {
    // Read URLs from input file
    $urls = array_filter(explode("\n", file_get_contents($inputFile)), 'trim');

    if (empty($urls)) {
        throw new Exception('No URLs provided');
    }

    $totalUrls = count($urls);
    $processedUrls = 0;

    // Process URLs
    $results = [];
    foreach ($urls as $url) {
        $result = checkUrl($url);
        $results[] = $result;
        $processedUrls++;
        
        // Write progress to output file
        $progress = [
            'success' => true,
            'message' => 'Processing URLs',
            'progress' => [
                'current' => $processedUrls,
                'total' => $totalUrls
            ],
            'results' => $results
        ];
        
        // Write to output file and flush
        file_put_contents($outputFile, json_encode($progress) . "\n");
        if (function_exists('fflush')) {
            fflush(fopen($outputFile, 'a'));
        }
        
        // Add a small delay to prevent overwhelming the system
        usleep(100000); // 100ms delay
    }
    
    // Generate CSV file
    $timestamp = date('Y-m-d_H-i-s');
    $filename = "url_check_results_{$timestamp}.csv";
    $resultsDir = __DIR__ . '/../results';
    $filepath = $resultsDir . '/' . $filename;
    
    // Create results directory if it doesn't exist
    if (!is_dir($resultsDir)) {
        if (!mkdir($resultsDir, 0777, true)) {
            throw new Exception('Failed to create results directory');
        }
    }
    
    $fp = fopen($filepath, 'w');
    if ($fp === false) {
        throw new Exception('Failed to create results file');
    }
    
    // Write CSV header
    fputcsv($fp, ['Source URL', 'Initial Status', 'Target URL', 'Final Status', 'Error'], ',', '"', '\\');
    
    // Write results to CSV
    foreach ($results as $result) {
        // Get the final status code
        $finalStatus = '';
        if (!empty($result['redirect_chain'])) {
            $lastRedirect = end($result['redirect_chain']);
            $finalStatus = $lastRedirect['final_status'] ?? '';
        }
        
        fputcsv($fp, [
            $result['source_url'],
            $result['initial_status'],
            $result['target_url'],
            $finalStatus,
            $result['error'] ?? ''
        ], ',', '"', '\\');
    }
    
    fclose($fp);
    
    // Write results to output file
    $output = json_encode([
        'success' => true,
        'message' => 'URLs processed successfully',
        'file' => $filename,
        'results' => $results
    ]);
    
    if (file_put_contents($outputFile, $output) === false) {
        throw new Exception('Failed to write output file');
    }
    
} catch (Exception $e) {
    // Write error to output file
    $error = json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
    
    file_put_contents($outputFile, $error);
    exit(1);
} 