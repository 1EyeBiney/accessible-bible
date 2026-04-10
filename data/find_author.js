const fs = require('fs');
const rawData = JSON.parse(fs.readFileSync('data.json', 'utf8'));

// Find the very first record where the father_name contains "Chrysostom"
const sample = rawData.find(entry => entry.father_name && entry.father_name.includes("Chrysostom"));

console.log("Here is exactly what one record looks like:");
console.log(sample);