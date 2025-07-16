// Minimal health check endpoint with no dependencies
export default function handler(req, res) {
    console.log('Health check called');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        method: req.method,
        message: 'Server is running'
    });
}