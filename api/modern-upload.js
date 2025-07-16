// Modern Vercel-compatible upload handler
import { IncomingForm } from 'formidable';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    console.log('Modern upload handler called');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const form = new IncomingForm();
        
        const parseForm = () => {
            return new Promise((resolve, reject) => {
                form.parse(req, (err, fields, files) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ fields, files });
                    }
                });
            });
        };
        
        const { fields, files } = await parseForm();
        
        console.log('Files received:', Object.keys(files));
        console.log('Fields received:', Object.keys(fields));
        
        res.status(200).json({
            success: true,
            message: 'Files processed successfully',
            fileCount: Object.keys(files).length,
            fieldCount: Object.keys(fields).length,
            files: Object.keys(files)
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
}