// routeDebugger.js
// Add this file to your project root and import it in server.js

// Function to print all registered routes in an Express app
function printRoutes(app) {
    console.log('\n----- REGISTERED ROUTES -----');
    
    // Helper function to print route info
    function print(path, layer) {
      if (layer.route) {
        layer.route.stack.forEach(printRoute.bind(null, path, layer));
      } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(printLayer.bind(null, path + (layer.regexp.toString().replace('/^\\/', '').replace('?(?=\\/|$)/i', '') || '')));
      }
    }
    
    function printRoute(path, layer, route) {
      const method = Object.keys(route.method)[0].toUpperCase();
      console.log(`${method}\t${path + (layer.route?.path || '')}`);
    }
    
    function printLayer(path, layer) {
      if (layer.route) {
        print(path, layer);
      } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach(printLayer.bind(null, path + (layer.regexp.toString().replace('/^\\/', '').replace('?(?=\\/|$)/i', '') || '')));
      }
    }
    
    if (app._router && app._router.stack) {
      app._router.stack.forEach(printLayer.bind(null, ''));
    }
    
    console.log('-----------------------------\n');
  }
  
  // Export the function
  module.exports = { printRoutes };