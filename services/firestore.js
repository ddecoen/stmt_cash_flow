const admin = require('firebase-admin');
const firebaseConfig = require('../config/firebase');

// Initialize Firebase Admin SDK
let db;

function initializeFirestore() {
  if (!admin.apps.length) {
    // Initialize with service account key (for server-side)
    // You'll need to add your service account key file or use environment variables
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId
      });
    } else {
      // For development, you can use application default credentials
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
  }
  
  db = admin.firestore();
  return db;
}

// Get Firestore instance
function getFirestore() {
  if (!db) {
    return initializeFirestore();
  }
  return db;
}

// Cash Flow Statement operations
class CashFlowService {
  constructor() {
    this.db = getFirestore();
    this.collection = 'cash_flow_statements';
  }

  // Save a cash flow statement
  async saveCashFlowStatement(data) {
    try {
      const docRef = await this.db.collection(this.collection).add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { id: docRef.id, ...data };
    } catch (error) {
      console.error('Error saving cash flow statement:', error);
      throw error;
    }
  }

  // Get a cash flow statement by ID
  async getCashFlowStatement(id) {
    try {
      const doc = await this.db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting cash flow statement:', error);
      throw error;
    }
  }

  // Get all cash flow statements
  async getAllCashFlowStatements(limit = 50) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const statements = [];
      snapshot.forEach(doc => {
        statements.push({ id: doc.id, ...doc.data() });
      });
      
      return statements;
    } catch (error) {
      console.error('Error getting cash flow statements:', error);
      throw error;
    }
  }

  // Update a cash flow statement
  async updateCashFlowStatement(id, data) {
    try {
      await this.db.collection(this.collection).doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { id, ...data };
    } catch (error) {
      console.error('Error updating cash flow statement:', error);
      throw error;
    }
  }

  // Delete a cash flow statement
  async deleteCashFlowStatement(id) {
    try {
      await this.db.collection(this.collection).doc(id).delete();
      return { success: true };
    } catch (error) {
      console.error('Error deleting cash flow statement:', error);
      throw error;
    }
  }

  // Save processed CSV data
  async saveProcessedData(filename, originalData, processedData) {
    try {
      const docRef = await this.db.collection('processed_data').add({
        filename,
        originalData,
        processedData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { id: docRef.id, filename, originalData, processedData };
    } catch (error) {
      console.error('Error saving processed data:', error);
      throw error;
    }
  }

  // Get processing history
  async getProcessingHistory(limit = 20) {
    try {
      const snapshot = await this.db.collection('processed_data')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const history = [];
      snapshot.forEach(doc => {
        history.push({ id: doc.id, ...doc.data() });
      });
      
      return history;
    } catch (error) {
      console.error('Error getting processing history:', error);
      throw error;
    }
  }
}

module.exports = {
  initializeFirestore,
  getFirestore,
  CashFlowService
};
