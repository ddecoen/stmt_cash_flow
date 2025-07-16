// Simple upload test without multer
export default async function handler(req, res) {
    console.log('Simple upload handler called');
    console.log('Method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Try to read the raw body
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            console.log('Body length:', body.length);
            console.log('Body preview:', body.substring(0, 200));
            
            res.status(200).json({
                success: true,
                message: 'Raw upload received',
                bodyLength: body.length,
                contentType: req.headers['content-type'],
                preview: body.substring(0, 100)
            });
        });
        
        req.on('error', (error) => {
            console.error('Request error:', error);
            res.status(500).json({
                error: 'Request processing failed',
                message: error.message
            });
        });
        
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({
            error: 'Handler failed',
            message: error.message,
            stack: error.stack
        });
    }
}