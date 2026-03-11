import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

async function testChat(endpoint, message) {
    console.log(`\nTesting [${endpoint}] with message: "${message}"`);
    try {
        const response = await axios.post(`${BASE_URL}${endpoint}`, { message });
        console.log('--- Full Response Data ---');
        console.log(JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

async function runTests() {
    // 1. Test General Info (Founders) from a regional endpoint (UK)
    await testChat('/chat/uk', 'Who founded Biz Axis?');

    // 2. Test Region-Specific Info (VAT) from KSA endpoint
    await testChat('/chat/ksa', 'What is the VAT rate in KSA?');

    // 3. Test General Info (What is Biz Axis?) from default endpoint
    await testChat('/chat', 'What does this website do?');

    // 4. Test Conversational Fillers
    await testChat('/chat', 'thank you');

    // 5. Test Greeting
    await testChat('/chat', 'hi');
}

runTests();
