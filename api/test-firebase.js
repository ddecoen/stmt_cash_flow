const { CashFlowService } = require('../services/firestore');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Check environment variables
    const envCheck = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? 'Set' : 'Missing',
      FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'Set' : 'Missing'
    };

    console.log('Environment variables check:', envCheck);

    // Test Firebase connection
    const cashFlowService = new CashFlowService();
    
    // Try to get statements (should work even if empty)
    const statements = await cashFlowService.getAllCashFlowStatements(1);
    
    res.status(200).json({
      success: true,
      message: 'Firebase connection successful',
      environmentVariables: envCheck,
      statementsCount: statements.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Firebase test error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      environmentVariables: {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? 'Set' : 'Missing',
        FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'Set' : 'Missing'
      },
      timestamp: new Date().toISOString()
    });
  }
}
