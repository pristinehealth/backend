require('dotenv').config();
const mongoose = require('mongoose');

async function checkOTP() {
    await mongoose.connect(process.env.MONGO_URI);
    const Staff = mongoose.connection.collection('staffs');
    
    // Find all
    const docs = await Staff.find({ email: 'franklinokomba@gmail.com' }).toArray();
    console.log("Found", docs.length, "documents");
    for (const doc of docs) {
        console.log(`staffid=${doc.staffid}, otpCode="${doc.otpCode}" (type: ${typeof doc.otpCode}), updated: ${doc.updatedAt}`);
    }

    process.exit(0);
}
checkOTP();
