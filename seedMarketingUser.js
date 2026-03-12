// simple script to create users (marketing and admin)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Create Marketing User
  const marketingEmail = 'marketing@gmail.com';
  const marketingExists = await User.findOne({ email: marketingEmail });
  if (marketingExists) {
    console.log('Marketing user already exists');
  } else {
    const marketingUser = new User({
      name: 'Marketing Staff',
      email: marketingEmail,
      password: 'Gokul@2004',
      role: 'marketing',
    });
    await marketingUser.save();
    console.log('✅ Created marketing user:', marketingUser);
  }

  // Create Admin User
  const adminEmail = 'admin@gmail.com';
  const adminExists = await User.findOne({ email: adminEmail });
  if (adminExists) {
    console.log('Admin user already exists');
  } else {
    const adminUser = new User({
      name: 'Admin User',
      email: adminEmail,
      password: 'Admin@2004',
      role: 'admin',
    });
    await adminUser.save();
    console.log('✅ Created admin user:', adminUser);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
