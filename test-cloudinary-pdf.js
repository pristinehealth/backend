const { jsPDF } = require("jspdf");
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL || 'cloudinary://821898791642688:sI5vKfJLQ1YOqve96TSFc7ckHXM@davolh3eu'
});

async function run() {
  const doc = new jsPDF();
  doc.text("Service Report", 10, 10);
  const pdfBase64 = doc.output('datauristring');
  
  try {
     const result = await cloudinary.uploader.upload(pdfBase64, {
         folder: 'pristine/reports'
     });
     console.log("Uploaded successfully:", result.secure_url);
  } catch (e) {
     console.error("Cloudinary error:", e);
  }
}
run();
