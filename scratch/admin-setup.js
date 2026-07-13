const { MongoClient } = require('mongodb');
const { betterAuth } = require('better-auth');
const { mongodbAdapter } = require('better-auth/adapters/mongodb');

const MONGO_URI = 'mongodb://NeighborNotes:tx8tNO3eYorV1iWV@ac-hblkeaq-shard-00-00.mldxc9s.mongodb.net:27017,ac-hblkeaq-shard-00-01.mldxc9s.mongodb.net:27017,ac-hblkeaq-shard-00-02.mldxc9s.mongodb.net:27017/neighbornotes?ssl=true&authSource=admin';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('1. Checking and dropping old buildingCode index...');
  try {
    const indexes = await db.collection('buildings').indexes();
    console.log('Current indexes on buildings:', indexes.map(i => i.name));
    
    // Check if buildingCode_1 exists
    const hasBuildingCodeIndex = indexes.some(i => i.name === 'buildingCode_1' || i.name === 'buildingCode');
    if (hasBuildingCodeIndex) {
      console.log('Dropping index: buildingCode_1...');
      await db.collection('buildings').dropIndex('buildingCode_1').catch(e => console.log('Error dropping buildingCode_1, trying buildingCode...'));
      await db.collection('buildings').dropIndex('buildingCode').catch(e => {});
      console.log('Index dropped successfully.');
    } else {
      console.log('No buildingCode index found.');
    }
  } catch (err) {
    console.error('Error handling indexes:', err.message);
  }

  console.log('\n2. Creating admin user: zabedfolio@gmail.com...');
  try {
    // Better Auth instance config
    const auth = betterAuth({
      database: mongodbAdapter(db, {
        client,
        transaction: false,
      }),
      emailAndPassword: {
        enabled: true,
      },
      user: {
        additionalFields: {
          role: { type: "string" },
          buildingId: { type: "string" },
        }
      }
    });

    // Check if user already exists
    const existingUser = await db.collection('user').findOne({ email: 'zabedfolio@gmail.com' });
    if (existingUser) {
      console.log('User already exists in DB. Deleting first to reset with new password...');
      await db.collection('user').deleteOne({ email: 'zabedfolio@gmail.com' });
      await db.collection('account').deleteMany({ userId: existingUser._id.toString() });
      await db.collection('session').deleteMany({ userId: existingUser._id.toString() });
    }

    // Call Better Auth to register the email and password
    const result = await auth.api.signUpEmail({
      body: {
        email: 'zabedfolio@gmail.com',
        password: 'zabed12345',
        name: 'Zabed Mahmud',
      }
    });

    if (result && result.user) {
      console.log('User registered with Better Auth. Updating role to "admin"...');
      await db.collection('user').updateOne(
        { email: 'zabedfolio@gmail.com' },
        { $set: { role: 'admin', buildingId: '' } }
      );
      console.log('✅ Success: Admin user created successfully!');
    } else {
      console.error('❌ Failed to register user.');
    }
  } catch (err) {
    console.error('Error creating user:', err.message);
  } finally {
    await client.close();
  }
}

main();
