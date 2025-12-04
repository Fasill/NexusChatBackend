// Quick database connection test
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  console.log('Testing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗');
  
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful!');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query test successful:', result);
    
    await prisma.$disconnect();
    console.log('✅ Disconnected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your .env file has DATABASE_URL set');
    console.error('2. Verify the connection string in Neon dashboard');
    console.error('3. Make sure the database is active (not paused)');
    console.error('4. Try removing channel_binding=require from connection string');
    console.error('5. Check if your network/firewall allows connections to port 5432');
    process.exit(1);
  }
}

testConnection();

