import { Client } from 'xrpl';

async function testXRPLConnection() {
  const client = new Client('ws://localhost:6006');
  
  try {
    console.log('Connecting to XRPL node at ws://localhost:6006...');
    await client.connect();
    console.log('✅ XRPL Node Connected');
    
    const info = await client.request({ command: 'server_info' });
    console.log('Ledger:', info.result.info.validated_ledger?.seq || 'syncing');
    console.log('Network:', info.result.info.network_id || 'standalone');
    console.log('Status:', info.result.info.server_state);
    
    await client.disconnect();
    console.log('✅ Connection test passed');
    process.exit(0);
  } catch (e) {
    console.error('❌ Connection failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

testXRPLConnection();
