const mongoose = require('mongoose');
const Customer = require('./models/Customer');
require('dotenv').config();

const users = {
  admin: '69ad54f64f2a85e990c27b26',
  marketing: '69ad51c2bb9f55a373d0e775'
};

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB for seeding...');

    // Clear existing customers if you want a clean slate
    // await Customer.deleteMany({});

    const customers = [];
    const now = new Date();

    // Generate data for the last 30 days
    for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        
        // Add 2-5 customers per day
        const numCustomers = Math.floor(Math.random() * 4) + 2;
        
        for (let j = 0; j < numCustomers; j++) {
            customers.push({
                name: `Customer ${i}-${j}`,
                phone: `9999900${i}${j}`,
                visitedAt: date,
                reason: Math.random() > 0.3 ? 'purchased' : 'enquired',
                paymentStatus: Math.random() > 0.2 ? 'completed' : 'pending',
                amount: Math.floor(Math.random() * 500) + 50,
                enteredBy: Math.random() > 0.5 ? users.admin : users.marketing
            });
        }
    }

    await Customer.insertMany(customers);
    console.log(`Successfully seeded ${customers.length} customer records.`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seed();
