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
    const { limit } = req.query;

    const history = await cashFlowService.getProcessingHistory(
      limit ? parseInt(limit) : 20
    );

    res.status(200).json({ 
      success: true, 
      history,
      count: history.length 
    });

  } catch (error) {
    console.error('Error retrieving processing history:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve processing history',
      details: error.message 
    });
  }
}
