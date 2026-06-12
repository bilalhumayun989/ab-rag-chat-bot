const BASE_URL = 'http://localhost:5000';

async function testChat(endpoint, message, expected) {
    console.log(`\nTesting [${endpoint}] with message: "${message}"`);
    if (expected) {
        console.log(`Expected: ${expected}`);
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Error:', data);
            return;
        }

        console.log('--- Full Response Data ---');
        console.log(JSON.stringify(data, null, 2));
        return data;
    } catch (err) {
        console.error('Error:', err.message);
    }
}

async function runTests() {
    const tests = [
        {
            name: 'General Info - History / Founders',
            endpoint: '/chat',
            messages: [
                'Who originally started the company and when did it begin?',
                'Can you tell me about the background history and founder of this group?',
            ],
            expected: 'Founded half a century ago by the Late Sheikh Mahmood Ahmad as Ahmad Brothers in Faisalabad, Pakistan. A.B. Exports Private Limited was established in 1996.',
        },
        {
            name: 'Operational Info - Stitching Output',
            endpoint: '/chat',
            messages: [
                'What is your overall monthly production output for stitched goods?',
                'How many items can your stitching department finish on a monthly basis?',
            ],
            expected: 'Monthly stitching output capacity is 1,670,000 finished pieces: 1,000,000 bed linen, 600,000 patient gowns and scrubs, and 70,000 workwear uniforms.',
        },
        {
            name: 'General Identity - Product Lines',
            endpoint: '/chat',
            messages: [
                'What kind of textile items do you specialize in manufacturing?',
                'What are the main product lines offered by your factory?',
            ],
            expected: 'Healthcare laundry and protective garments specialist with Healthcare Textiles, Hospitality Textiles, Home Textiles, Textile Fabrics, Flame Retardant Fabrics, Uniforms, and Lining/Pocketing Fabrics.',
        },
        {
            name: 'Healthcare - Curtain Features',
            endpoint: '/chat',
            messages: [
                'Do your medical curtains meet hospital safety and infection requirements?',
                'What special features do your hospital cubicle and window curtains have?',
            ],
            expected: 'Cubicle and window curtains can include antimicrobial fabrics for infection control, with easy maintenance, frequent cleaning, light management, and patient privacy.',
        },
        {
            name: 'Locations - Units / Departments',
            endpoint: '/chat',
            messages: [
                'Where are your different manufacturing units and departments located?',
                'Can you give me the physical addresses for your head office and operational divisions?',
            ],
            expected: 'Head Office and Stitching: Lasani Pulli, Sargodha Road, Faisalabad. AB Colors: 10-km, Sargodha Road, Faisalabad. AB Weaving: Plot No 67-M3 Industrial Area, Sahianwala, Faisalabad. AB Fabrics: 19-km off Multan Road, Lahore.',
        },
    ];

    for (const test of tests) {
        console.log(`\n\n=== ${test.name} ===`);
        for (const message of test.messages) {
            await testChat(test.endpoint, message, test.expected);
        }
    }
}

runTests();
