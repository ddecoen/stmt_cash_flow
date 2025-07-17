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
    const cashFlowService = new CashFlowService();
    const { id, limit } = req.query;

    if (id) {
      // Get specific statement by ID
      const statement = await cashFlowService.getCashFlowStatement(id);
      if (!statement) {
        res.status(404).json({ error: 'Statement not found' });
        return;
      }
      res.status(200).json({ success: true, statement });
    } else {
      // Get all statements with optional limit
      const statements = await cashFlowService.getAllCashFlowStatements(
        limit ? parseInt(limit) : 50
      );
      res.status(200).json({ success: true, statements });
    }

  } catch (error) {
    console.error('Error retrieving statements:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve cash flow statements',
      details: error.message 
    });
  }
}
