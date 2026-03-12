const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Customer = require('./models/Customer');

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mernapp');
  console.log('--- USERS ---');
  const users = await User.find({});
  users.forEach(u => {
    console.log(`ID: ${u._id}, Name: ${u.name}, Role: ${u.role}`);
  });

  console.log('\n--- CUSTOMERS ---');
  const customers = await Customer.find({}).limit(5);
  customers.forEach(c => {
    console.log(`ID: ${c._id}, Name: ${c.name}, EnteredBy: ${c.enteredBy}`);
  });

  process.exit();
}

debug();
