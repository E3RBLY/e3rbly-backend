
// const http = require('http');

// // Configuration
// const API_BASE_URL = 'http://localhost:3001';
// const endpoints = [
//   { 
//     name: 'Health Check', 
//     path: '/',
//     method: 'GET',
//     expectedStatus: 200
//   },
//   { 
//     name: 'API Configuration', 
//     path: '/api/config',
//     method: 'GET',
//     expectedStatus: 200
//   },
//   { 
//     name: 'Arabic Analysis Status', 
//     path: '/api/analysis/status',
//     method: 'GET',
//     expectedStatus: 404 // Update to 200 if implemented
//   },
//   { 
//     name: 'Arabic Analysis (JSON)', 
//     path: '/api/analysis/analyze', 
//     method: 'POST', 
//     body: { arabicText: 'مرحبا بالعالم' },
//     expectedStatus: 200,
//     validate: (data) => data.tokens && Array.isArray(data.tokens)
//   },
//   { 
//     name: 'Arabic Analysis (Explanation)', 
//     path: '/api/analysis/analyze/text', 
//     method: 'POST', 
//     body: { arabicText: 'هيا بنا يا رجال' },
//     expectedStatus: 200,
//     validate: (data) => 
//       data.explanation && 
//       data.explanation.includes('الجملة الأصلية') &&
//       data.explanation.includes('الإعراب:')
//   },
//   { 
//     name: 'Generate Exercises', 
//     path: '/api/exercises/generate', 
//     method: 'POST', 
//     body: { 
//       level: 'beginner', 
//       type: 'vocabulary', 
//       topic: 'greetings', 
//       count: 3 
//     },
//     expectedStatus: 200
//   },
//   { 
//     name: 'Generate Quiz', 
//     path: '/api/quiz/generate', 
//     method: 'POST', 
//     body: { 
//       level: 'beginner', 
//       topic: 'daily conversation', 
//       questionCount: 5 
//     },
//     expectedStatus: 200
//   }
// ];

// /**
//  * Makes an HTTP request using native http module
//  */
// function makeRequest(options, body = null) {
//   return new Promise((resolve, reject) => {
//     const req = http.request(options, (res) => {
//       let data = '';
      
//       res.on('data', (chunk) => {
//         data += chunk;
//       });
      
//       res.on('end', () => {
//         let parsedData;
//         try {
//           parsedData = JSON.parse(data);
//         } catch (e) {
//           parsedData = { rawResponse: data };
//         }
        
//         resolve({
//           statusCode: res.statusCode,
//           statusMessage: res.statusMessage,
//           headers: res.headers,
//           data: parsedData
//         });
//       });
//     });
    
//     req.on('error', (error) => {
//       reject(error);
//     });
    
//     if (body) {
//       req.write(JSON.stringify(body));
//     }
    
//     req.end();
//   });
// }

// /**
//  * Tests all API endpoints with validation and timing
//  */
// async function testAllEndpoints() {
//   console.log('🔍 Starting API endpoint tests...\n');
//   let successCount = 0;
//   let failureCount = 0;

//   for (const endpoint of endpoints) {
//     const startTime = Date.now();
//     let testResult = { status: 'pending' };
    
//     try {
//       const { 
//         name, 
//         path, 
//         method = 'GET', 
//         body, 
//         expectedStatus = 200, 
//         validate 
//       } = endpoint;
      
//       const url = new URL(`${API_BASE_URL}${path}`);
      
//       console.log(`🚀 Testing: ${name}`);
//       console.log(`   ${method} ${path}`);
      
//       const options = {
//         hostname: url.hostname,
//         port: url.port,
//         path: url.pathname,
//         method: method,
//         headers: {
//           'Content-Type': 'application/json',
//           'Accept': 'application/json'
//         }
//       };

//       if (body) {
//         console.log(`   Request Body: ${JSON.stringify(body, null, 2)}`);
//       }

//       const response = await makeRequest(options, body);
//       const duration = Date.now() - startTime;

//       // Status code validation
//       const statusOk = response.statusCode === expectedStatus;
//       const statusIcon = statusOk ? '✅' : '❌';
//       testResult.statusCode = response.statusCode;
//       testResult.duration = duration;

//       console.log(`   ${statusIcon} Status: ${response.statusCode} (expected ${expectedStatus})`);
//       console.log(`   ⏱  Duration: ${duration}ms`);

//       // Response validation
//       if (validate) {
//         const validationResult = validate(response.data);
//         testResult.validation = validationResult ? 'pass' : 'fail';
//         console.log(`   🔍 Validation: ${validationResult ? 'PASS' : 'FAIL'}`);
        
//         if (!validationResult) {
//           console.log(`   ❗ Validation failed for ${name}`);
//         }
//       }

//       // Response handling
//       if (response.statusCode >= 400 || !statusOk) {
//         console.log(`   💬 Response: ${JSON.stringify(response.data, null, 2)}`);
//       } else {
//         const responsePreview = JSON.stringify(response.data)
//           .replace(/\\n/g, ' ') // Clean newlines
//           .substring(0, 120);   // Limit preview length
//         console.log(`   📋 Preview: ${responsePreview}...`);
//       }

//       // Update counters
//       if (statusOk && (!validate || testResult.validation === 'pass')) {
//         successCount++;
//         console.log(`   ✅ Success: ${name}\n`);
//       } else {
//         failureCount++;
//         console.log(`   ❌ Failed: ${name}\n`);
//       }

//     } catch (error) {
//       failureCount++;
//       console.error(`   🛑 Error: ${error.message}`);
//       console.log(`   ❌ Failed: ${endpoint.name}\n`);
//     }
    
//     console.log('―'.repeat(60));
//   }

//   // Print summary
//   console.log('\n🏁 Testing Summary:');
//   console.log(`   ✅ Successes: ${successCount}`);
//   console.log(`   ❌ Failures: ${failureCount}`);
//   console.log(`   🔍 Total Tests: ${endpoints.length}`);
//   console.log('\n💡 Tip: Check failed tests for detailed response information\n');
// }

// // Run the tests
// testAllEndpoints();

const http = require('http');

// Configuration
const API_BASE_URL = 'http://localhost:3001';
const REQUEST_TIMEOUT = 60000; // 60 seconds timeout for AI-heavy requests
const endpoints = [
  { 
    name: 'Health Check', 
    path: '/',
    method: 'GET',
    expectedStatus: 200,
    timeout: 5000,
    description: 'Checks if the API server is running'
  },
  { 
    name: 'API Configuration', 
    path: '/api/config',
    method: 'GET',
    expectedStatus: 200,
    timeout: 5000,
    description: 'Retrieves API configuration settings'
  },
  { 
    name: 'Arabic Analysis Status', 
    path: '/api/analysis/status',
    method: 'GET',
    expectedStatus: 404,
    timeout: 5000,
    description: 'Checks analysis service status (not implemented)'
  },
  { 
    name: 'Arabic Analysis (JSON)', 
    path: '/api/analysis/analyze', 
    method: 'POST', 
    body: { arabicText: 'مرحبا بالعالم' },
    expectedStatus: 200,
    timeout: 30000,
    description: 'Analyzes Arabic text and returns structured JSON output',
    validate: (data) => data.tokens && Array.isArray(data.tokens)
  },
  { 
    name: 'Arabic Analysis (Explanation)', 
    path: '/api/analysis/analyze/text', 
    method: 'POST', 
    body: { arabicText: 'هيا بنا يا رجال' },
    expectedStatus: 200,
    timeout: 30000,
    description: 'Analyzes Arabic text and returns a human-readable explanation',
    validate: (data) => 
      data.explanation && 
      data.explanation.includes('الجملة الأصلية') &&
      data.explanation.includes('الإعراب:')
  },
  { 
    name: 'Generate Grammar Exercises', 
    path: '/api/exercises/generate', 
    method: 'POST', 
    body: { 
      difficulty: 'intermediate',
      exerciseType: 'multiple-choice',
      count: 3
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Generates Arabic grammar exercises',
    validate: (data) => 
      data.exercises && 
      Array.isArray(data.exercises) && 
      data.exercises.length === 3 &&
      data.exercises[0].id && 
      data.exercises[0].text && 
      data.exercises[0].question
  },
  { 
    name: 'Generate Quiz', 
    path: '/api/quiz/generate', 
    method: 'POST', 
    body: { 
      topic: 'النحو العربي',
      difficulty: 'beginner',
      questionCount: 3
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Generates an Arabic quiz',
    validate: (data) => 
      data.quiz && 
      Array.isArray(data.quiz) && 
      data.quiz.length === 3 &&
      data.quiz[0].id &&
      data.quiz[0].questionText &&
      Array.isArray(data.quiz[0].options) &&
      data.quiz[0].options.length === 4
  }
];

/**
 * Makes an HTTP request using native http module with timeout
 */
function makeRequest(options, body = null, timeout = REQUEST_TIMEOUT) {
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
    
    // Set timeout handler
    req.setTimeout(timeout, () => {
      req.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
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
 * Format milliseconds as a human-readable time string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Tests all API endpoints with validation and timing
 */
async function testAllEndpoints() {
  console.log('🔍 Starting API endpoint tests...\n');
  const results = {
    success: 0,
    failure: 0,
    skipped: 0,
    total: endpoints.length,
    details: []
  };

  // Allow specifying specific tests via command line arguments
  const testsToRun = process.argv.slice(2);
  const hasFilters = testsToRun.length > 0;

  for (const endpoint of endpoints) {
    // Skip test if filters are active and this test isn't in the list
    if (hasFilters && !testsToRun.some(filter => endpoint.name.toLowerCase().includes(filter.toLowerCase()))) {
      results.skipped++;
      results.details.push({
        name: endpoint.name,
        status: 'skipped',
        message: 'Skipped due to filter'
      });
      continue;
    }

    const startTime = Date.now();
    let testResult = { 
      name: endpoint.name,
      path: endpoint.path,
      method: endpoint.method,
      status: 'pending'
    };
    
    console.log(`\n🚀 Testing: ${endpoint.name}`);
    console.log(`   ${endpoint.method} ${endpoint.path}`);
    
    if (endpoint.description) {
      console.log(`   📝 ${endpoint.description}`);
    }
    
    try {
      const { 
        path, 
        method = 'GET', 
        body, 
        expectedStatus = 200, 
        validate,
        timeout = REQUEST_TIMEOUT
      } = endpoint;
      
      const url = new URL(`${API_BASE_URL}${path}`);
      
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
        console.log(`   📤 Request Body: 
${JSON.stringify(body, null, 2)}`);
      }

      console.log(`   ⏱  Sending request... (timeout: ${formatDuration(timeout)})`);
      const response = await makeRequest(options, body, timeout);
      const duration = Date.now() - startTime;

      // Status code validation
      const statusOk = response.statusCode === expectedStatus;
      const statusIcon = statusOk ? '✅' : '❌';
      testResult.statusCode = response.statusCode;
      testResult.expectedStatus = expectedStatus;
      testResult.duration = duration;

      console.log(`   ${statusIcon} Status: ${response.statusCode} (expected ${expectedStatus})`);
      console.log(`   ⏱  Duration: ${formatDuration(duration)}`);

      // Content validation if provided
      let validationPassed = true;
      if (validate && statusOk) {
        try {
          validationPassed = validate(response.data);
          testResult.validation = validationPassed ? 'pass' : 'fail';
          console.log(`   🔍 Content Validation: ${validationPassed ? '✅ PASS' : '❌ FAIL'}`);
          
          if (!validationPassed) {
            console.log(`   ❗ Validation failed for ${endpoint.name}`);
          }
        } catch (validationError) {
          validationPassed = false;
          testResult.validation = 'error';
          testResult.validationError = validationError.message;
          console.log(`   ❌ Validation error: ${validationError.message}`);
        }
      }

      // Response handling - show full response on error or validation failure
      if (response.statusCode >= 400 || !statusOk || !validationPassed) {
        console.log(`   💬 Response: 
${JSON.stringify(response.data, null, 2)}`);
      } else {
        // For successful responses, show a preview
        const formatResponse = () => {
          const json = JSON.stringify(response.data);
          if (json.length <= 150) return json;
          
          // Get a cleaner preview for long responses
          return json.replace(/\\n/g, ' ')  // Clean newlines
                    .substring(0, 150) + '...'; // Limit preview length
        };
        
        console.log(`   📋 Preview: ${formatResponse()}`);
      }

      // Update counters and final status
      if (statusOk && (!validate || validationPassed)) {
        results.success++;
        testResult.status = 'success';
        console.log(`   ✅ Success: ${endpoint.name}`);
      } else {
        results.failure++;
        testResult.status = 'failure';
        testResult.reason = !statusOk ? 'wrong_status' : 'validation_failed';
        console.log(`   ❌ Failed: ${endpoint.name}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      results.failure++;
      testResult.status = 'error';
      testResult.error = error.message;
      testResult.duration = duration;
      
      console.error(`   🛑 Error (${formatDuration(duration)}): ${error.message}`);
      console.log(`   ❌ Failed: ${endpoint.name}`);
    }
    
    results.details.push(testResult);
    console.log('―'.repeat(60));
  }

  // Print summary
  console.log('\n🏁 Testing Summary:');
  console.log(`   ✅ Successes: ${results.success}`);
  console.log(`   ❌ Failures: ${results.failure}`);
  if (results.skipped > 0) {
    console.log(`   ⏭️  Skipped: ${results.skipped}`);
  }
  console.log(`   🔍 Total Tests: ${results.total}`);
  
  if (results.failure > 0) {
    console.log('\n❌ Failed Tests:');
    results.details
      .filter(r => r.status === 'failure' || r.status === 'error')
      .forEach(result => {
        console.log(`   - ${result.name}: ${result.error || result.reason || 'Test failed'}`);
      });
  }
  
  console.log('\n💡 Tips:');
  console.log('   - Run specific tests by adding test names as arguments: node test-api.js "Grammar" "Quiz"');
  console.log('   - AI endpoints may take longer or occasionally fail due to model overload');
  console.log('   - Try reducing the count of questions/exercises if tests timeout');
  
  return results;
}

// Run the tests
testAllEndpoints();