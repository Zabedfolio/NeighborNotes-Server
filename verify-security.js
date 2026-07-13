const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = 'mongodb://NeighborNotes:tx8tNO3eYorV1iWV@ac-hblkeaq-shard-00-00.mldxc9s.mongodb.net:27017,ac-hblkeaq-shard-00-01.mldxc9s.mongodb.net:27017,ac-hblkeaq-shard-00-02.mldxc9s.mongodb.net:27017/neighbornotes?ssl=true&authSource=admin';
const API_URL = 'http://localhost:5000/api';

// Known active user IDs from DB
const OWNER_ID = '6a5467baa0d815820f583acb';
const RESIDENT_ID = '6a5467baa0d815820f583ace';

// Helper for HTTP requests
async function makeRequest(method, path, userId, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'x-test-secret': 'super-security-secret',
  };
  if (userId) {
    headers['x-test-user-id'] = userId;
  }

  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_URL}${path}`, options);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;
    return { status: res.status, data };
  } catch (err) {
    return { status: 500, error: err.message };
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('Inserting test notices...');
  
  // 1. Create a notice belonging to a completely different building
  const fakeBuildingId = '999999999999999999999999';
  const fakeNoticeId = new ObjectId();
  await db.collection('notices').insertOne({
    _id: fakeNoticeId,
    buildingId: fakeBuildingId,
    authorId: '888888888888888888888888',
    title: 'Fake Secret Notice',
    description: 'This is in another building',
    category: 'Emergency',
    expiresAt: new Date(Date.now() + 86400000),
    isPinned: false,
    createdAt: new Date(),
  });

  // Fetch a notice owned by the Owner to test Resident edit access
  const ownerNotice = await db.collection('notices').findOne({ authorId: OWNER_ID });
  if (!ownerNotice) {
    console.error('Could not find a notice owned by Owner. Please run seed script first.');
    process.exit(1);
  }

  let failedTests = 0;

  console.log('\n--- STARTING SECURITY ASSERTS ---');

  // Test 1: Logged in Owner tries to DELETE a notice in another building (IDOR)
  console.log('Test 1: DELETE notice in another building...');
  const res1 = await makeRequest('DELETE', `/notices/${fakeNoticeId}`, OWNER_ID);
  if (res1.status === 403) {
    console.log('✅ Passed: Owner blocked from deleting notice in another building (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res1.status}.`);
    failedTests++;
  }

  // Test 2: Logged in Owner tries to PATCH a notice in another building
  console.log('Test 2: PATCH notice in another building...');
  const res2 = await makeRequest('PATCH', `/notices/${fakeNoticeId}`, OWNER_ID, { title: 'Hacked Title' });
  if (res2.status === 403) {
    console.log('✅ Passed: Owner blocked from patching notice in another building (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res2.status}.`);
    failedTests++;
  }

  // Test 3: Logged in Owner calls GET /api/notices passing another buildingId in query params
  console.log('Test 3: GET /notices trying to filter other buildingId...');
  const res3 = await makeRequest('GET', `/notices?buildingId=${fakeBuildingId}`, OWNER_ID);
  const foundFakeNotice = Array.isArray(res3.data) && res3.data.some(n => n._id.toString() === fakeNoticeId.toString());
  if (res3.status === 200 && !foundFakeNotice) {
    console.log('✅ Passed: Query parameter buildingId was ignored; fake notice was not returned.');
  } else {
    console.log(`❌ Failed: Got status ${res3.status}, found fake notice in list? ${foundFakeNotice}`);
    failedTests++;
  }

  // Test 4: Resident tries to edit a notice authored by the Owner in the same building
  console.log('Test 4: Resident edits notice authored by Owner...');
  const res4 = await makeRequest('PATCH', `/notices/${ownerNotice._id}`, RESIDENT_ID, { title: 'Resident Update' });
  if (res4.status === 403) {
    console.log('✅ Passed: Resident blocked from patching Owner\'s notice (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res4.status}.`);
    failedTests++;
  }

  // Test 5: Resident tries to DELETE a notice in a different building
  console.log('Test 5: Resident DELETE notice in another building...');
  const res5 = await makeRequest('DELETE', `/notices/${fakeNoticeId}`, RESIDENT_ID);
  if (res5.status === 403) {
    console.log('✅ Passed: Resident blocked from deleting notice in another building (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res5.status}.`);
    failedTests++;
  }

  // Test 6: Post comments to a notice in a different building
  console.log('Test 6: POST comment to notice in another building...');
  const res6 = await makeRequest('POST', `/comments`, OWNER_ID, { noticeId: fakeNoticeId.toString(), text: 'Spam' });
  if (res6.status === 403) {
    console.log('✅ Passed: Blocked commenting on notice in another building (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res6.status}.`);
    failedTests++;
  }

  // Test 7: Post reactions to a notice in a different building
  console.log('Test 7: POST reaction to notice in another building...');
  const res7 = await makeRequest('POST', `/reactions`, OWNER_ID, { noticeId: fakeNoticeId.toString(), type: 'acknowledge' });
  if (res7.status === 403) {
    console.log('✅ Passed: Blocked reacting to notice in another building (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res7.status}.`);
    failedTests++;
  }

  // Test 8: Create a notice with fake buildingId/authorId in body
  console.log('Test 8: POST notice with fake buildingId/authorId...');
  const res8 = await makeRequest('POST', `/notices`, OWNER_ID, {
    title: 'Security Notice',
    description: 'Bypassing checks',
    category: 'Rules',
    expiresAt: new Date(Date.now() + 86400000),
    buildingId: fakeBuildingId,
    authorId: '888888888888888888888888',
  });
  if (res8.status === 201 && res8.data.buildingId !== fakeBuildingId && res8.data.authorId !== '888888888888888888888888') {
    console.log(`✅ Passed: Notice created. Identity fields were overwritten by the server session (Building: ${res8.data.buildingId}).`);
    // Cleanup the posted notice
    await db.collection('notices').deleteOne({ _id: new ObjectId(res8.data._id) });
  } else {
    console.log(`❌ Failed: Notice posted with raw buildingId: ${res8.data?.buildingId}, authorId: ${res8.data?.authorId}`);
    failedTests++;
  }

  // Test 9: Try to PIN a notice as a resident
  console.log('Test 9: Resident tries to pin a notice...');
  const res9 = await makeRequest('PATCH', `/notices/${ownerNotice._id}/pin`, RESIDENT_ID, { isPinned: true });
  if (res9.status === 403) {
    console.log('✅ Passed: Resident blocked from pinning notice (403 Forbidden).');
  } else {
    console.log(`❌ Failed: Expected 403, got ${res9.status}.`);
    failedTests++;
  }

  // Test 10: Resident POSTs a report with a crafted buildingId — must land in THEIR building
  console.log('Test 10: Resident POST notice with fake buildingId — session scope wins...');
  const res10 = await makeRequest('POST', `/notices`, RESIDENT_ID, {
    title: 'Broken pump on floor 2',
    description: 'The water pump on floor 2 has been broken since Monday.',
    category: 'Maintenance',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    buildingId: fakeBuildingId,   // crafted — should be silently discarded
    authorId: '888888888888888888888888',  // crafted — should be overwritten
  });
  if (res10.status === 201 && res10.data.buildingId !== fakeBuildingId && res10.data.authorId === RESIDENT_ID) {
    console.log(`✅ Passed: Resident report created in their own building (${res10.data.buildingId}), not the fake one.`);
    await db.collection('notices').deleteOne({ _id: new ObjectId(res10.data._id) });
  } else {
    console.log(`❌ Failed: Status ${res10.status}, buildingId: ${res10.data?.buildingId}, authorId: ${res10.data?.authorId}`);
    failedTests++;
  }

  // Test 11: Resident tries to set status=resolved when editing their own notice — must be stripped
  console.log('Test 11: Resident tries to mark their own notice as resolved...');
  // Create a resident-owned notice first
  const residentNoticeRes = await makeRequest('POST', `/notices`, RESIDENT_ID, {
    title: 'Test resident notice',
    description: 'Created for status-stripping test.',
    category: 'Maintenance',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  if (residentNoticeRes.status === 201) {
    const residentNoticeId = residentNoticeRes.data._id;
    const res11 = await makeRequest('PATCH', `/notices/${residentNoticeId}`, RESIDENT_ID, { status: 'resolved' });
    const noticeInDb = await db.collection('notices').findOne({ _id: new ObjectId(residentNoticeId) });
    if (noticeInDb && noticeInDb.status !== 'resolved') {
      console.log(`✅ Passed: Resident status update was stripped — notice remains "${noticeInDb.status}".`);
    } else {
      console.log(`❌ Failed: Resident was able to set status to "resolved". DB value: ${noticeInDb?.status}`);
      failedTests++;
    }
    await db.collection('notices').deleteOne({ _id: new ObjectId(residentNoticeId) });
  } else {
    console.log(`❌ Failed: Could not create resident notice for test. Status: ${residentNoticeRes.status}`);
    failedTests++;
  }

  // Test 12: Owner CAN change status (triage a problem report)
  console.log('Test 12: Owner triages a Maintenance notice (sets status to in_progress)...');
  const res12 = await makeRequest('PATCH', `/notices/${ownerNotice._id}`, OWNER_ID, { status: 'in_progress' });
  if (res12.status === 200 && res12.data.status === 'in_progress') {
    console.log('✅ Passed: Owner successfully set notice status to "in_progress".');
    // Restore original status
    await makeRequest('PATCH', `/notices/${ownerNotice._id}`, OWNER_ID, { status: 'open' });
  } else {
    console.log(`❌ Failed: Expected status in_progress, got status ${res12.status}, status value: ${res12.data?.status}`);
    failedTests++;
  }

  // Cleanup fake notice from DB
  console.log('\nCleaning up test notices...');
  await db.collection('notices').deleteOne({ _id: fakeNoticeId });
  await client.close();

  if (failedTests === 0) {
    console.log(`\n🎉 ALL 12 SECURITY INTEGRATION TESTS COMPLETED SUCCESSFULLY!`);
  } else {
    console.log(`\n❌ SECURITY TESTS FAILED: ${failedTests} failures.`);
    process.exit(1);
  }
}

main();
