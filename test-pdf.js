const { jsPDF } = require("jspdf");
const fs = require("fs");

const doc = new jsPDF();
doc.text("Hello world!", 10, 10);
fs.writeFileSync("test.pdf", Buffer.from(doc.output('arraybuffer')));
console.log("PDF created");
