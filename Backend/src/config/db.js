const mongoose = require('mongoose');
const dns = require('dns');

// Helps `mongodb+srv://` (Atlas) lookups on networks with flaky DNS.
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

async function connectDB() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set (see Backend/.env.example)');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('connected to DB');
}

module.exports = connectDB;
