
///==========================================================================================================================================
const http = require('http');

// Configuration
const API_BASE_URL = 'http://localhost:3001';
const REQUEST_TIMEOUT = 60000; // 60 seconds timeout for AI-heavy requests

// Main API endpoints
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

// Grammar concepts endpoints
const grammarConceptsEndpoints = [
  {
    name: 'Get Grammar Explanation - Noun',
    path: '/api/grammar/explanation',
    method: 'POST',
    body: {
      conceptType: 'part_of_speech',
      conceptName: 'noun'
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Gets explanation and examples for nouns in Arabic grammar',
    validate: (data) => 
      data.type === 'part_of_speech' &&
      data.name === 'noun' &&
      data.nameArabic &&
      data.description &&
      Array.isArray(data.examples) &&
      data.examples.length >= 3 &&
      Array.isArray(data.tips) &&
      Array.isArray(data.relatedConcepts)
  },
  {
    name: 'Get Grammar Explanation - Verb Tense',
    path: '/api/grammar/explanation',
    method: 'POST',
    body: {
      conceptType: 'tense',
      conceptName: 'past'
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Gets explanation and examples for past tense in Arabic grammar',
    validate: (data) => 
      data.type === 'tense' &&
      data.name === 'past' &&
      data.nameArabic &&
      data.description &&
      Array.isArray(data.examples) &&
      Array.isArray(data.tips)
  },
  {
    name: 'Get Related Concepts - Default Count',
    path: '/api/grammar/related',
    method: 'POST',
    body: {
      conceptType: 'case',
      conceptName: 'nominative'
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Gets related concepts for nominative case in Arabic grammar',
    validate: (data) => 
      data.relatedConcepts &&
      Array.isArray(data.relatedConcepts) &&
      data.relatedConcepts.length === 3 &&
      data.relatedConcepts[0].type &&
      data.relatedConcepts[0].name &&
      data.relatedConcepts[0].nameArabic &&
      data.relatedConcepts[0].briefDescription
  },
  {
    name: 'Get Related Concepts - Custom Count',
    path: '/api/grammar/related',
    method: 'POST',
    body: {
      conceptType: 'gender',
      conceptName: 'masculine',
      count: 2
    },
    expectedStatus: 200,
    timeout: REQUEST_TIMEOUT,
    description: 'Gets 2 related concepts for masculine gender in Arabic grammar',
    validate: (data) => 
      data.relatedConcepts &&
      Array.isArray(data.relatedConcepts) &&
      data.relatedConcepts.length === 2
  },
  {
    name: 'Error - Invalid Concept Type',
    path: '/api/grammar/explanation',
    method: 'POST',
    body: {
      conceptType: 'invalid_type',
      conceptName: 'noun'
    },
    expectedStatus: 400,
    timeout: 5000,
    description: 'Tests error handling for invalid concept type',
    validate: (data) => data.error && data.message
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
 * Tests API endpoints with validation and timing
 */
async function testEndpoints(endpointList, testGroupName) {
  console.log(`🔍 Starting ${testGroupName} tests...\n`);
  const results = {
    success: 0,
    failure: 0,
    skipped: 0,
    total: endpointList.length,
    details: []
  };

  // Allow specifying specific tests via command line arguments
  const testsToRun = process.argv.slice(2);
  const hasFilters = testsToRun.length > 0;

  for (const endpoint of endpointList) {
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

      // Add auth token if needed for grammar endpoints
      if (path.includes('/api/grammar/')) {
        options.headers['Authorization'] = 'Bearer test-token';
      }

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
  console.log(`\n🏁 ${testGroupName} Summary:`);
  console.log(`   ✅ Successes: ${results.success}`);
  console.log(`   ❌ Failures: ${results.failure}`);
  if (results.skipped > 0) {
    console.log(`   ⏭️  Skipped: ${results.skipped}`);
  }
  console.log(`   🔍 Total Tests: ${results.total}`);
  
  if (results.failure > 0) {
    console.log(`\n❌ Failed ${testGroupName} Tests:`);
    results.details
      .filter(r => r.status === 'failure' || r.status === 'error')
      .forEach(result => {
        console.log(`   - ${result.name}: ${result.error || result.reason || 'Test failed'}`);
      });
  }
  
  return results;
}

/**
 * Tests all API endpoints (both main and grammar concepts)
 */
async function testAllEndpoints() {
  console.log('🔍 Starting comprehensive API testing...\n');
  
  // Determine which test groups to run
  const args = process.argv.slice(2);
  const runMainTests = !args.includes('--grammar-only');
  const runGrammarTests = !args.includes('--main-only');
  
  let mainResults = { success: 0, failure: 0, skipped: 0, total: 0 };
  let grammarResults = { success: 0, failure: 0, skipped: 0, total: 0 };
  
  // Run main API tests
  if (runMainTests) {
    console.log('==== MAIN API ENDPOINTS ====');
    mainResults = await testEndpoints(endpoints, 'API Endpoint');
  }
  
  // Run grammar concepts tests
  if (runGrammarTests) {
    console.log('\n==== GRAMMAR CONCEPTS ENDPOINTS ====');
    grammarResults = await testEndpoints(grammarConceptsEndpoints, 'Grammar Concepts');
  }
  
  // Print overall summary
  const totalResults = {
    success: mainResults.success + grammarResults.success,
    failure: mainResults.failure + grammarResults.failure,
    skipped: mainResults.skipped + grammarResults.skipped,
    total: mainResults.total + grammarResults.total
  };
  
  console.log('\n📊 OVERALL TESTING SUMMARY:');
  console.log(`   ✅ Total Successes: ${totalResults.success}`);
  console.log(`   ❌ Total Failures: ${totalResults.failure}`);
  if (totalResults.skipped > 0) {
    console.log(`   ⏭️  Total Skipped: ${totalResults.skipped}`);
  }
  console.log(`   🔍 Total Tests: ${totalResults.total}`);
  
  console.log('\n💡 Tips:');
  console.log('   - Run specific tests by adding test names as arguments: node test-api.js "Grammar" "Quiz"');
  console.log('   - Run only main API tests: node test-api.js --main-only');
  console.log('   - Run only grammar concept tests: node test-api.js --grammar-only');
  console.log('   - AI endpoints may take longer or occasionally fail due to model overload');
  console.log('   - Try reducing the count of questions/exercises if tests timeout');
  
  return totalResults;
}

// Run the tests if this script is executed directly
if (require.main === module) {
  testAllEndpoints();
}

module.exports = { 
  testAllEndpoints,
  testEndpoints,
  makeRequest,
  formatDuration
};