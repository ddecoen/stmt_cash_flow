const { CashFlowService } = require('../services/firestore');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const cashFlowService = new CashFlowService();
    const { statementData, filename, metadata } = req.body;

    if (!statementData) {
      res.status(400).json({ error: 'Statement data is required' });
      return;
    }

    const savedStatement = await cashFlowService.saveCashFlowStatement({
      statementData,
      filename: filename || 'unknown',
      metadata: metadata || {},
      source: 'web_upload'
    });

    res.status(200).json({
      success: true,
      id: savedStatement.id,
      message: 'Cash flow statement saved successfully'
    });

  } catch (error) {
    console.error('Error saving statement:', error);
    res.status(500).json({ 
      error: 'Failed to save cash flow statement',
      details: error.message 
    });
  }
}
