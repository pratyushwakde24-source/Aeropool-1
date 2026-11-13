const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf8');

code = code.replace(/driverId:\s*availableDriver\.id/g, 'driverId: availableDriver?.id');
code = code.replace(/driverName:\s*availableDriver\.fullName/g, 'driverName: availableDriver?.fullName');
code = code.replace(/driverPhone:\s*availableDriver\.phone/g, 'driverPhone: availableDriver?.phone');

fs.writeFileSync('src/services/db.ts', code, 'utf8');
console.log('Replaced all remaining availableDriver usages in src/services/db.ts');
