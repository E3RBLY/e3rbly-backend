
const http = require('http');

// Configuration
const API_BASE_URL = 'http://localhost:3001';
const endpoints = [
  { 
    name: 'Health Check', 
    path: '/',
    method: 'GET',
    expectedStatus: 200
  },
  { 
    name: 'API Configuration', 
    path: '/api/config',
    method: 'GET',
    expectedStatus: 200
  },
  { 
    name: 'Arabic Analysis Status', 
    path: '/api/analysis/status',
    method: 'GET',
    expectedStatus: 404 // Update to 200 if implemented
  },
  { 
    name: 'Arabic Analysis (JSON)', 
    path: '/api/analysis/analyze', 
    method: 'POST', 
    body: { arabicText: 'مرحبا بالعالم' },
    expectedStatus: 200,
    validate: (data) => data.tokens && Array.isArray(data.tokens)
  },
  { 
    name: 'Arabic Analysis (Explanation)', 
    path: '/api/analysis/analyze/text', 
    method: 'POST', 
    body: { arabicText: 'هيا بنا يا رجال' },
    expectedStatus: 200,
    validate: (data) => 
      data.explanation && 
      data.explanation.includes('الجملة الأصلية') &&
      data.explanation.includes('الإعراب:')
  },
  { 
    name: 'Generate Exercises', 
    path: '/api/exercises/generate', 
    method: 'POST', 
    body: { 
      level: 'beginner', 
      type: 'vocabulary', 
      topic: 'greetings', 
      count: 3 
    },
    expectedStatus: 200
  },
  { 
    name: 'Generate Quiz', 
    path: '/api/quiz/generate', 
    method: 'POST', 
    body: { 
      level: 'beginner', 
      topic: 'daily conversation', 
      questionCount: 5 
    },
    expectedStatus: 200
  }
];

/**
 * Makes an HTTP request using native http module
 */
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        let parsedData;
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = { rawResponse: data };
        }
        
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          data: parsedData
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Tests all API endpoints with validation and timing
 */
async function testAllEndpoints() {
  console.log('🔍 Starting API endpoint tests...\n');
  let successCount = 0;
  let failureCount = 0;

  for (const endpoint of endpoints) {
    const startTime = Date.now();
    let testResult = { status: 'pending' };
    
    try {
      const { 
        name, 
        path, 
        method = 'GET', 
        body, 
        expectedStatus = 200, 
        validate 
      } = endpoint;
      
      const url = new URL(`${API_BASE_URL}${path}`);
      
      console.log(`🚀 Testing: ${name}`);
      console.log(`   ${method} ${path}`);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      if (body) {
        console.log(`   Request Body: ${JSON.stringify(body, null, 2)}`);
      }

      const response = await makeRequest(options, body);
      const duration = Date.now() - startTime;

      // Status code validation
      const statusOk = response.statusCode === expectedStatus;
      const statusIcon = statusOk ? '✅' : '❌';
      testResult.statusCode = response.statusCode;
      testResult.duration = duration;

      console.log(`   ${statusIcon} Status: ${response.statusCode} (expected ${expectedStatus})`);
      console.log(`   ⏱  Duration: ${duration}ms`);

      // Response validation
      if (validate) {
        const validationResult = validate(response.data);
        testResult.validation = validationResult ? 'pass' : 'fail';
        console.log(`   🔍 Validation: ${validationResult ? 'PASS' : 'FAIL'}`);
        
        if (!validationResult) {
          console.log(`   ❗ Validation failed for ${name}`);
        }
      }

      // Response handling
      if (response.statusCode >= 400 || !statusOk) {
        console.log(`   💬 Response: ${JSON.stringify(response.data, null, 2)}`);
      } else {
        const responsePreview = JSON.stringify(response.data)
          .replace(/\\n/g, ' ') // Clean newlines
          .substring(0, 120);   // Limit preview length
        console.log(`   📋 Preview: ${responsePreview}...`);
      }

      // Update counters
      if (statusOk && (!validate || testResult.validation === 'pass')) {
        successCount++;
        console.log(`   ✅ Success: ${name}\n`);
      } else {
        failureCount++;
        console.log(`   ❌ Failed: ${name}\n`);
      }

    } catch (error) {
      failureCount++;
      console.error(`   🛑 Error: ${error.message}`);
      console.log(`   ❌ Failed: ${endpoint.name}\n`);
    }
    
    console.log('―'.repeat(60));
  }

  // Print summary
  console.log('\n🏁 Testing Summary:');
  console.log(`   ✅ Successes: ${successCount}`);
  console.log(`   ❌ Failures: ${failureCount}`);
  console.log(`   🔍 Total Tests: ${endpoints.length}`);
  console.log('\n💡 Tip: Check failed tests for detailed response information\n');
}

// Run the tests
testAllEndpoints();
